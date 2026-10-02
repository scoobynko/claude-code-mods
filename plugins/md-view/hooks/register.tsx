import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MdFile, MdView } from '../types'
import { CONTROL, MARKDOWN_CHARS, layout, load } from './document'
import { displayPath, fitStart, hasMention, isMarkdown, linkify, mentionsIn, pathOfHref, resolvePath } from './paths'
import type { Place } from './paths'

type ToolUse = readonly [tool: string, input: unknown]

const PANE = 'md-view'
const TITLE = 'Markdown'
const NO_FILES = 'No Markdown files in this session yet.'
const MAX_FILES = 200
const MIN_COLUMNS = 20
const MAX_BYTES = 4 * 1024 * 1024
const MAX_LINKS = 256
const MAC_HOME = '/Users/'
const MAC_BULLET = '⏺'
const BULLET = '●'
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit'])
const EMPTY_VIEW: MdView = { path: '', file: null }

const files = atom({ plugin: 'md-view', key: 'files' } as const, [])
const view = atom({ plugin: 'md-view', key: 'view' } as const, EMPTY_VIEW)

const fieldOf = (input: unknown, name: string): string => {
  if (typeof input !== 'object' || input === null) return ''
  const value = (input as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : ''
}

const mentionsOfTool = ([tool, input]: ToolUse): string[] => {
  if (tool === 'Bash') return mentionsIn(fieldOf(input, 'command'))
  const path = FILE_TOOLS.has(tool) ? fieldOf(input, 'file_path') : ''
  return isMarkdown(path) ? [path] : []
}

const mentionsOf = (text: string, uses: readonly ToolUse[]): string[] => [...mentionsIn(text), ...uses.flatMap(mentionsOfTool)]

const plural = (count: number): string => (count === 1 ? 'file' : 'files')

const failed = (error: string): MdFile => ({ text: '', totalChars: 0, error })

const quietly = (work: Promise<unknown>): Promise<void> =>
  work.then(
    () => undefined,
    () => undefined,
  )

async function placeOf($: EngineInterface): Promise<Place> {
  const [cwd, home] = await Promise.all([$.session.cwd(), $.env.get('HOME')])
  return { cwd, home: home ?? '' }
}

async function isFile($: EngineInterface, path: string) {
  try {
    return (await $.fs.stat(path)).kind === 'file'
  } catch {
    return false
  }
}

async function remember($: EngineInterface, raws: string[], place: Place) {
  const known = await read($, files)
  const head: string[] = []
  for (const path of new Set(raws.map(raw => resolvePath(raw, place)).reverse())) {
    if (head.length === MAX_FILES) break
    if (known.includes(path) || (await isFile($, path))) head.push(path)
  }
  if (head.length === 0 || head.every((path, index) => known[index] === path)) return
  await update($, files, list => [...head, ...list.filter(path => !head.includes(path))].slice(0, MAX_FILES))
}

async function note($: EngineInterface, raws: string[]) {
  if (raws.length > 0) await remember($, raws, await placeOf($))
}

async function readFile($: EngineInterface, path: string): Promise<MdFile> {
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind !== 'file') return failed('Not a file.')
    if (stat.size > MAX_BYTES) return failed('Too large to preview.')
    return { ...load(await $.fs.read(path)), error: '' }
  } catch {
    return failed('File not found.')
  }
}

async function showFile($: EngineInterface, path: string) {
  const file = await readFile($, path)
  await update($, view, (): MdView => ({ path, file }))
}

async function listFiles($: EngineInterface) {
  await update($, view, (shown): MdView => ({ path: shown.path, file: null }))
}

async function toStart($: EngineInterface) {
  await $.ui.scroll({ in: PANE, to: 'start' })
}

async function present($: EngineInterface, isFocused: boolean) {
  await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, ...(isFocused ? { focus: true as const } : {}) })
  await quietly(toStart($))
}

async function pick($: EngineInterface, path: string) {
  await showFile($, path)
  await quietly(toStart($))
}

async function openHref($: EngineInterface, href: string) {
  const path = pathOfHref(href, await placeOf($))
  if (!path) return
  await showFile($, path)
  await present($, false)
}

async function refresh($: EngineInterface, path?: string) {
  const shown = await read($, view)
  if (!shown.file || (path !== undefined && path !== shown.path)) return
  const file = await readFile($, shown.path)
  if (file.text === shown.file.text && file.error === shown.file.error) return
  await update($, view, (now): MdView => (now.file && now.path === shown.path ? { path: now.path, file } : now))
}

async function afterWrite($: EngineInterface, raw: string) {
  const place = await placeOf($)
  const path = resolvePath(raw, place)
  await remember($, [path], place)
  await refresh($, path)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'md-view', description: 'Preview the Markdown files of this session in a pane' })
    const said = (await $.session.messages()).filter(message => message.role === 'assistant')
    await note(
      $,
      said.flatMap(message => mentionsOf(message.text, message.toolUses.map(use => [use.tool, use.input] as const))),
    )

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    await quietly(note($, mentionsOf(result.answer, result.toolUses.map(use => [use.name, use.input] as const))))

    return result
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const ran = await next(e)
    if (isMarkdown(e.file_path)) await quietly(afterWrite($, e.file_path))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await quietly(refresh($))

    return next(e)
  })

  on('command.run', { command: 'md-view' }, async ($, e) => {
    const asked = e.args.trim().replace(/^@/, '')
    if (!asked) {
      await listFiles($)
      await present($, true)
      const count = (await read($, files)).length

      return { text: count === 0 ? NO_FILES : `Markdown pane: ${count} ${plural(count)}.` }
    }
    const place = await placeOf($)
    const path = resolvePath(asked, place)
    await showFile($, path)
    await remember($, [path], place)
    await present($, true)

    return { text: `Previewing ${displayPath(path, place)}.` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const reply = e.props.text
    if (!hasMention(reply) || reply.length > MARKDOWN_CHARS || CONTROL.test(reply)) return next(e)
    if (e.surface === 'terminal' && !e.props.isFirstOfReply) return next(e)
    const known = await read($, files)
    if (known.length === 0) return next(e)
    const place = await placeOf($)
    const linked = linkify(reply, new Set(known), place)
    if (linked.hrefs.length === 0 || linked.hrefs.length > MAX_LINKS || linked.text.length > MARKDOWN_CHARS) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const body = <Markdown key="reply" text={linked.text} pressableLinks={linked.hrefs} onLinkPress={link => openHref($, link.href)} />
    if (e.surface !== 'terminal') return body

    return (
      <Box flexDirection="row" marginTop={1}>
        <Box minWidth={2}>
          <Text color="text">{place.home.startsWith(MAC_HOME) ? MAC_BULLET : BULLET}</Text>
        </Box>
        <Box flexDirection="column">{body}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const shown = await read($, view)
    const place = await placeOf($)
    const columns = Math.max(MIN_COLUMNS, e.props.bodyColumns)

    if (!shown.file) {
      const known = await read($, files)
      const focused = Math.max(0, known.indexOf(shown.path))

      return (
        <Box flexDirection="column" width={columns}>
          <Text dimColor>{known.length === 0 ? NO_FILES : `${known.length} Markdown ${plural(known.length)}, newest first`}</Text>
          {known.map((path, index) => (
            <Button
              key={`file-${index}`}
              plain
              dimColor={path !== shown.path}
              autoFocus={index === focused ? true : undefined}
              label={fitStart(displayPath(path, place), columns)}
              onPress={() => pick($, path)}
            />
          ))}
        </Box>
      )
    }

    const { text, totalChars, error } = shown.file
    const parts = error ? [] : layout(text, columns)
    const cut = `Showing the first ${text.length.toLocaleString('en-US')} of ${totalChars.toLocaleString('en-US')} characters.`

    return (
      <Box flexDirection="column" width={columns}>
        <Box paddingRight={2}>
          <Text dimColor wrap="truncate-start">
            {displayPath(shown.path, place)}
          </Text>
        </Box>
        <Button key="files" plain dimColor label="← Files" onPress={() => listFiles($)} />
        {error !== '' && <Text dimColor>{error}</Text>}
        {error === '' && parts.length === 0 && <Text dimColor>Empty file.</Text>}
        {parts.map((part, index) => (
          <Box marginTop={1}>
            <Markdown key={`part-${index}`} text={part} />
          </Box>
        ))}
        {totalChars > text.length && (
          <Box marginTop={1}>
            <Text dimColor>{cut}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
