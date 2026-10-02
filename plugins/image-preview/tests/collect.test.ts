import { expect, test } from 'claude-code/testing'

import { arrivals, collect, imageId, imagePaths } from '../hooks/collect'
import { PASTED, SHOT, call, image } from './fixtures'


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
  const found = collect(call('Bash', { command: 'screencapture -x out/shot.png && ls *.png' }))

  expect(found).toMatchObject([{ kind: 'path', path: 'out/shot.png', label: 'Bash shot.png' }])
})

test('lists a read image once, not also as a path', () => {
  const found = collect(call('Read', { file_path: '/work/a.png' }, 't1', [image('image/png', SHOT)]))

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

test('reads quoted and escaped paths with spaces, whole first and then the words inside', () => {
  expect(imagePaths(`cp My\\ Shot.png "/tmp/My Shots/Screen Shot 1.png" 'out dir/b.jpg'`)).toEqual([
    'My Shot.png',
    '/tmp/My Shots/Screen Shot 1.png',
    '1.png',
    'out dir/b.jpg',
    'dir/b.jpg',
  ])
})

test('reads a path inside quoted prose', () => {
  expect(imagePaths('echo "see docs/a.png"')).toContain('docs/a.png')
})

test('reads paths with letters beyond ASCII', () => {
  expect(imagePaths('open obrázek.png')).toEqual(['obrázek.png'])
})

test('takes a whole MCP argument as a path, spaces and all', () => {
  expect(collect(call('mcp__browser__screenshot', { path: '/tmp/My Shots/page.png' }))[0]).toMatchObject({
    kind: 'path',
    path: '/tmp/My Shots/page.png',
  })
})

test('finds a file a command only printed', () => {
  const found = collect(call('Bash', { command: 'python plot.py' }, 't1', [{ type: 'text', text: 'Saved chart to out/chart.png' }]))

  expect(found).toMatchObject([{ kind: 'path', path: 'out/chart.png', label: 'Bash chart.png', from: 'call' }])
})

test('finds a file Claude only mentioned, without displacing the call that named it', () => {
  const mention = { role: 'assistant', content: [{ type: 'text', text: 'I saved the diagram to `/tmp/x/diagram.png`.' }] }

  expect(collect([mention])).toMatchObject([
    { kind: 'path', path: '/tmp/x/diagram.png', label: 'file diagram.png', from: 'text', fragment: 'I saved the diagram to `/tmp/x/diagram.png`.' },
  ])
  expect(collect([...call('Bash', { command: 'dot -o /tmp/x/diagram.png g.dot' }), mention])).toMatchObject([
    { path: '/tmp/x/diagram.png', label: 'Bash diagram.png', from: 'call' },
  ])
})

test('remembers the folders commands moved into', () => {
  const found = collect([
    ...call('Bash', { command: 'cd "build dir" && make' }, 't1'),
    ...call('Bash', { command: 'cd ../out; ./render.sh --out=fig.png' }, 't2'),
  ])

  expect(found).toMatchObject([{ kind: 'path', path: 'fig.png', bases: ['../out', 'build dir'] }])
})

const rows = (name: string, input: object, result: unknown) => {
  const [asked, answered] = call(name, input, 't1', result)
  return { asked: asked.content, answered: answered.content }
}

test('counts an image in a prompt or a tool result as news', () => {
  const pasted = arrivals('user', [{ type: 'text', text: 'look' }, image('image/png', PASTED)], new Map())
  const { answered } = rows('Read', { file_path: '/work/a.png' }, [image('image/jpeg', SHOT)])
  const read = arrivals('user', answered, new Map())

  expect(pasted).toEqual({ images: [{ data: PASTED, mediaType: 'image/png' }], isNews: true })
  expect(read).toEqual({ images: [{ data: SHOT, mediaType: 'image/jpeg' }], isNews: true })
})

test('counts the result of a command that named or printed an image file as news', () => {
  const pending = new Map<string, boolean>()
  const named = rows('Bash', { command: 'screencapture -x shot.png' }, 'ok')
  const printed = rows('mcp__browser__screenshot', {}, 'Saved to out/page.png')

  expect(arrivals('assistant', named.asked, pending).isNews).toBe(false)
  expect(arrivals('user', named.answered, pending).isNews).toBe(true)
  expect(arrivals('assistant', printed.asked, pending).isNews).toBe(false)
  expect(arrivals('user', printed.answered, pending).isNews).toBe(true)
  expect(pending.size).toBe(0)
})

test('counts a file Claude mentions as news', () => {
  expect(arrivals('assistant', [{ type: 'text', text: 'Saved it to out/chart.png.' }], new Map()).isNews).toBe(true)
})

test('does not count what cannot add an image', () => {
  const pending = new Map<string, boolean>()
  const grep = rows('Grep', { pattern: 'logo' }, 'assets/logo.png:1: binary')
  const quiet = rows('Bash', { command: 'ls' }, 'README.md')

  expect(arrivals('assistant', grep.asked, pending).isNews).toBe(false)
  expect(arrivals('user', grep.answered, pending).isNews).toBe(false)
  expect(arrivals('assistant', quiet.asked, pending).isNews).toBe(false)
  expect(arrivals('user', quiet.answered, pending).isNews).toBe(false)
  expect(arrivals('user', [{ type: 'text', text: 'see docs/a.png' }], pending).isNews).toBe(false)
})
