import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MdView } from '../types'
import { layout, load } from './document'
import { displayPath, hasMention, linkify, mentionsIn, pathOfHref, resolvePath } from './paths'

const PANE = 'md-view'
const TITLE = 'Markdown'
const MAX_FILES = 200
const MIN_COLUMNS = 20
const MAX_BYTES = 4 * 1024 * 1024
const MAX_REPLY_CHARS = 10_000
const MAX_LINKS = 256
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/
const MAC_HOME = '/Users/'
const MAC_BULLET = '⏺'
const BULLET = '●'
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const EMPTY_VIEW: MdView = { mode: 'list', path: '', text: '', totalChars: 0, error: '' }

const files = atom({ plugin: 'md-view', key: 'files' } as const, [])
const view = atom({ plugin: 'md-view', key: 'view' } as const, EMPTY_VIEW)

const fieldOf = (input: unknown, name: string): string => {
  if (typeof input !== 'object' || input === null) return ''
  const value = (input as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : ''
}

const pathOfInput = (input: unknown): string => {
  const path = fieldOf(input, 'file_path') || fieldOf(input, 'notebook_path')
  return /\.md$/i.test(path) ? path : ''
}

const mentionsOfTool = (tool: string, input: unknown): string[] => {
  if (tool === 'Bash') return mentionsIn(fieldOf(input, 'command'))
  const path = FILE_TOOLS.has(tool) ? pathOfInput(input) : ''
  return path ? [path] : []
}

async function placeOf($: EngineInterface) {
  return { cwd: await $.session.cwd(), home: (await $.env.get('HOME')) ?? '' }
}

async function remember($: EngineInterface, raws: string[]) {
  if (raws.length === 0) return
  const { cwd, home } = await placeOf($)
  const known = await read($, files)
  const head: string[] = []
  for (const raw of [...raws].reverse()) {
    const path = resolvePath(raw, cwd, home)
    if (head.includes(path)) continue
    if (known.includes(path) || (await isFile($, path))) head.push(path)
  }
  if (head.length === 0 || head.every((path, index) => known[index] === path)) return
  await update($, files, list => [...head, ...(list ?? []).filter(path => !head.includes(path))].slice(0, MAX_FILES))
}

async function isFile($: EngineInterface, path: string) {
  try {
    return (await $.fs.stat(path)).kind === 'file'
  } catch {
    return false
  }
}

async function rememberSafely($: EngineInterface, raws: string[]) {
  try {
    await remember($, raws)
  } catch {
    return
  }
}

async function openPane($: EngineInterface, isFocused: boolean) {
  await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, ...(isFocused ? { focus: true as const } : {}) })
}

async function listFiles($: EngineInterface) {
  await update($, view, (shown): MdView => ({ ...(shown ?? EMPTY_VIEW), mode: 'list' }))
}

async function readFile($: EngineInterface, path: string) {
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind !== 'file') return { text: '', totalChars: 0, error: 'Not a file.' }
    if (stat.size > MAX_BYTES) return { text: '', totalChars: 0, error: 'Too large to preview.' }
    return { ...load(await $.fs.read(path)), error: '' }
  } catch {
    return { text: '', totalChars: 0, error: 'File not found.' }
  }
}

async function showFile($: EngineInterface, path: string) {
  const file = await readFile($, path)
  await update($, view, (): MdView => ({ mode: 'file', path, ...file }))
}

async function scrollToStart($: EngineInterface) {
  try {
    await $.ui.scroll({ in: PANE, to: 'start' })
  } catch {
    return
  }
}

async function pick($: EngineInterface, path: string) {
  await showFile($, path)
  await scrollToStart($)
}

async function openHref($: EngineInterface, href: string) {
  const { cwd, home } = await placeOf($)
  const path = pathOfHref(href, cwd, home)
  if (!path) return
  await showFile($, path)
  await openPane($, false)
  await scrollToStart($)
}

async function refresh($: EngineInterface, path?: string) {
  try {
    const shown = await read($, view)
    if (shown.mode !== 'file' || (path !== undefined && path !== shown.path)) return
    const file = await readFile($, shown.path)
    if (file.text === shown.text && file.error === shown.error) return
    await update($, view, (now): MdView => (now?.mode === 'file' && now.path === shown.path ? { ...now, ...file } : (now ?? EMPTY_VIEW)))
  } catch {
    return
  }
}

async function afterWrite($: EngineInterface, raw: string) {
  await rememberSafely($, [raw])
  const { cwd, home } = await placeOf($)
  await refresh($, resolvePath(raw, cwd, home))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'md-view', description: 'Preview the Markdown files of this session in a pane' })
    const messages = await $.session.messages()
    const said = messages.filter(message => message.role === 'assistant')
    await remember(
      $,
      said.flatMap(message => [...mentionsIn(message.text), ...message.toolUses.flatMap(use => mentionsOfTool(use.tool, use.input))]),
    )

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    await rememberSafely($, [...mentionsIn(result.answer), ...result.toolUses.flatMap(use => mentionsOfTool(use.name, use.input))])

    return result
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const raw = WRITE_TOOLS.has(String(e.tool)) ? pathOfInput(e) : ''
    if (raw) await afterWrite($, raw)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'md-view' }, async ($, e) => {
    const asked = e.args.trim().replace(/^@/, '')
    if (asked) {
      const { cwd, home } = await placeOf($)
      const path = resolvePath(asked, cwd, home)
      await showFile($, path)
      await rememberSafely($, [path])
      await openPane($, true)

      return { text: `Previewing ${displayPath(path, cwd, home)}.` }
    }
    await listFiles($)
    await openPane($, true)
    const count = (await read($, files)).length
    if (count === 0) return { text: 'No Markdown files in this session yet.' }

    return { text: `Markdown pane: ${count} ${count === 1 ? 'file' : 'files'}.` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const reply = e.props.text
    if (!hasMention(reply) || reply.length > MAX_REPLY_CHARS || CONTROL.test(reply)) return next(e)
    if (e.surface === 'terminal' && !e.props.isFirstOfReply) return next(e)
    const known = await read($, files)
    if (known.length === 0) return next(e)
    const { cwd, home } = await placeOf($)
    const linked = linkify(reply, new Set(known), cwd, home)
    if (linked.hrefs.length === 0 || linked.hrefs.length > MAX_LINKS || linked.text.length > MAX_REPLY_CHARS) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const body = <Markdown key="reply" text={linked.text} pressableLinks={linked.hrefs} onLinkPress={link => openHref($, link.href)} />
    if (e.surface !== 'terminal') return body

    return (
      <Box flexDirection="row" marginTop={1}>
        <Box minWidth={2}>
          <Text color="text">{home.startsWith(MAC_HOME) ? MAC_BULLET : BULLET}</Text>
        </Box>
        <Box flexDirection="column">{body}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const shown = await read($, view)
    const known = await read($, files)
    const { cwd, home } = await placeOf($)
    const columns = Math.max(MIN_COLUMNS, e.props.bodyColumns)

    if (shown.mode === 'list') {
      const focused = Math.max(0, known.indexOf(shown.path))
      const count = `${known.length} Markdown ${known.length === 1 ? 'file' : 'files'}, newest first`

      return (
        <Box flexDirection="column" width={columns}>
          <Text dimColor>{known.length === 0 ? 'No Markdown files in this session yet.' : count}</Text>
          {known.map((path, index) => (
            <Button
              key={`file-${index}`}
              plain
              dimColor={path !== shown.path}
              autoFocus={index === focused ? true : undefined}
              label={displayPath(path, cwd, home)}
              onPress={() => pick($, path)}
            />
          ))}
        </Box>
      )
    }

    const parts = shown.error ? [] : layout(shown.text, columns)
    const isCut = shown.totalChars > shown.text.length
    const cut = `Showing the first ${shown.text.length.toLocaleString('en-US')} of ${shown.totalChars.toLocaleString('en-US')} characters.`

    return (
      <Box flexDirection="column" width={columns}>
        <Box paddingRight={2}>
          <Text dimColor wrap="truncate-start">
            {displayPath(shown.path, cwd, home)}
          </Text>
        </Box>
        <Button key="files" plain dimColor label="← Files" onPress={() => listFiles($)} />
        {shown.error !== '' && <Text dimColor>{shown.error}</Text>}
        {shown.error === '' && parts.length === 0 && <Text dimColor>Empty file.</Text>}
        {parts.map((part, index) => (
          <Box marginTop={1}>
            <Markdown key={`part-${index}`} text={part} />
          </Box>
        ))}
        {isCut && (
          <Box marginTop={1}>
            <Text dimColor>{cut}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
