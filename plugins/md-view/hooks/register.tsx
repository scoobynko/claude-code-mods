import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MdView } from '../types'
import { displayPath, mentionsIn, resolvePath } from './paths'

const PANE = 'md-view'
const TITLE = 'Markdown'
const MAX_FILES = 200
const MIN_COLUMNS = 20
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
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
  await update($, view, shown => ({ ...(shown ?? EMPTY_VIEW), mode: 'list' }))
}

async function pick($: EngineInterface, path: string) {
  await update($, view, () => ({ ...EMPTY_VIEW, mode: 'file', path }))
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

  on('command.run', { command: 'md-view' }, async $ => {
    await listFiles($)
    await openPane($, true)
    const count = (await read($, files)).length
    if (count === 0) return { text: 'No Markdown files in this session yet.' }

    return { text: `Markdown pane: ${count} ${count === 1 ? 'file' : 'files'}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = await read($, view)
    const known = await read($, files)
    const { cwd, home } = await placeOf($)
    const columns = Math.max(MIN_COLUMNS, e.props.bodyColumns)
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
  })
}
