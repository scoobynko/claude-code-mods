export type Block = { type: string; [field: string]: unknown }
export type Message = { role: string; content: readonly Block[] }
export type Found = { id: string; label: string; fragment: string } & (
  | { kind: 'block'; mediaType: string; data: string }
  | { kind: 'path'; path: string }
)

type ToolUse = { name: string; input: unknown; said: string }

const IMAGE_PATH = /(?:~|\.{1,2})?\/?[\w@%+=,.\-/]+\.(?:png|jpe?g|gif|webp)\b/gi
const MAX_FRAGMENT = 400
const MAX_PATHS_PER_CALL = 8
const SAMPLE = 64
const UNKNOWN_TOOL: ToolUse = { name: 'tool', input: undefined, said: '' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : isRecord(value)
        ? Object.values(value).flatMap(strings)
        : []

const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_FRAGMENT)

const hash = (text: string) => {
  let sum = 0x811c9dc5
  for (let i = 0; i < text.length; i++) sum = Math.imul(sum ^ text.charCodeAt(i), 0x01000193)
  return (sum >>> 0).toString(36)
}

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const textOf = (blocks: readonly Block[]) =>
  squeeze(
    blocks
      .flatMap(block =>
        block.type === 'text' && typeof block.text === 'string' && !block.text.startsWith('<system-reminder>') ? [block.text] : [],
      )
      .join(' '),
  )

const toolLabel = (name: string) => {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
  return mcp ? `${mcp[2]} (${mcp[1]})` : name
}

export const imageId = (data: string) => {
  const middle = Math.floor(data.length / 2)
  return `${data.length.toString(36)}-${hash(data.slice(Math.max(0, middle - SAMPLE), middle + SAMPLE) + data.slice(-SAMPLE))}`
}

export const base64Image = (block: Block) => {
  const source = block.source
  if (block.type !== 'image' || !isRecord(source) || source.type !== 'base64') return undefined
  const { data, media_type: mediaType } = source
  return typeof data === 'string' && typeof mediaType === 'string' ? { data, mediaType } : undefined
}

export const imagePaths = (value: unknown) => [...new Set(strings(value).flatMap(text => text.match(IMAGE_PATH) ?? []))]

export function collect(messages: readonly Message[]): Found[] {
  const uses = new Map<string, ToolUse>()
  const found = new Map<string, Found>()
  const add = (one: Found) => {
    found.delete(one.id)
    found.set(one.id, one)
  }

  for (const message of messages) {
    const text = textOf(message.content)
    for (const block of message.content) {
      if (message.role === 'assistant') {
        if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          uses.set(block.id, { name: block.name, input: block.input, said: text })
        }
        continue
      }

      const pasted = base64Image(block)
      if (pasted) add({ kind: 'block', id: imageId(pasted.data), label: 'pasted', fragment: text, ...pasted })
      if (block.type !== 'tool_result') continue

      const use = uses.get(String(block.tool_use_id)) ?? UNKNOWN_TOOL
      const fragment = use.said || squeeze(`${use.name} ${strings(use.input).join(' ')}`)
      const filePath = isRecord(use.input) && typeof use.input.file_path === 'string' ? use.input.file_path : undefined
      const label = filePath ? `${toolLabel(use.name)} ${basename(filePath)}` : toolLabel(use.name)
      const images = (Array.isArray(block.content) ? (block.content as Block[]) : []).flatMap(inner => base64Image(inner) ?? [])
      for (const one of images) add({ kind: 'block', id: imageId(one.data), label, fragment, ...one })
      if (images.length > 0) continue

      for (const path of imagePaths(use.input).slice(0, MAX_PATHS_PER_CALL)) {
        add({ kind: 'path', id: `path-${hash(path)}`, path, label: `${toolLabel(use.name)} ${basename(path)}`, fragment })
      }
    }
  }

  return [...found.values()]
}
