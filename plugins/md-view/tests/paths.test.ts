import { expect, test } from 'claude-code/testing'

import { displayPath, hrefOf, linkify, mentionsIn, pathOfHref, resolvePath } from '../hooks/paths'

const CWD = '/proj'
const HOME = '/Users/me'
const KNOWN = new Set(['/proj/docs/guide.md', '/proj/README.md', '/proj/my notes (1).md'])

test('finds .md paths in prose and commands, not urls or other suffixes', async () => {
  expect(
    mentionsIn(
      'See docs/guide.md, `README.md` and @notes/plan.md. Not https://github.com/a/b/README.md or a.md.bak or x.mdx; yes ~/n.md ../up.md ./here.md /abs/p.md node_modules/@s/p/README.md (CHANGELOG.MD).',
    ),
  ).toEqual(['docs/guide.md', 'README.md', 'notes/plan.md', '~/n.md', '../up.md', './here.md', '/abs/p.md', 'node_modules/@s/p/README.md', 'CHANGELOG.MD'])
})

test('resolves against the cwd and the home folder', async () => {
  expect(resolvePath('docs/../README.md', CWD, HOME)).toBe('/proj/README.md')
  expect(resolvePath('~/a/./b/../c.md', CWD, HOME)).toBe('/Users/me/a/c.md')
  expect(resolvePath('/abs/p.md', CWD, HOME)).toBe('/abs/p.md')
})

test('an href survives spaces and parentheses', async () => {
  const href = hrefOf('/proj/my notes (1).md')
  expect(href).toBe('file:///proj/my%20notes%20%281%29.md')
  expect(pathOfHref(href, CWD, HOME)).toBe('/proj/my notes (1).md')
  expect(pathOfHref('docs/guide.md', CWD, HOME)).toBe('/proj/docs/guide.md')
  expect(pathOfHref('https://example.com/README.md', CWD, HOME)).toBeNull()
})

test('shows a path relative to the cwd, then to home', async () => {
  expect(displayPath('/proj/docs/guide.md', CWD, HOME)).toBe('docs/guide.md')
  expect(displayPath('/Users/me/x.md', CWD, HOME)).toBe('~/x.md')
  expect(displayPath('/etc/x.md', CWD, HOME)).toBe('/etc/x.md')
})

test('links known files in prose and whole code spans, and nothing else', async () => {
  const linked = linkify(
    'See docs/guide.md and `README.md`, `cat README.md`, [r](README.md), [x](https://e.com/README.md), missing.md.\n```sh\ncat README.md\n```\n**README.md** @docs/guide.md',
    KNOWN,
    CWD,
    HOME,
  )
  expect(linked.text).toBe(
    'See [docs/guide.md](file:///proj/docs/guide.md) and [`README.md`](file:///proj/README.md), `cat README.md`, [r](README.md), [x](https://e.com/README.md), missing.md.\n```sh\ncat README.md\n```\n**[README.md](file:///proj/README.md)** @[docs/guide.md](file:///proj/docs/guide.md)',
  )
  expect(linked.hrefs).toEqual(['file:///proj/docs/guide.md', 'file:///proj/README.md', 'README.md'])
})

test('leaves text without known files unchanged', async () => {
  const text = 'Nothing here but missing.md and `other.md`.'
  expect(linkify(text, KNOWN, CWD, HOME)).toEqual({ text, hrefs: [] })
})
