export type Block = { type: string; [field: string]: unknown }
export type Message = { role: string; content: readonly Block[] }
export type Found = { id: string; label: string; fragment: string } & (
  | { kind: 'block'; mediaType: string; data: string; readFrom?: string }
  | { kind: 'path'; path: string; bases: readonly string[]; from: 'call' | 'text' }
)

export type Pending = Map<string, boolean>

type ToolUse = { name: string; input: unknown; said: string; bases: readonly string[] }

const EXTENSION = '\\.(?:png|jpe?g|gif|webp)'
const WORD = '\\p{L}\\p{N}_@%+.\\-/~'
const IMAGE_PATH = new RegExp(
  `"([^"\\n]{1,512}${EXTENSION})"|'([^'\\n]{1,512}${EXTENSION})'|(?<![${WORD}\\\\])((?:[${WORD}]|\\\\ ){1,512}${EXTENSION})(?![\\p{L}\\p{N}_])`,
  'giu',
)
const WHOLE_PATH = new RegExp(`^[^\\n]{1,512}${EXTENSION}$`, 'iu')
const CHANGE_DIR = /(?:^|[;&|(\n])\s*cd\s+(?:"([^"\n]+)"|'([^'\n]+)'|((?:[^\s;&|()\\]|\\.)+))/g
const MAX_FRAGMENT = 400
const MAX_PATHS_PER_CALL = 12
const MAX_BASES = 8
const SAMPLE = 64
const UNKNOWN_TOOL: ToolUse = { name: 'tool', input: undefined, said: '', bases: [] }

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

const unique = (values: string[]) => [...new Set(values)]

const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_FRAGMENT)

const hash = (text: string) => {
  let sum = 0x811c9dc5
  for (let i = 0; i < text.length; i++) sum = Math.imul(sum ^ text.charCodeAt(i), 0x01000193)
  return (sum >>> 0).toString(36)
}

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const unescaped = (text: string) => text.replace(/\\(.)/g, '$1')

const toolLabel = (name: string) => {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
  return mcp ? `${mcp[2]} (${mcp[1]})` : name
}

const writesFiles = (tool: string) => tool === 'Bash' || tool.startsWith('mcp__')

const innerBlocks = (block: Block) => (Array.isArray(block.content) ? (block.content as Block[]) : [])

const pathsIn = (text: string): string[] =>
  [...text.matchAll(IMAGE_PATH)].flatMap(match => {
    const quoted = match[1] ?? match[2]
    return quoted === undefined ? [unescaped(match[3] ?? '')] : [quoted, ...pathsIn(quoted)]
  })

const changedDirs = (command: unknown) =>
  typeof command === 'string' ? [...command.matchAll(CHANGE_DIR)].map(match => match[1] ?? match[2] ?? unescaped(match[3] ?? '')) : []

const isRooted = (path: string) => path.startsWith('/') || path.startsWith('~')

const proseOf = (blocks: readonly Block[]) =>
  blocks
    .flatMap(block =>
      block.type === 'text' && typeof block.text === 'string' && !block.text.startsWith('<system-reminder>') ? [block.text] : [],
    )
    .join(' ')

const resultText = (block: Block) => (typeof block.content === 'string' ? block.content : proseOf(innerBlocks(block)))

export const pathId = (path: string) => `path-${hash(path)}`

const candidateId = (path: string, bases: readonly string[]) => pathId([path, ...bases].join('\n'))

export const imageId = (data: string) => {
  const middle = Math.floor(data.length / 2)
  return `${data.length.toString(36)}-${hash(data.slice(Math.max(0, middle - SAMPLE), middle + SAMPLE) + data.slice(-SAMPLE))}`
}

const base64Image = (block: Block) => {
  const source = block.source
  if (block.type !== 'image' || !isRecord(source) || source.type !== 'base64') return undefined
  const { data, media_type: mediaType } = source
  return typeof data === 'string' && typeof mediaType === 'string' ? { data, mediaType } : undefined
}

const imagesIn = (blocks: readonly Block[]) => blocks.flatMap(block => base64Image(block) ?? [])

export const imagePaths = (value: unknown) => unique(strings(value).flatMap(pathsIn))

const namedFiles = (tool: string, input: unknown, printed = '') => {
  if (!writesFiles(tool)) return []
  const whole = tool === 'Bash' ? [] : strings(input).map(text => text.trim()).filter(text => WHOLE_PATH.test(text))
  const named = [...whole, ...imagePaths(input), ...imagePaths(printed)]
  return unique(named.map(path => path.replace(/^\.\//, ''))).slice(0, MAX_PATHS_PER_CALL)
}

export function arrivals(role: string | undefined, blocks: readonly Block[], pending: Pending) {
  const results = blocks.filter(block => block.type === 'tool_result')
  const images = imagesIn([...blocks, ...results.flatMap(innerBlocks)])
  for (const block of blocks) {
    if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string' && writesFiles(block.name)) {
      pending.set(block.id, namedFiles(block.name, block.input).length > 0)
    }
  }
  const named = results.filter(block => {
    const id = String(block.tool_use_id)
    const hasNamed = pending.get(id)
    pending.delete(id)
    return hasNamed === true || (hasNamed === false && imagePaths(resultText(block)).length > 0)
  })
  const isMentioned = role === 'assistant' && imagePaths(proseOf(blocks)).length > 0

  return { images, isNews: images.length > 0 || named.length > 0 || isMentioned }
}

export function collect(messages: readonly Message[]): Found[] {
  const uses = new Map<string, ToolUse>()
  const found = new Map<string, Found>()
  const dirs: string[] = []
  const add = (one: Found) => {
    const known = found.get(one.id)
    if (one.kind === 'path' && one.from === 'text' && known?.kind === 'path' && known.from === 'call') return
    found.delete(one.id)
    found.set(one.id, one)
  }

  for (const message of messages) {
    const prose = proseOf(message.content)
    const text = squeeze(prose)

    if (message.role === 'assistant') {
      for (const block of message.content) {
        if (block.type !== 'tool_use' || typeof block.id !== 'string' || typeof block.name !== 'string') continue
        for (const dir of block.name === 'Bash' && isRecord(block.input) ? changedDirs(block.input.command) : []) {
          const before = dirs[0]
          if (isRooted(dir) || before === undefined) dirs.unshift(dir)
          else dirs.unshift(`${before}/${dir}`, dir)
        }
        dirs.length = Math.min(dirs.length, MAX_BASES)
        uses.set(block.id, { name: block.name, input: block.input, said: text, bases: [...dirs] })
      }
      for (const path of imagePaths(prose).slice(0, MAX_PATHS_PER_CALL)) {
        add({ kind: 'path', id: candidateId(path, dirs), path, bases: [...dirs], from: 'text', label: `file ${basename(path)}`, fragment: text })
      }
      continue
    }

    for (const block of message.content) {
      const pasted = base64Image(block)
      if (pasted) add({ kind: 'block', id: imageId(pasted.data), label: 'pasted', fragment: text, ...pasted })
      if (block.type !== 'tool_result') continue

      const use = uses.get(String(block.tool_use_id)) ?? UNKNOWN_TOOL
      const images = imagesIn(innerBlocks(block))
      const paths = images.length > 0 ? [] : namedFiles(use.name, use.input, resultText(block))
      if (images.length === 0 && paths.length === 0) continue

      const fragment = use.said || squeeze(`${use.name} ${strings(use.input).join(' ')}`)
      const readFrom = isRecord(use.input) && typeof use.input.file_path === 'string' ? use.input.file_path : undefined
      const label = readFrom ? `${toolLabel(use.name)} ${basename(readFrom)}` : toolLabel(use.name)
      for (const one of images) add({ kind: 'block', id: imageId(one.data), label, fragment, ...one, ...(readFrom ? { readFrom } : {}) })

      for (const path of paths) {
        add({
          kind: 'path',
          id: candidateId(path, use.bases),
          path,
          bases: use.bases,
          from: 'call',
          label: `${toolLabel(use.name)} ${basename(path)}`,
          fragment,
        })
      }
    }
  }

  return [...found.values()]
}
