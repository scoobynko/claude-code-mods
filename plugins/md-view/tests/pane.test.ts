import { expect, test } from 'claude-code/testing'

import { GUIDE, PANE, README, SURFACES, host, run, say, start } from './host'

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

  expect(await run($)).toMatchObject({ text: 'Markdown pane: 2 files.' })
  expect(opened).toEqual([{ id: 'md-view', title: 'Markdown', closeOnEscape: true, focus: true }])
})

test('says so when the session has no files', async ($, on) => {
  host(on, [])
  await start($)

  expect(await run($)).toMatchObject({ text: 'No Markdown files in this session yet.' })
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

test('picking a file renders it', async ($, on) => {
  host(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'file-0' })

    expect(await ui.find({ type: 'Text', text: 'docs/guide.md' })).toMatchObject({ props: { dimColor: true } })
    expect((await ui.findAll({ type: 'Markdown' })).map(part => part.props.text)).toEqual([GUIDE])
    await ui.press({ key: 'files' })
    await ui.unmount()
  }
})

test('going back to the list keeps the last file focused', async ($, on) => {
  host(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'file-1' })
    await ui.press({ key: 'files' })

    expect(await ui.find({ type: 'Button', key: 'file-1' })).toMatchObject({ props: { label: 'README.md', autoFocus: true, dimColor: false } })
    expect((await ui.find({ type: 'Button', key: 'file-0' }))?.props.autoFocus).toBeUndefined()
    await ui.unmount()
  }
})

test('/md-view with a path previews that file', async ($, on) => {
  const { opened } = host(on, [])
  await start($)

  expect(await run($, ' @README.md ')).toMatchObject({ text: 'Previewing README.md.' })
  expect(opened).toHaveLength(1)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(README)
    await ui.unmount()
  }
})

test('says when the file is gone', async ($, on) => {
  const { disk } = host(on)
  await start($)
  delete disk['/proj/docs/guide.md']
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'file-0' })

    expect(await ui.find({ type: 'Text', text: 'File not found.' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.press({ key: 'files' })
    await ui.unmount()
  }
})

test('says when a file is cut short', async ($, on) => {
  const { disk } = host(on)
  const long = Array.from({ length: 2000 }, (_, i) => `Line ${i} ${'x'.repeat(26)}`).join('\n\n')
  disk['/proj/docs/guide.md'] = long
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'file-0' })
    const parts = await ui.findAll({ type: 'Markdown' })

    const shown = parts.reduce((sum, part) => sum + String(part.props.text).length, 0)

    expect(long.length).toBeGreaterThan(60_000)
    expect(shown).toBeGreaterThan(50_000)
    expect(shown).toBeLessThanOrEqual(60_000)
    expect(await ui.find({ type: 'Text', text: /^Showing the first [\d,]+ of [\d,]+ characters\.$/ })).toBeDefined()
    expect(parts.length).toBeGreaterThan(1)
    expect(Math.max(...parts.map(part => String(part.props.text).length))).toBeLessThanOrEqual(10_000)
    await ui.press({ key: 'files' })
    await ui.unmount()
  }
})

test('says when a file is empty', async ($, on) => {
  const { disk } = host(on)
  disk['/proj/docs/guide.md'] = ''
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'file-0' })

  expect(await ui.find({ type: 'Text', text: 'Empty file.' })).toBeDefined()
})

test('redraws when Claude edits the shown file', async ($, on) => {
  const { disk } = host(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'file-0' })
    disk['/proj/docs/guide.md'] = `# Guide for ${surface}`
    await $.tool.call({ tool: 'Edit', tool_use_id: `edit-${surface}`, file_path: '/proj/docs/guide.md', old_string: 'a', new_string: 'b' })

    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(`# Guide for ${surface}`)
    await ui.press({ key: 'files' })
    await ui.unmount()
  }
})

test('redraws at the end of a turn when a command changed the shown file', async ($, on) => {
  const { disk } = host(on)
  on('turn.complete', () => ({ text: '' }))
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'file-0' })
  disk['/proj/docs/guide.md'] = '# Rewritten by sed'
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('# Rewritten by sed')
})

test('lists a file Claude has just written', async ($, on) => {
  const session = host(on, [])
  on('tool.call', () => ({ result: {} }))
  await start($)
  await say($, session, 'Writing docs/plan.md.', [{ name: 'Write', input: { file_path: '/proj/docs/plan.md', content: '# Plan' } }])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)

  session.disk['/proj/docs/plan.md'] = '# Plan'
  await $.tool.call({ tool: 'Write', tool_use_id: 'write-1', file_path: '/proj/docs/plan.md', content: '# Plan' })

  expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['docs/plan.md'])
})

test("stacks a wide table at the pane's width", async ($, on) => {
  const { disk } = host(on)
  disk['/proj/docs/guide.md'] = '| Mod | What it does |\n| --- | --- |\n| clawd | Types on a tiny laptop under the spinner |'
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: 40 } })
    await ui.press({ key: 'file-0' })

    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('- **Mod:** clawd\n- **What it does:** Types on a tiny laptop under the spinner')
    await ui.press({ key: 'files' })
    await ui.unmount()
  }
})

test('cuts a path longer than the pane from its start', async ($, on) => {
  const session = host(on, [])
  session.disk['/elsewhere/a-very-long-folder-name/another-long-folder-name/notes.md'] = '# Notes'
  await start($)
  await say($, session, '', [{ name: 'Read', input: { file_path: '/elsewhere/a-very-long-folder-name/another-long-folder-name/notes.md' } }])
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: 30 } })

    expect((await ui.find({ type: 'Button', key: 'file-0' }))?.props.label).toBe('…her-long-folder-name/notes.md')
    await ui.unmount()
  }
})
