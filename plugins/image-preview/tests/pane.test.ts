import type { On } from 'claude-code'
import type { Engine, Mounted } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { PASTED, SHOT, call, image, pngHeader } from './fixtures'

const PROPS = { title: 'Images', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const MOUNT = { plugin: 'image-preview', component: 'Pane', requestId: 'images', props: PROPS } as const
const DIR = '/tmp/t/claude-image-preview-s1'

const CONVERSATION = [
  { role: 'user', content: [{ type: 'text', text: 'Why is this button off-centre? [Image #1]' }, image('image/png', PASTED)] },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me look at the mockup.' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/work/mockup.jpg' } },
    ],
  },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [image('image/jpeg', SHOT)] }] },
]

const header = (width: number, height: number) => `${pngHeader(width, height)}\n`

type Run = { argv: readonly string[]; init?: { stdin?: string } }

const written = ({ argv }: Run) => (argv[7] === 'keep' && /\.png$/.test(argv[5] ?? '') ? argv[5] : argv[6])

type Setup = { onOpen?: () => void; startedAt?: number; agents?: Record<string, unknown[]>; listed?: boolean }

const answerSession = (on: On, messages: unknown[], { onOpen = () => {}, startedAt = 0, agents = {}, listed = true }: Setup = {}) => {
  const conversation = [...messages]
  const opens: unknown[] = []
  mock.env(on, { TMPDIR: '/tmp/t/', HOME: '/home/me' })
  on('session.messages', (_, e) => ({ value: e.agentId === undefined ? conversation : (agents[e.agentId] ?? { deny: 'gone' }) }) as never)
  on('session.usage', () => ({ value: { startedAt, context: { tokens: 0, window: 200_000 }, rateLimits: [] } }))
  on('agent.list', () => ({
    value: listed ? Object.keys(agents).map(id => ({ id, description: 'look around', type: 'Explore', status: 'completed' })) : [],
  }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.panes', () => ({
    value: opens.length > 0 ? [{ id: 'images', title: 'Images', isShown: true, isFocused: true, isPlaced: true }] : [],
  }))
  on('ui.open', (_, e) => {
    opens.push(e)
    onOpen()
    return { value: { isPlaced: true } }
  })
  return { conversation, opens }
}

const answerProcess = (on: On, result: { width?: number; height?: number; exitCode?: number } = {}) => {
  const runs: Run[] = []
  on('process.run', (_, e) => {
    runs.push(e as Run)
    const exitCode = result.exitCode ?? 0
    const stdout = exitCode === 0 ? `${header(result.width ?? 800, result.height ?? 400)}${written(e as Run)}\n` : ''
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

const answerFiles = (on: On, known: Record<string, number>) =>
  on('fs.stat', (_, e) => {
    const mtimeMs = known[e.path]
    if (mtimeMs === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size: 10, mtimeMs, isLink: false } }
  })

const shoot = (id = 't9') => call('Bash', { command: 'screencapture -x shot.png' }, id)
const EXPLORED = call('Read', { file_path: '/work/diagram.png' }, 'a1', [image('image/png', 'D'.repeat(300))])

const open = ($: Engine) =>
  $.command.run({ command: 'image-preview', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
type Drawn = Pick<Mounted, 'find' | 'findAll'>

const terminal = ($: Engine) => $.ui.mount({ ...MOUNT, surface: 'terminal' })
const preview = (ui: Drawn) => ui.find({ type: 'Image', key: 'preview' })

const buttons = (ui: Drawn) => ui.findAll({ type: 'Button' })
const labels = async (ui: Drawn) => (await buttons(ui)).map(button => String(button.props.label))

test('opens the Images pane and lists pasted and tool images, newest first', async ($, on) => {
  const { opens } = answerSession(on, CONVERSATION)
  answerProcess(on)

  const answer = await open($)
  const ui = await terminal($)

  expect(opens).toEqual([{ id: 'images', title: 'Images', focus: true, closeOnEscape: true }])
  expect(answer.text).toBe('Images pane opened with 2 images.')
  expect(await labels(ui)).toEqual(['Read mockup.jpg', 'pasted'])
  expect((await buttons(ui)).map(button => button.props.hotkey)).toEqual(['1', '2'])
})

test('has the newest image ready before the pane opens', async ($, on) => {
  let preparedAtOpen = -1
  answerSession(on, CONVERSATION, {
    onOpen: () => {
      preparedAtOpen = runs.length
    },
  })
  const runs = answerProcess(on)

  await open($)

  expect(preparedAtOpen).toBe(1)
})

test('says so when the session has no images', async ($, on) => {
  answerSession(on, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
  answerProcess(on)

  const answer = await open($)
  const ui = await terminal($)

  expect(answer.text).toBe('Images pane opened. No images in this session yet.')
  expect(await ui.find({ type: 'Text', text: 'No images in this session yet.' })).toBeDefined()
  expect(await buttons(ui)).toHaveLength(0)
})

test('marks the selected image and moves the mark on a pick', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await terminal($)
  const dimmed = async () => (await buttons(ui)).map(button => button.props.dimColor)

  expect(await dimmed()).toEqual([false, true])
  const older = (await buttons(ui))[1]
  await ui.press({ key: String(older?.key) })

  expect(await dimmed()).toEqual([true, false])
})

test('windows a long list around the selection', async ($, on) => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    role: 'user',
    content: [{ type: 'text', text: `shot ${i + 1}` }, image('image/png', String.fromCharCode(65 + i).repeat(300))],
  }))
  answerSession(on, many)
  answerProcess(on)
  await open($)
  const ui = await terminal($)

  expect(await buttons(ui)).toHaveLength(8)
  expect(await ui.find({ type: 'Text', text: '12 images' })).toBeDefined()

  const last = (await buttons(ui)).at(-1)
  await ui.press({ key: String(last?.key) })
  const shown = await buttons(ui)

  expect(shown).toHaveLength(8)
  expect(shown.some(button => button.props.dimColor === false)).toBe(true)
  expect(String(shown.at(-1)?.props.label)).toMatch(/^1[0-2]: pasted/)
})

test('shows the newest image at the pane width, converted to PNG, with the fragment of its message', async ($, on) => {
  answerSession(on, CONVERSATION)
  const runs = answerProcess(on, { width: 800, height: 400 })
  await open($)
  const ui = await terminal($)
  const picture = await preview(ui)
  const file = String((picture?.props.source as { file?: string } | undefined)?.file)

  expect(file).toMatch(new RegExp(`^${DIR}/[a-z0-9-]+\\.png$`))
  expect(picture?.props).toMatchObject({ source: { file, format: 'png' }, columns: 60, rows: 15, alt: 'Read mockup.jpg' })
  expect(await ui.find({ type: 'Text', text: 'Let me look at the mockup.' })).toBeDefined()
  expect(runs).toHaveLength(1)
  expect(runs[0]?.argv.slice(0, 2)).toEqual(['sh', '-c'])
  expect(runs[0]?.argv[2]).toMatch(/^umask 077\n/)
  expect(runs[0]?.argv.slice(3)).toEqual(['sh', DIR, file.replace(/png$/, 'src'), file, 'decode'])
  expect(runs[0]?.argv[2]).toContain('magick "$2[0]" "$3"')
  expect(runs[0]?.init?.stdin).toBe(SHOT)
})

test('shows a picked image and prepares each image once', async ($, on) => {
  answerSession(on, CONVERSATION)
  const runs = answerProcess(on)
  await open($)
  const ui = await terminal($)
  const [newer, older] = await buttons(ui)

  await ui.press({ key: String(older?.key) })
  expect((await preview(ui))?.props.alt).toBe('pasted')
  expect(await ui.find({ type: 'Text', text: 'Why is this button off-centre? [Image #1]' })).toBeDefined()
  expect(runs[1]?.argv[7]).toBe('decode')

  await ui.press({ key: String(newer?.key) })
  await ui.press({ key: String(older?.key) })
  expect(runs).toHaveLength(2)
})

test('caps a tall image to the rows the pane has left', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on, { width: 100, height: 4000 })
  await open($)
  const ui = await terminal($)
  const picture = await preview(ui)

  expect(Number(picture?.props.rows)).toBeLessThanOrEqual(PROPS.scroll.bodyRows - 2 - 3)
  expect(Number(picture?.props.columns)).toBeGreaterThanOrEqual(1)
  expect(Number(picture?.props.columns)).toBeLessThan(10)
})

test('says why when the image cannot be converted', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on, { exitCode: 2 })
  await open($)
  const ui = await terminal($)

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /sips or ImageMagick/ })).toBeDefined()
  expect(await buttons(ui)).toHaveLength(2)
})

test('says why when no shell can be run', async ($, on) => {
  answerSession(on, CONVERSATION)
  on('process.run', () => {
    throw new Error('spawn sh ENOENT')
  })
  await open($)
  const ui = await terminal($)

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /macOS or Linux/ })).toBeDefined()
})

test('says so when the image is gone from the conversation', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await terminal($)
  const older = (await buttons(ui))[1]
  conversation.length = 0

  await ui.press({ key: String(older?.key) })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /no longer in the conversation/ })).toBeDefined()
})

test('links to the file where the surface draws no images', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })
  const link = await ui.find({ type: 'Markdown', key: 'preview' })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(String(link?.props.text)).toMatch(new RegExp(`^\\[Open Read mockup\\.jpg\\]\\(file://${DIR}/[a-z0-9-]+\\.png\\)$`))
  expect(await labels(ui)).toEqual(['Read mockup.jpg', 'pasted'])
})

const LATE = { role: 'user', content: [{ type: 'text', text: 'And this one?' }, image('image/png', 'L'.repeat(300))] } as const

const appendRow = ($: Engine, message: { role: 'user' | 'assistant'; content: readonly unknown[] }, agentId?: string) =>
  $.session
    .append({
      door: message.role === 'user' ? 'prompt' : 'response',
      origin: { kind: 'composer' },
      uuid: crypto.randomUUID(),
      message: { type: message.role, ...message },
      ...(agentId === undefined ? {} : { agentId }),
    } as never)
    .catch(() => undefined)

test('adds an image that arrives while the pane is open, with its time, and follows it', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  answerProcess(on)
  const clock = mock.clock(on)
  await open($)
  const ui = await terminal($)

  conversation.push(LATE)
  await appendRow($, LATE)
  await clock.settle()

  const shown = await labels(ui)
  expect(shown).toHaveLength(3)
  expect(shown[0]).toMatch(/^pasted {2}\d\d:\d\d$/)
  expect(await ui.find({ type: 'Text', text: 'And this one?' })).toBeDefined()
  expect((await preview(ui))?.props.alt).toBe('pasted')
})

test('keeps the picked image when a new one arrives', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  answerProcess(on)
  const clock = mock.clock(on)
  await open($)
  const ui = await terminal($)
  await ui.press({ key: String((await buttons(ui))[1]?.key) })

  conversation.push(LATE)
  await appendRow($, LATE)
  await clock.settle()

  expect(await labels(ui)).toHaveLength(3)
  expect(await ui.find({ type: 'Text', text: 'Why is this button off-centre? [Image #1]' })).toBeDefined()
})

test('does not read the conversation while the pane is closed', async ($, on) => {
  let reads = 0
  const clock = mock.clock(on)
  on('ui.panes', () => ({ value: [] }))
  on('session.messages', () => {
    reads++
    return { value: [] }
  })

  await appendRow($, LATE)
  await clock.settle()

  expect(reads).toBe(0)
})

test('shows a command-written image file once its call has finished', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  answerProcess(on)
  const clock = mock.clock(on)
  answerFiles(on, { '/work/shot.png': 0 })
  await open($)
  const ui = await terminal($)
  const [asked, result] = shoot()

  conversation.push(asked)
  await appendRow($, asked)
  await clock.settle()
  expect(await labels(ui)).toHaveLength(2)

  conversation.push(result)
  await appendRow($, result)
  await clock.settle()
  expect((await labels(ui))[0]).toMatch(/^Bash shot\.png/)
})

test('lists an image file a command wrote, drawn from where it is', async ($, on) => {
  answerSession(on, shoot())
  const runs = answerProcess(on)
  answerFiles(on, { '/work/shot.png': Date.UTC(2026, 0, 1, 12, 0) })
  await open($)
  const ui = await terminal($)

  expect((await labels(ui))[0]).toMatch(/^Bash shot\.png {2}\d\d:\d\d$/)
  expect((await preview(ui))?.props.source).toEqual({
    file: '/work/shot.png',
    format: 'png',
    generation: Date.UTC(2026, 0, 1, 12, 0),
  })
  expect(runs[0]?.argv.slice(4)).toEqual([DIR, '/work/shot.png', expect.stringMatching(new RegExp(`^${DIR}/path-[a-z0-9]+\\.png$`)), 'keep'])
  expect(runs[0]?.init?.stdin).toBeUndefined()
})

test('leaves out a named image file that does not exist', async ($, on) => {
  answerSession(on, call('Bash', { command: 'rm old.png' }))
  answerProcess(on)
  answerFiles(on, {})

  expect((await open($)).text).toBe('Images pane opened. No images in this session yet.')
})

test('removes its temp files and forgets the images when the session ends', async ($, on) => {
  answerSession(on, CONVERSATION)
  const runs = answerProcess(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await open($)
  const ui = await terminal($)

  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)

  expect(runs.at(-1)?.argv).toEqual(['rm', '-rf', DIR])
  expect(await buttons(ui)).toHaveLength(0)
})

test('shows a rewritten image file afresh', async ($, on) => {
  let mtimeMs = 1000
  const { conversation } = answerSession(on, shoot('t1'))
  const runs = answerProcess(on)
  const clock = mock.clock(on)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs, isLink: false } }))
  await open($)
  const ui = await terminal($)
  const source = async () => (await preview(ui))?.props.source

  expect(await source()).toEqual({ file: '/work/shot.png', format: 'png', generation: 1000 })

  mtimeMs = 2000
  const [again, result] = shoot('t2')
  conversation.push(again, result)
  await appendRow($, again)
  await appendRow($, result)
  await clock.settle()

  expect(runs).toHaveLength(2)
  expect(await source()).toEqual({ file: '/work/shot.png', format: 'png', generation: 2000 })
  expect(await buttons(ui)).toHaveLength(1)
})

test('prepares an image once when two rows bring it together', async ($, on) => {
  const { conversation } = answerSession(on, [])
  const clock = mock.clock(on)
  const runs: Run[] = []
  on('process.run', async (_, e) => {
    runs.push(e as Run)
    await clock.sleep(100)
    return { value: { exitCode: 0, stdout: `${header(800, 400)}${written(e as Run)}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await open($)
  const ui = await terminal($)

  conversation.push(LATE)
  void appendRow($, LATE)
  void appendRow($, LATE)
  await clock.advance(1000)

  expect(runs).toHaveLength(1)
  expect(await preview(ui)).toBeDefined()
})

test('tries again on a pick after a failed preview', async ($, on) => {
  answerSession(on, CONVERSATION)
  let exitCode = 1
  const runs: Run[] = []
  on('process.run', (_, e) => {
    runs.push(e as Run)
    return { value: { exitCode, stdout: exitCode === 0 ? `${header(800, 400)}${written(e as Run)}\n` : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await open($)
  const ui = await terminal($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()

  exitCode = 0
  await ui.press({ key: String((await buttons(ui))[0]?.key) })

  expect(await preview(ui)).toBeDefined()
})

test('selects the newest image again when reopened', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await terminal($)
  await ui.press({ key: String((await buttons(ui))[1]?.key) })
  expect((await preview(ui))?.props.alt).toBe('pasted')

  await open($)

  expect((await preview(ui))?.props.alt).toBe('Read mockup.jpg')
})

const WROTE = [
  ...call('Bash', { command: 'cd build && ./render.sh --out=fig.png' }, 't9'),
  { role: 'assistant', content: [{ type: 'text', text: 'The figure is at /work/build/fig.png now.' }] },
]

test('finds a file written after a cd, once, however it is spelled', async ($, on) => {
  answerSession(on, WROTE)
  answerProcess(on)
  answerFiles(on, { '/work/build/fig.png': 5000 })
  await open($)
  const ui = await terminal($)

  expect(await labels(ui)).toHaveLength(1)
  expect((await labels(ui))[0]).toMatch(/^Bash fig\.png/)
  expect((await preview(ui))?.props.source).toMatchObject({ file: '/work/build/fig.png' })
})

test('leaves out an image file older than the session', async ($, on) => {
  answerSession(on, WROTE, { startedAt: 60_000 })
  answerProcess(on)
  answerFiles(on, { '/work/build/fig.png': 5000 })

  expect((await open($)).text).toBe('Images pane opened. No images in this session yet.')
})

test('lists the images of a subagent conversation and shows one', async ($, on) => {
  answerSession(on, CONVERSATION, { agents: { 'agent-1': EXPLORED } })
  const runs = answerProcess(on)
  await open($)
  const ui = await terminal($)
  const row = (await buttons(ui)).find(button => String(button.props.label).startsWith('Read diagram.png'))

  expect(await labels(ui)).toHaveLength(3)
  await ui.press({ key: String(row?.key) })

  expect((await preview(ui))?.props.alt).toBe('Read diagram.png')
  expect(runs.at(-1)?.init?.stdin).toBe('D'.repeat(300))
})

test('keeps the images viewable across a compaction', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  const runs = answerProcess(on)
  const clock = mock.clock(on)
  const summary = [{ role: 'user' as const, text: 'Summary of the work so far.', toolUses: [] }]
  on('session.compact', () => ({ messages: summary }))

  await $.session.compact({ trigger: 'manual', messages: summary })
  await clock.settle()
  expect(runs).toHaveLength(2)

  conversation.length = 0
  expect((await open($)).text).toBe('Images pane opened with 2 images.')
  const ui = await terminal($)
  await ui.press({ key: String((await buttons(ui))[1]?.key) })

  expect((await preview(ui))?.props.alt).toBe('pasted')
  expect(runs).toHaveLength(2)
})

test('orders images by when they appeared', async ($, on) => {
  const { conversation } = answerSession(on, [])
  answerProcess(on)
  const clock = mock.clock(on, { now: 10_000 })
  answerFiles(on, { '/work/shot.png': 20_000 })
  await open($)
  const ui = await terminal($)
  conversation.push(...shoot(), LATE)
  await appendRow($, LATE)
  await clock.settle()

  expect((await labels(ui)).map(label => label.replace(/ {2}.*/, ''))).toEqual(['Bash shot.png', 'pasted'])
})

test('lists the images of a finished subagent the engine no longer lists', async ($, on) => {
  answerSession(on, CONVERSATION, { agents: { 'agent-1': EXPLORED }, listed: false })
  answerProcess(on)
  const clock = mock.clock(on)

  await appendRow($, EXPLORED[1], 'agent-1')
  await clock.settle()
  await open($)
  const ui = await terminal($)

  expect((await labels(ui))[0]).toMatch(/^Read diagram\.png {2}\d\d:\d\d$/)
  expect((await preview(ui))?.props.alt).toBe('Read diagram.png')
})

test('lists a file once when two spellings lead to it', async ($, on) => {
  answerSession(on, [
    ...WROTE.slice(0, 2),
    { role: 'assistant', content: [{ type: 'text', text: 'Also reachable as /work/out/../build/fig.png for the docs.' }] },
  ])
  answerProcess(on)
  on('fs.stat', (_, e) => {
    if (!['/work/build/fig.png', '/work/out/../build/fig.png'].includes(e.path)) throw new Error('ENOENT')
    return { value: { kind: 'file', size: 10, mtimeMs: 5000, isLink: false, realPath: '/work/build/fig.png' } }
  })
  await open($)
  const ui = await terminal($)

  expect(await labels(ui)).toHaveLength(1)
  expect((await preview(ui))?.props.source).toMatchObject({ file: '/work/build/fig.png' })
})

test('tells a failed conversion from a missing converter', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on, { exitCode: 3 })
  await open($)
  const ui = await terminal($)

  expect(await ui.find({ type: 'Text', text: /could not be converted/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sips or ImageMagick/ })).toBeUndefined()
})

test('lists a file once when Claude wrote it and then read it', async ($, on) => {
  const { conversation } = answerSession(on, shoot())
  answerProcess(on)
  const clock = mock.clock(on)
  answerFiles(on, { '/work/shot.png': 1000 })
  await open($)
  const ui = await terminal($)
  expect((await labels(ui)).map(label => label.replace(/ {2}.*/, ''))).toEqual(['Bash shot.png'])

  const [asked, answered] = call('Read', { file_path: '/work/shot.png' }, 't2', [image('image/png', SHOT)])
  conversation.push(asked, answered)
  await appendRow($, answered)
  await clock.settle()

  expect((await labels(ui)).map(label => label.replace(/ {2}.*/, ''))).toEqual(['Read shot.png'])
})

test('keeps the images of a subagent across its own compaction', async ($, on) => {
  const explored = [...EXPLORED]
  answerSession(on, CONVERSATION, { agents: { 'agent-1': explored }, listed: false })
  const runs = answerProcess(on)
  const clock = mock.clock(on)
  const summary = [{ role: 'user' as const, text: 'Summary of the work so far.', toolUses: [] }]
  on('session.compact', () => ({ messages: summary }))

  await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: summary })
  await clock.settle()
  expect(runs).toHaveLength(1)

  explored.length = 0
  await open($)
  const ui = await terminal($)
  const row = (await buttons(ui)).find(button => String(button.props.label).startsWith('Read diagram.png'))
  await ui.press({ key: String(row?.key) })

  expect((await preview(ui))?.props.alt).toBe('Read diagram.png')
})

test('stops saving images when the session ends, and removes the folder last', async ($, on) => {
  answerSession(on, CONVERSATION)
  const clock = mock.clock(on)
  const runs: Run[] = []
  on('process.run', async (_, e) => {
    runs.push(e as Run)
    if (e.argv[0] === 'sh') await clock.sleep(100)
    return { value: { exitCode: 0, stdout: `${header(800, 400)}${written(e as Run)}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const summary = [{ role: 'user' as const, text: 'Summary of the work so far.', toolUses: [] }]
  on('session.compact', () => ({ messages: summary }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))

  await $.session.compact({ trigger: 'manual', messages: summary })
  const ended = $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  await clock.advance(1000)
  await ended

  expect(runs.map(run => run.argv[0])).toEqual(['sh', 'rm'])
})
