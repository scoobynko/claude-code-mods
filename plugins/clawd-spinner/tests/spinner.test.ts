import type { On } from 'claude-code'
import type { Engine, MockClock, Mounted } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const PROPS = { word: 'Working', message: null, suffix: '…', mode: 'responding' } as const
const MOUNT = { plugin: 'clawd-spinner', component: 'Spinner', props: PROPS, requestId: 'main' } as const

const answerSpinner = (on: On) =>
  on('ui.render', { component: 'Spinner' }, () => ({ type: 'Text', children: ['Working…'] }))

const answerTurns = (on: On) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

const answerUsage = (on: On, contextTokens: number) =>
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: contextTokens, window: 200_000 }, rateLimits: [] },
  }))

const captureBlits = (on: On) => {
  const blits: string[] = []
  on('ui.blit', (_, e) => {
    if ('cells' in e) blits.push(e.cells)
    return { value: {} }
  })
  return blits
}

const columnsOf = async (ui: Mounted<'terminal', 'Spinner'>) => {
  const columns = Number((await ui.find({ type: 'Raster', key: 'clawd' }))?.props.columns)
  expect(columns).toBeGreaterThan(0)
  return columns
}

const rowsOf = (cells: string, columns: number) => {
  const bytes = Uint8Array.from(atob(cells), char => char.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  let text = ''
  for (let i = 0; i < words.length; i += 3) text += String.fromCodePoint(words[i] ?? 0x20)
  return Array.from({ length: text.length / columns }, (_, row) => text.slice(row * columns, (row + 1) * columns))
}

const runStep = async ($: Engine, clock: MockClock, ms: number, agentId?: string) => {
  const drained = (async () => {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'test', messageCount: 1, agentId })) void chunk
  })()
  await clock.advance(ms)
  await drained
}

const stopWith = (usage: { input: number; cacheRead: number }) => ({
  kind: 'stop' as const,
  stopReason: 'end_turn' as const,
  usage: {
    input_tokens: usage.input,
    output_tokens: 0,
    cache_read_input_tokens: usage.cacheRead,
    cache_creation_input_tokens: 0,
    model: 'test',
  },
})

const stepResult = (turnId: string, index: number) =>
  ({ turnId, index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }) as const

test('draws Clawd under the terminal spinner line', async ($, on) => {
  answerSpinner(on)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })

  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } })
  expect(await ui.find({ type: 'Raster', key: 'clawd' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Working…' })).toBeDefined()
})

test('leaves the desktop spinner as it is', async ($, on) => {
  answerSpinner(on)
  const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })

  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
})

test('types while responding and stops when the turn ends', async ($, on) => {
  answerSpinner(on)
  answerTurns(on)
  const clock = mock.clock(on)
  const blits = captureBlits(on)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const columns = await columnsOf(ui)
  await clock.advance(200)

  expect(new Set(blits).size).toBeGreaterThan(1)
  expect(blits.map(cells => rowsOf(cells, columns)[0]?.trim()).join('')).toBe('')

  const drawnBeforeEnd = blits.length
  await $.turn.complete({ answer: '', durationMs: 200, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(400)

  expect(blits).toHaveLength(drawnBeforeEnd)
})

test('bobs with both arms out and hm... above his head while thinking', async ($, on) => {
  answerSpinner(on)
  answerTurns(on)
  const clock = mock.clock(on)
  const blits = captureBlits(on)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, props: { ...PROPS, mode: 'thinking' }, surface: 'terminal' })
  const columns = await columnsOf(ui)
  await clock.advance(1000)

  const frames = blits.map(cells => rowsOf(cells, columns))
  expect(new Set(frames.map(rows => rows.slice(1).join('|'))).size).toBe(2)
  expect(frames.some(rows => rows[0]?.includes('hm...'))).toBe(true)
})

test('floats the lines of code he writes out of the laptop', async ($, on) => {
  answerSpinner(on)
  answerTurns(on)
  answerUsage(on, 0)
  const clock = mock.clock(on)
  const blits = captureBlits(on)
  const writeInput = ['{"file_path":"/tmp/a.ts","con', 'tent": "const a = 1\\nfunction hel', 'lo() {\\n  return a\\', 'n}\\n"}']
  on('turn.step', async function* (_, e) {
    yield { kind: 'tool', index: 2, id: 'toolu_todo', name: 'TodoWrite' }
    yield { kind: 'input', index: 2, json: '{"todos":[{"content":"Fix the login bug","status":"pending"}]}' }
    yield { kind: 'tool', index: 1, id: 'toolu_write', name: 'Write' }
    for (const json of writeInput) {
      yield { kind: 'input', index: 1, json }
      await clock.sleep(100)
    }
    yield { kind: 'text', index: 0, text: 'Done, here it is:\n```ts\nlet x = 2\n' }
    yield { kind: 'text', index: 0, text: '```\nThat is all.' }
    yield stopWith({ input: 0, cacheRead: 0 })
    return stepResult(e.turnId, e.index)
  })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const columns = await columnsOf(ui)
  await runStep($, clock, 4000)

  const shown = blits.flatMap(cells => rowsOf(cells, columns)).join('\n')
  for (const line of ['const a = 1', 'function hello() {', 'return a', 'let x = 2']) expect(shown).toContain(line)
  for (const notCode of ['Done, here it is:', 'That is all.', 'file_path', 'Fix the login bug']) expect(shown).not.toContain(notCode)
})

test('floats the intake tokens into the laptop, topped up to the real count', async ($, on) => {
  answerSpinner(on)
  answerTurns(on)
  answerUsage(on, 900)
  const clock = mock.clock(on)
  const blits = captureBlits(on)
  on('turn.step', async function* (_, e) {
    await clock.sleep(400)
    yield stopWith({ input: 50, cacheRead: 1000 })
    return stepResult(e.turnId, e.index)
  })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  const columns = await columnsOf(ui)
  await runStep($, clock, 4000)

  const seen = new Set(blits.flatMap(cells => rowsOf(cells, columns)[0]?.match(/\+\d+/g) ?? []))
  expect(seen.has('+900')).toBe(true)
  expect(seen.has('+150')).toBe(true)
})

test('keeps typing when a subagent thinks', async ($, on) => {
  answerSpinner(on)
  answerTurns(on)
  const clock = mock.clock(on)
  const blits = captureBlits(on)
  on('turn.step', async function* (_, e) {
    for (let i = 0; i < 5; i++) {
      yield { kind: 'thinking', index: 0, text: 'let me think about this ' }
      await clock.sleep(100)
    }
    yield stopWith({ input: 0, cacheRead: 0 })
    return stepResult(e.turnId, e.index)
  })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, props: { ...PROPS, mode: 'tool-use' }, surface: 'terminal' })
  const columns = await columnsOf(ui)
  await runStep($, clock, 1000, 'subagent-1')

  const frames = blits.map(cells => rowsOf(cells, columns))
  expect(frames.some(rows => rows[0]?.includes('hm'))).toBe(false)
  expect(new Set(frames.map(rows => rows.slice(1).join('|'))).size).toBe(3)
})

test('keeps animating after a reload in the middle of a turn', async ($, on) => {
  answerSpinner(on)
  const clock = mock.clock(on)
  const blits = captureBlits(on)

  await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  await clock.advance(200)

  expect(new Set(blits).size).toBeGreaterThan(1)
})

type Play = { asset?: string; shouldLoop: boolean; gain?: number; isStopped: boolean }

const captureSound = (on: On) => {
  const plays: Play[] = []
  on('audio.play', async (_, e, next) => {
    const play: Play = { asset: e.clip.asset, shouldLoop: e.shouldLoop, gain: e.gain, isStopped: false }
    plays.push(play)
    await new Promise<void>(resolve => next.signal.addEventListener('abort', () => resolve()))
    play.isStopped = true
    return { value: undefined }
  })
  return plays
}

const answerStore = (on: On, entries: Record<string, unknown> = {}) => {
  const store = new Map(Object.entries(entries))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  return store
}

const soundSwitch = async (ui: Mounted<'terminal', 'Spinner'>) => {
  const { label, dimColor } = (await ui.find({ type: 'Button', key: 'sound' }))?.props ?? {}
  return `${label} ${dimColor ? 'dim' : 'lit'}`
}

const startTyping = async ($: Engine, on: On, saved: Record<string, unknown> = {}) => {
  answerSpinner(on)
  answerTurns(on)
  const clock = mock.clock(on)
  captureBlits(on)
  const store = answerStore(on, saved)
  const plays = captureSound(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  await clock.advance(200)
  return { clock, store, plays, ui }
}

test('is silent until the sound is switched on, with a dim [♪] under Clawd saying so', async ($, on) => {
  const { plays, ui } = await startTyping($, on)

  expect(plays).toHaveLength(0)
  expect(await soundSwitch(ui)).toBe('[♪] dim')
  const order = (await ui.findAll({})).flatMap(one => (one.key === 'clawd' || one.key === 'sound' ? [one.key] : []))
  expect(order).toEqual(['clawd', 'sound'])
})

test('loops one quiet typing sound while he types, once switched on', async ($, on) => {
  const { clock, plays, ui } = await startTyping($, on, { sound: true })
  await clock.advance(400)

  expect(await soundSwitch(ui)).toBe('[♪] lit')
  expect(plays).toHaveLength(1)
  expect(plays[0]).toMatchObject({ asset: 'sounds/typing.wav', shouldLoop: true, isStopped: false })
  expect(plays[0]?.gain).toBeLessThan(1)
})

test('switches the sound on and off from the button, and remembers it', async ($, on) => {
  const { clock, store, plays, ui } = await startTyping($, on)

  await ui.press({ key: 'sound' })
  await clock.advance(100)

  expect(await soundSwitch(ui)).toBe('[♪] lit')
  expect(store.get('sound')).toBe(true)
  expect(plays.map(play => play.isStopped)).toEqual([false])

  await ui.press({ key: 'sound' })
  await clock.advance(100)

  expect(await soundSwitch(ui)).toBe('[♪] dim')
  expect(store.get('sound')).toBe(false)
  expect(plays.map(play => play.isStopped)).toEqual([true])
})

test('switches the sound from the /clawd-sound command too', async ($, on) => {
  const { store } = await startTyping($, on)
  const run = () =>
    $.command.run({ command: 'clawd-sound', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  expect((await run()).text).toBe('Typing sound on.')
  expect(store.get('sound')).toBe(true)
  expect((await run()).text).toBe('Typing sound off.')
})

test('falls silent while he thinks and when the turn ends', async ($, on) => {
  const { clock, plays, ui } = await startTyping($, on, { sound: true })
  await ui.redraw({ ...PROPS, mode: 'thinking' })
  await clock.advance(200)

  expect(plays.map(play => play.isStopped)).toEqual([true])

  await ui.redraw(PROPS)
  await clock.advance(200)

  expect(plays.map(play => play.isStopped)).toEqual([true, false])

  await $.turn.complete({ answer: '', durationMs: 600, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(200)

  expect(plays.map(play => play.isStopped)).toEqual([true, true])
})
