import { fenceAfter } from './fences'

export const MAX_CHARS = 60_000
export const CHUNK_CHARS = 9_000
export const MARKDOWN_CHARS = 10_000

const LINE_CHARS = CHUNK_CHARS - 200
const FRONT_MATTER_CHARS = 4_000
const FRONT_MATTER = /^---\n(?=[\w-]+:)([\s\S]*?)\n---(\n|$)/
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

export type Loaded = { text: string; totalChars: number }

export const load = (raw: string): Loaded => {
  const clean = raw.replace(/\r\n?/g, '\n').replace(CONTROL, '')
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
  [...cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '')].length

const stack = (header: string[], rows: string[][]): string[] =>
  rows.flatMap((row, index) => [
    ...(index > 0 ? [''] : []),
    ...row.flatMap((cell, column) => (cell ? [`- **${header[column] ?? ''}:** ${cell}`] : [])),
  ])

const isRow = (line: string | undefined): line is string => line !== undefined && line.includes('|') && line.trim() !== ''

const narrowTables = (lines: string[], columns: number): string[] => {
  const out: string[] = []
  let fence = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const wasOpen = fence
    fence = fenceAfter(fence, line)
    const rule = lines[i + 1] ?? ''
    const header = cellsOf(line)
    const isTable = isRow(line) && rule.includes('-') && SEPARATOR.test(rule) && cellsOf(rule).length === header.length
    let end = i + 2
    while (isTable && isRow(lines[end])) end++
    if (wasOpen || fence || !isTable || end === i + 2) {
      out.push(line)
      continue
    }
    const rows = lines.slice(i + 2, end).map(cellsOf)
    const width = header.reduce(
      (sum, cell, column) => sum + 3 + Math.max(shownLength(cell), ...rows.map(row => shownLength(row[column] ?? ''))),
      1,
    )
    out.push(...(width > columns ? stack(header, rows) : lines.slice(i, end)))
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
  for (const line of lines) {
    const isBreak = !fence && line.trim() === ''
    if (size + line.length + 1 > CHUNK_CHARS || (isBreak && size > CHUNK_CHARS / 2)) flush()
    if (isBreak && current.length === 0) continue
    for (let at = 0; at < Math.max(line.length, 1); at += LINE_CHARS) {
      if (at > 0) flush()
      const piece = line.slice(at, at + LINE_CHARS)
      current.push(piece)
      size += piece.length + 1
    }
    const wasOpen = fence
    fence = fenceAfter(fence, line)
    if (!wasOpen && fence) opener = line
  }
  flush()
  return chunks
}

const slices = (part: string): string[] =>
  Array.from({ length: Math.ceil(part.length / MARKDOWN_CHARS) }, (_, index) =>
    part.slice(index * MARKDOWN_CHARS, (index + 1) * MARKDOWN_CHARS),
  )

export const layout = (text: string, columns: number): string[] =>
  chunk(narrowTables(fenceFrontMatter(text).split('\n'), columns)).flatMap(slices)
