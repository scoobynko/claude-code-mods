import { expect, test } from 'claude-code/testing'

import { collect, imageId, imagePaths } from '../hooks/collect'

const image = (media_type: string, data: string) => ({ type: 'image', source: { type: 'base64', media_type, data } })
const PASTED = 'P'.repeat(300)
const SHOT = 'S'.repeat(300)

test('finds a pasted image with the text typed beside it', () => {
  const found = collect([
    {
      role: 'user',
      content: [
        { type: 'text', text: '<system-reminder>ignore me</system-reminder>' },
        { type: 'text', text: 'Why is this\nbutton off-centre?' },
        image('image/png', PASTED),
      ],
    },
  ])

  expect(found).toEqual([
    { kind: 'block', id: imageId(PASTED), label: 'pasted', fragment: 'Why is this button off-centre?', mediaType: 'image/png', data: PASTED },
  ])
})

test('finds a tool image, named by its tool and file, with what Claude said before the call', () => {
  const found = collect([
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me look at the mockup.' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/work/mockup.jpg' } },
      ],
    },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [image('image/jpeg', SHOT)] }] },
  ])

  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ kind: 'block', label: 'Read mockup.jpg', fragment: 'Let me look at the mockup.', mediaType: 'image/jpeg' })
})

test('falls back to the call itself when Claude said nothing, and names an MCP tool by tool and server', () => {
  const found = collect([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'mcp__shots__screenshot', input: { url: 'http://localhost:3000' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'Taken.' }, image('image/png', SHOT)] }] },
  ])

  expect(found[0]).toMatchObject({ label: 'screenshot (shots)', fragment: 'mcp__shots__screenshot http://localhost:3000' })
})

test('finds image paths in a call whose result held no image', () => {
  const found = collect([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'screencapture -x out/shot.png && ls *.png' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] },
  ])

  expect(found).toMatchObject([{ kind: 'path', path: 'out/shot.png', label: 'Bash shot.png' }])
})

test('lists a read image once, not also as a path', () => {
  const found = collect([
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/work/a.png' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [image('image/png', SHOT)] }] },
  ])

  expect(found.map(one => one.kind)).toEqual(['block'])
})

test('lists the same image once, at its latest place', () => {
  const found = collect([
    { role: 'user', content: [{ type: 'text', text: 'first' }, image('image/png', PASTED)] },
    { role: 'user', content: [{ type: 'text', text: 'other' }, image('image/png', SHOT)] },
    { role: 'user', content: [{ type: 'text', text: 'again' }, image('image/png', PASTED)] },
  ])

  expect(found.map(one => one.fragment)).toEqual(['other', 'again'])
})

test('skips images it holds no bytes for', () => {
  expect(collect([{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } }] }])).toEqual([])
})

test('tells images apart by their bytes', () => {
  expect(imageId(PASTED)).not.toBe(imageId(SHOT))
  expect(imageId(PASTED)).toMatch(/^[a-z0-9-]+$/)
})

test('reads image paths out of any input', () => {
  expect(imagePaths({ command: 'convert a.jpeg ./b.webp', nested: ['~/c.GIF', 'notes.txt'] })).toEqual(['a.jpeg', './b.webp', '~/c.GIF'])
})

const call = (name: string, input: object, id = 't1') => [
  { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
]

test('reads a long unbroken input quickly', () => {
  const started = Date.now()

  expect(imagePaths({ content: 'A'.repeat(60_000) })).toEqual([])
  expect(Date.now() - started).toBeLessThan(300)
})

test('finds a file named by a flag', () => {
  expect(imagePaths('shot --output=out/a.png')).toEqual(['out/a.png'])
})

test('looks for image files only in commands and MCP tools', () => {
  expect(collect(call('Edit', { file_path: 'README.md', old_string: 'see docs/a.png', new_string: 'see docs/b.png' }))).toEqual([])
  expect(collect(call('mcp__browser__screenshot', { path: 'out/page.png' }))).toMatchObject([
    { kind: 'path', path: 'out/page.png', label: 'screenshot (browser) page.png' },
  ])
})

test('lists one file once however its path is spelled', () => {
  const found = collect([
    ...call('Bash', { command: 'screencapture -x shot.png' }, 't1'),
    ...call('Bash', { command: 'open ./shot.png' }, 't2'),
  ])

  expect(found.map(one => (one.kind === 'path' ? one.path : ''))).toEqual(['shot.png'])
})
