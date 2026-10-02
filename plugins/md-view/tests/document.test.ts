import { expect, test } from 'claude-code/testing'

import { CHUNK_CHARS, MARKDOWN_CHARS, MAX_CHARS, layout, load } from '../hooks/document'

const fencesOf = (part: string) => (part.match(/^```/gm) ?? []).length

test('cleans line endings and control characters', async () => {
  expect(load('# Title\r\n\nred \u001b[31mtext\ttab\u0007')).toEqual({ text: '# Title\n\nred [31mtext\ttab', totalChars: 25 })
})

test('caps a large file on a line boundary and keeps its real length', async () => {
  const raw = Array.from({ length: 4000 }, (_, i) => `line ${i} ${'x'.repeat(30)}`).join('\n')
  const loaded = load(raw)
  expect(loaded.totalChars).toBe(raw.length)
  expect(loaded.text.length).toBeLessThanOrEqual(MAX_CHARS)
  expect(raw.startsWith(`${loaded.text}\n`)).toBe(true)
})

test('draws front matter as a yaml fence', async () => {
  expect(layout('---\nname: x\n---\n# Title', 80)).toEqual(['```yaml\nname: x\n```\n# Title'])
})

test('stacks a table wider than the pane and keeps one that fits', async () => {
  const long = 'long words '.repeat(8).trim()
  const wide = `| Mod | What it does |\n| --- | :-- |\n| clawd | ${long} |\n| two | |`
  const fits = '| a | b |\n|---|---|\n| 1 | 2 |'
  expect(layout(`${wide}\n\n${fits}`, 60)).toEqual([
    `- **Mod:** clawd\n- **What it does:** ${long}\n\n- **Mod:** two\n\n${fits}`,
  ])
})

test('leaves a table inside a fence alone', async () => {
  const text = '```\n| a very long header that is wide | another very long header that is wide |\n|---|---|\n```'
  expect(layout(text, 20)).toEqual([text])
})

test('splits a long document into chunks the Markdown element takes', async () => {
  const text = [
    Array.from({ length: 150 }, (_, i) => `Paragraph ${i} ${'word '.repeat(30)}`).join('\n\n'),
    `\`\`\`ts\n${'const x = 1\n'.repeat(1200)}\`\`\``,
    `tail ${'x'.repeat(15_000)}`,
  ].join('\n\n')
  const loaded = load(text)
  const parts = layout(loaded.text, 80)
  expect(loaded.text.length).toBe(loaded.totalChars)
  expect(parts.length).toBeGreaterThan(1)
  for (const part of parts) {
    expect(part.length).toBeLessThanOrEqual(CHUNK_CHARS)
    expect(fencesOf(part) % 2).toBe(0)
  }
  expect(parts.join('\n').includes('Paragraph 149')).toBe(true)
  expect(parts.join('').includes('x'.repeat(8000))).toBe(true)
})

test('closes an unclosed fence and survives an empty file', async () => {
  expect(layout('```ts\nconst x = 1', 80)).toEqual(['```ts\nconst x = 1\n```'])
  expect(layout('', 80)).toEqual([])
})

test('drops the control characters a Markdown element refuses', async () => {
  expect(load('a\u0085b\u0092c\u009fd').text).toBe('abcd')
})

test('keeps prose with a pipe above a rule', async () => {
  const text = 'Run `foo | bar` to pipe the output of foo into bar and then into baz again\n---\nnext'
  expect(layout(text, 40)).toEqual([text])
})

test('keeps a wide table that has no rows', async () => {
  const text = '| a very long header cell | another very long header cell |\n| --- | --- |'
  expect(layout(text, 20)).toEqual([text])
})

test('takes only key lines between rules for front matter', async () => {
  const text = '---\n\nSome text\n\n---\nmore'
  expect(layout(text, 80)).toEqual([text])
  expect(layout('---\nname: x\nnote: "```"\n---\n# Title', 80)).toEqual(['````yaml\nname: x\nnote: "```"\n````\n# Title'])
})

test('leaves a table in a fence nested in a list alone', async () => {
  const text = '- item\n    ```\n    | a very long header that is wide | another very long header |\n    |---|---|\n    | 1 | 2 |\n    ```'
  expect(layout(text, 20)).toEqual([text])
})

test('never hands the Markdown element more than it takes', async () => {
  const ticks = layout(`${'`'.repeat(2000)}\n${'x\n'.repeat(6000)}`, 80)
  const info = layout(`\`\`\`${'a'.repeat(20_000)}\n${'x\n'.repeat(6000)}\`\`\``, 80)

  expect(Math.max(...ticks.map(part => part.length))).toBeLessThanOrEqual(MARKDOWN_CHARS)
  expect(Math.max(...info.map(part => part.length))).toBeLessThanOrEqual(MARKDOWN_CHARS)
  expect(info.length).toBeLessThan(10)
})
