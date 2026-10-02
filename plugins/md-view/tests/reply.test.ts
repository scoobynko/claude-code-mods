import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { GUIDE, PANE, SURFACES, host, say, start } from './host'

const GUIDE_HREF = 'file:///proj/docs/guide.md'
const ENGINE = { type: 'Text', children: ['ENGINE'] }

const answerReplies = (on: On) => on('ui.render', { component: 'AssistantMessage' }, () => ENGINE)

const reply = (text: string, isFirstOfReply = true) =>
  ({ plugin: 'md-view', component: 'AssistantMessage', requestId: 'm1', props: { text, isFirstOfReply } }) as const

test('links a known file and opens it on a press', async ($, on) => {
  const { opened } = host(on)
  answerReplies(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...reply('See docs/guide.md for details.'), surface })

    expect(await ui.find({ type: 'Markdown', key: 'reply' })).toMatchObject({
      props: { text: `See [docs/guide.md](${GUIDE_HREF}) for details.`, pressableLinks: [GUIDE_HREF] },
    })

    await ui.press({ key: 'reply', link: { href: GUIDE_HREF } })
    const pane = await $.ui.mount({ ...PANE, surface })

    expect(opened.at(-1)).toEqual({ id: 'md-view', title: 'Markdown', closeOnEscape: true })
    expect((await pane.find({ type: 'Markdown' }))?.props.text).toBe(GUIDE)
    await pane.press({ key: 'files' })
    await pane.unmount()
    await ui.unmount()
  }
})

test("keeps the engine's drawing without .md mentions", async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...reply('No files here.'), surface })

    expect(await ui.drawn()).toEqual(ENGINE)
    await ui.unmount()
  }
})

test("keeps the engine's drawing for a file that does not exist", async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...reply('See missing.md and https://example.com/docs/guide.md.'), surface })

    expect(await ui.drawn()).toEqual(ENGINE)
    await ui.unmount()
  }
})

test('leaves code fences alone', async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...reply('Run:\n```sh\ncat docs/guide.md\n```'), surface })

    expect(await ui.drawn()).toEqual(ENGINE)
    await ui.unmount()
  }
})

test('draws the reply bullet on the terminal only', async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  const terminal = await $.ui.mount({ ...reply('See README.md.'), surface: 'terminal' })
  const desktop = await $.ui.mount({ ...reply('See README.md.'), surface: 'desktop' })

  expect(await terminal.drawn()).toMatchObject({ type: 'Box', props: { flexDirection: 'row', marginTop: 1 } })
  expect(await terminal.find({ type: 'Text', text: '⏺' })).toMatchObject({ props: { color: 'text' } })
  expect(await desktop.drawn()).toMatchObject({ type: 'Markdown', props: { key: 'reply' } })
})

test("keeps the engine's drawing for a terminal block that does not open the reply", async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  const ui = await $.ui.mount({ ...reply('See README.md.', false), surface: 'terminal' })

  expect(await ui.drawn()).toEqual(ENGINE)
})

test("keeps the engine's drawing for a reply the Markdown element cannot hold", async ($, on) => {
  host(on)
  answerReplies(on)
  await start($)
  for (const surface of SURFACES) {
    const long = await $.ui.mount({ ...reply(`See README.md. ${'word '.repeat(2000)}`), surface })
    const odd = await $.ui.mount({ ...reply('See README.md.\u001b[31m'), surface, requestId: 'm2' })

    expect(await long.drawn()).toEqual(ENGINE)
    expect(await odd.drawn()).toEqual(ENGINE)
    await long.unmount()
    await odd.unmount()
  }
})

test('links a file once Claude has written it', async ($, on) => {
  const session = host(on, [])
  answerReplies(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  const ui = await $.ui.mount({ ...reply('Wrote docs/plan.md.'), surface: 'terminal' })

  expect(await ui.drawn()).toEqual(ENGINE)

  session.disk['/proj/docs/plan.md'] = '# Plan'
  await $.tool.call({ tool: 'Write', tool_use_id: 'write-1', file_path: '/proj/docs/plan.md', content: '# Plan' })

  expect((await ui.find({ type: 'Markdown', key: 'reply' }))?.props.pressableLinks).toEqual(['file:///proj/docs/plan.md'])
})

test('links a file mentioned in the same step', async ($, on) => {
  const session = host(on, [])
  answerReplies(on)
  await start($)
  const ui = await $.ui.mount({ ...reply('See `README.md`.'), surface: 'terminal' })
  await say($, session, 'See `README.md`.')

  expect((await ui.find({ type: 'Markdown', key: 'reply' }))?.props.text).toBe('See [`README.md`](file:///proj/README.md).')
})

test('uses the round bullet away from macOS', async ($, on) => {
  host(on, undefined, '/home/me')
  answerReplies(on)
  await start($)
  const ui = await $.ui.mount({ ...reply('See README.md.'), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
})
