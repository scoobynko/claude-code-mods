import { fenceAfter, marked } from './fences'

export const MAX_CHARS = 60_000
export const MARKDOWN_CHARS = 10_000
export const CHUNK_CHARS = 9_000
export const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

const CONTROLS = new RegExp(CONTROL.source, 'g')
const PIECE_CHARS = CHUNK_CHARS - 300
const OPENER_CHARS = 200
const FRONT_MATTER_CHARS = 4_000
const FRONT_MATTER = /^---\n(?=[\w-]+:)([\s\S]*?)\n---(\n|$)/
const RULE_CELL = /^:?-+:?$/

export type Loaded = { text: string; totalChars: number }

type Layout = { text: string; columns: number; parts: string[] }

export const load = (raw: string): Loaded => {
  const clean = raw.replace(/\r\n?/g, '\n').replace(CONTROLS, '')
  if (clean.length <= MAX_CHARS) return { text: clean, totalChars: clean.length }
  const cut = clean.lastIndexOf('\n', MAX_CHARS)
  return { text: clean.slice(0, cut > 0 ? cut : MAX_CHARS), totalChars: clean.length }
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

const shownLength = (cell: string): number =>
  [...cell.replace(/\[([^\][]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '')].length

const stack = (header: string[], rows: string[][]): string[] =>
  rows.flatMap((row, index) => [
    ...(index > 0 ? [''] : []),
    ...row.flatMap((cell, column) => (cell ? [`- **${header[column] ?? ''}:** ${cell}`] : [])),
  ])

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
    out.push(...(width > columns ? stack(header, body) : lines.slice(i, end)))
    i = end - 1
  }
  return out
}

const chunk = (lines: string[]): string[] => {
  const chunks: string[] = []
  let current: string[] = []
  let size = 0
  let fence = ''
  let opener = ''
  const flush = () => {
    if (current.length === 0) return
    chunks.push([...current, ...(fence ? [fence] : [])].join('\n'))
    current = fence ? [opener] : []
    size = fence ? opener.length + 1 : 0
  }
  const push = (piece: string, isClosing: boolean) => {
    const closing = fence ? fence.length + 1 : 0
    if (!isClosing && size + piece.length + 1 + closing > CHUNK_CHARS) flush()
    current.push(piece)
    size += piece.length + 1
  }
  for (const line of lines) {
    const next = fenceAfter(fence, line)
    const isBreak = !fence && line.trim() === ''
    if (isBreak && size > CHUNK_CHARS / 2) flush()
    if (isBreak && current.length === 0) continue
    for (let at = 0; at < Math.max(line.length, 1); at += PIECE_CHARS) {
      push(line.slice(at, at + PIECE_CHARS), fence !== '' && next === '')
    }
    if (!fence && next) opener = line.length <= OPENER_CHARS ? line : next
    fence = next
  }
  flush()
  return chunks
}

let last: Layout | null = null

export const layout = (text: string, columns: number): string[] => {
  if (last?.text === text && last.columns === columns) return last.parts
  const parts = chunk(narrowTables(fenceFrontMatter(text).split('\n'), columns))
  last = { text, columns, parts }
  return parts
}
