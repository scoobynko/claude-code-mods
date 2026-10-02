import { fenceAfter, marked } from './fences'

export const MAX_CHARS = 60_000
export const MARKDOWN_CHARS = 10_000
export const CHUNK_CHARS = 9_000
export const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

const CONTROLS = new RegExp(CONTROL.source, 'g')
const PIECE_CHARS = CHUNK_CHARS - 300
const TABLE_CHARS = 4_000
const TAIL_CHARS = 2_000
const OPENER_CHARS = 200
const FRONT_MATTER_CHARS = 4_000
const FRONT_MATTER = /^---\n(?=[\w-]+:)([\s\S]*?)\n---(\n|$)/
const RULE_CELL = /^:?-+:?$/
const MARKS = /\p{M}/gu
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/gu

export type Loaded = { text: string; totalChars: number }

type Layout = { text: string; columns: number; parts: string[] }

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff

const endBefore = (text: string, end: number): number =>
  end < text.length && isHighSurrogate(text.charCodeAt(end - 1)) ? end - 1 : end

const sizeOf = (lines: string[]): number => lines.reduce((sum, line) => sum + line.length + 1, 0)

export const load = (raw: string): Loaded => {
  const clean = raw.replace(/\r\n?/g, '\n').replace(CONTROLS, '')
  if (clean.length <= MAX_CHARS) return { text: clean, totalChars: clean.length }
  const cut = clean.lastIndexOf('\n', MAX_CHARS)
  const end = cut > MAX_CHARS - TAIL_CHARS ? cut : endBefore(clean, MAX_CHARS)
  return { text: clean.slice(0, end), totalChars: clean.length }
}

const fenceFrontMatter = (text: string): string => {
  const match = FRONT_MATTER.exec(text)
  if (!match || match[0].length > FRONT_MATTER_CHARS) return text
  const body = match[1] ?? ''
  const longest = Math.max(0, ...Array.from(body.matchAll(/`+/g), run => run[0].length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}yaml\n${body}\n${fence}\n${text.slice(match[0].length)}`
}

const cellsOf = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.trim())

const shownLength = (cell: string): number => {
  const shown = cell.replace(/\[([^\][]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(MARKS, '')
  return [...shown].length + (shown.match(WIDE)?.length ?? 0)
}

const stack = (header: string[], rows: string[][]): string[] =>
  rows.flatMap((row, index) => [
    ...(index > 0 ? [''] : []),
    ...row.flatMap((cell, column) => (cell ? [`- **${header[column] ?? ''}:** ${cell}`] : [])),
  ])

const repeatHead = (head: string[], body: string[]): string[] => {
  const out = [...head]
  let size = sizeOf(head)
  for (const row of body) {
    if (size + row.length + 1 > TABLE_CHARS && size > sizeOf(head)) {
      out.push('', ...head)
      size = sizeOf(head)
    }
    out.push(row)
    size += row.length + 1
  }
  return out
}

const narrowTables = (lines: string[], columns: number): string[] => {
  const rows = marked(lines)
  const isRow = (index: number) => {
    const row = rows[index]
    return row !== undefined && !row.isCode && row.line.includes('|') && row.line.trim() !== ''
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const header = cellsOf(line)
    const rule = cellsOf(lines[i + 1] ?? '')
    const isTable = isRow(i) && !rows[i + 1]?.isCode && rule.length === header.length && rule.every(cell => RULE_CELL.test(cell))
    let end = i + 2
    while (isTable && isRow(end)) end++
    if (!isTable || end === i + 2) {
      out.push(line)
      continue
    }
    const body = lines.slice(i + 2, end).map(cellsOf)
    const width = header.reduce(
      (sum, cell, column) => sum + 3 + Math.max(shownLength(cell), ...body.map(row => shownLength(row[column] ?? ''))),
      1,
    )
    out.push(...(width > columns ? stack(header, body) : repeatHead(lines.slice(i, i + 2), lines.slice(i + 2, end))))
    i = end - 1
  }
  return out
}

const blocksOf = (lines: string[]): string[][] => {
  const blocks: string[][] = [[]]
  let fence = ''
  for (const line of lines) {
    const next = fenceAfter(fence, line)
    if (!fence && !next && line.trim() === '') blocks.push([])
    else blocks.at(-1)?.push(line)
    fence = next
  }
  if (fence) blocks.at(-1)?.push(fence)
  return blocks.filter(block => block.length > 0)
}

const split = (block: string[]): string[][] => {
  const pieces: string[][] = []
  let current: string[] = []
  let size = 0
  let fence = ''
  let opener = ''
  const flush = () => {
    pieces.push(fence ? [...current, fence] : current)
    current = fence ? [opener] : []
    size = sizeOf(current)
  }
  for (const line of block) {
    const next = fenceAfter(fence, line)
    const closing = fence ? fence.length + 1 : 0
    const isClosing = fence !== '' && next === ''
    let at = 0
    do {
      const end = endBefore(line, Math.min(line.length, at + PIECE_CHARS))
      if (!isClosing && current.length > 0 && size + end - at + 1 + closing > CHUNK_CHARS) flush()
      current.push(line.slice(at, end))
      size += end - at + 1
      at = end
    } while (at < line.length)
    if (!fence && next) opener = line.length <= OPENER_CHARS ? line : next
    fence = next
  }
  if (current.length > 0) pieces.push(current)
  return pieces
}

const chunk = (lines: string[]): string[] => {
  const chunks: string[][] = []
  let size = 0
  for (const block of blocksOf(lines).flatMap(block => (sizeOf(block) > CHUNK_CHARS ? split(block) : [block]))) {
    const blockSize = sizeOf(block)
    const open = chunks.at(-1)
    if (open && size + 1 + blockSize <= CHUNK_CHARS) {
      open.push('', ...block)
      size += 1 + blockSize
    } else {
      chunks.push([...block])
      size = blockSize
    }
  }
  return chunks.map(block => block.join('\n'))
}

let last: Layout | null = null

export const layout = (text: string, columns: number): string[] => {
  if (last?.text === text && last.columns === columns) return last.parts
  const parts = chunk(narrowTables(fenceFrontMatter(text).split('\n'), columns))
  last = { text, columns, parts }
  return parts
}
