import type { On } from 'claude-code'
import type { Engine, Mounted } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const PROPS = { title: 'Images', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const MOUNT = { plugin: 'image-preview', component: 'Pane', requestId: 'images', props: PROPS } as const
const DIR = '/tmp/t/claude-image-preview-s1'

const image = (media_type: string, data: string) => ({ type: 'image', source: { type: 'base64', media_type, data } })
const PASTED = 'P'.repeat(300)
const SHOT = 'S'.repeat(300)
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

const header = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return `${btoa(String.fromCharCode(...bytes))}\n`
}

type Run = { argv: readonly string[]; init?: { stdin?: string } }

const answerSession = (on: On, messages: unknown[]) => {
  const conversation = [...messages]
  const opens: unknown[] = []
  mock.env(on, { TMPDIR: '/tmp/t/', HOME: '/home/me' })
  on('session.messages', () => ({ value: conversation }) as never)
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.panes', () => ({
    value: opens.length > 0 ? [{ id: 'images', title: 'Images', isShown: true, isFocused: true, isPlaced: true }] : [],
  }))
  on('ui.open', (_, e) => {
    opens.push(e)
    return { value: { isPlaced: true } }
  })
  return { conversation, opens }
}

const answerProcess = (on: On, result: { width?: number; height?: number; exitCode?: number } = {}) => {
  const runs: Run[] = []
  on('process.run', (_, e) => {
    runs.push(e as Run)
    const exitCode = result.exitCode ?? 0
    const stdout = exitCode === 0 ? header(result.width ?? 800, result.height ?? 400) : ''
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

const open = ($: Engine) => $.command.run({ command: 'image-preview', args: '' })
const buttons = (ui: Mounted) => ui.findAll({ type: 'Button' })
const labels = async (ui: Mounted) => (await buttons(ui)).map(button => String(button.props.label))

test('opens the Images pane and lists pasted and tool images, newest first', async ($, on) => {
  const { opens } = answerSession(on, CONVERSATION)
  answerProcess(on)

  const answer = await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

  expect(opens).toEqual([{ id: 'images', title: 'Images', focus: true, closeOnEscape: true }])
  expect(answer.text).toBe('Images pane opened with 2 images.')
  expect(await labels(ui)).toEqual(['Read mockup.jpg', 'pasted'])
  expect((await buttons(ui)).map(button => button.props.hotkey)).toEqual(['1', '2'])
})

test('says so when the session has no images', async ($, on) => {
  answerSession(on, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
  answerProcess(on)

  const answer = await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

  expect(answer.text).toBe('Images pane opened. No images in this session yet.')
  expect(await ui.find({ type: 'Text', text: 'No images in this session yet.' })).toBeDefined()
  expect(await buttons(ui)).toHaveLength(0)
})

test('marks the selected image and moves the mark on a pick', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
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
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

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
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const picture = await ui.find({ type: 'Image', key: 'preview' })
  const file = String((picture?.props.source as { file?: string } | undefined)?.file)

  expect(file).toMatch(new RegExp(`^${DIR}/[a-z0-9-]+\\.png$`))
  expect(picture?.props).toMatchObject({ source: { file, format: 'png' }, columns: 60, rows: 15, alt: 'Read mockup.jpg' })
  expect(await ui.find({ type: 'Text', text: 'Let me look at the mockup.' })).toBeDefined()
  expect(runs).toHaveLength(1)
  expect(runs[0]?.argv.slice(0, 2)).toEqual(['sh', '-c'])
  expect(runs[0]?.argv.slice(3)).toEqual(['sh', DIR, file.replace(/png$/, 'jpg'), file, 'decode'])
  expect(runs[0]?.init?.stdin).toBe(SHOT)
})

test('shows a picked image and prepares each image once', async ($, on) => {
  answerSession(on, CONVERSATION)
  const runs = answerProcess(on)
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const [newer, older] = await buttons(ui)

  await ui.press({ key: String(older?.key) })
  expect((await ui.find({ type: 'Image', key: 'preview' }))?.props.alt).toBe('pasted')
  expect(await ui.find({ type: 'Text', text: 'Why is this button off-centre? [Image #1]' })).toBeDefined()
  expect(runs[1]?.argv[5]).toBe(runs[1]?.argv[6])

  await ui.press({ key: String(newer?.key) })
  await ui.press({ key: String(older?.key) })
  expect(runs).toHaveLength(2)
})

test('caps a tall image to the rows the pane has left', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on, { width: 100, height: 4000 })
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const picture = await ui.find({ type: 'Image', key: 'preview' })

  expect(Number(picture?.props.rows)).toBeLessThanOrEqual(PROPS.scroll.bodyRows - 2 - 3)
  expect(Number(picture?.props.columns)).toBeGreaterThanOrEqual(1)
  expect(Number(picture?.props.columns)).toBeLessThan(10)
})

test('says why when the image cannot be converted', async ($, on) => {
  answerSession(on, CONVERSATION)
  answerProcess(on, { exitCode: 2 })
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

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
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /macOS or Linux/ })).toBeDefined()
})

test('says so when the image is gone from the conversation', async ($, on) => {
  const { conversation } = answerSession(on, CONVERSATION)
  answerProcess(on)
  await open($)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
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
