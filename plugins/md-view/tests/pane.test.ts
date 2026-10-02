import { expect, test } from 'claude-code/testing'

import { PANE, SURFACES, host, say, start } from './host'

test("lists what Claude brought up, newest first, without missing files or the person's own mentions", async ($, on) => {
  host(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['docs/guide.md', 'README.md'])
    expect(await ui.find({ type: 'Text', text: '2 Markdown files, newest first' })).toBeDefined()
    await ui.unmount()
  }
})

test('/md-view opens the pane focused on the list', async ($, on) => {
  const { opened } = host(on)
  await start($)

  expect(await $.command.run({ command: 'md-view' })).toMatchObject({ text: 'Markdown pane: 2 files.' })
  expect(opened).toEqual([{ id: 'md-view', title: 'Markdown', closeOnEscape: true, focus: true }])
})

test('says so when the session has no files', async ($, on) => {
  host(on, [])
  await start($)

  expect(await $.command.run({ command: 'md-view' })).toMatchObject({ text: 'No Markdown files in this session yet.' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: 'No Markdown files in this session yet.' })).toBeDefined()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await ui.unmount()
  }
})

test('adds a file Claude mentions later', async ($, on) => {
  const session = host(on, [])
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await say($, session, surface === 'terminal' ? 'See README.md.' : 'And docs/guide.md too.')

    expect((await ui.findAll({ type: 'Button' })).at(0)?.props.label).toBe(surface === 'terminal' ? 'README.md' : 'docs/guide.md')
    await ui.unmount()
  }
})

test('adds a file Claude runs a command on', async ($, on) => {
  const session = host(on, [])
  await start($)
  await say($, session, '', [{ name: 'Bash', input: { command: 'wc -l notes/todo.md' } }])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['notes/todo.md'])
})
