import { marked } from './fences'

export type Place = { cwd: string; home: string }
export type Linkified = { text: string; hrefs: string[] }

type Found = { link?: string; target?: string; ticks?: string; code?: string; url?: string; at?: string; token?: string }

const NAME = String.raw`\p{L}\p{M}\p{N}_`
const TOKEN = String.raw`[${NAME}.+~\/-][${NAME}@.+~\/-]*\.md`
const BEFORE = String.raw`(?<![${NAME}@.+~\/:-])`
const AFTER = String.raw`(?![${NAME}@+~\/-]|\.[${NAME}])`
const LINK = String.raw`(?<link>\[(?:[^\]\n\\]|\\.)*\]\((?<target>[^)\n]*)\))`
const CODE = '(?<!`)(?<ticks>`+)(?!`)(?<code>.+?)(?<!`)\\k<ticks>(?!`)'
const URL_TEXT = String.raw`[a-z][a-z0-9+.-]{0,31}:\/\/[^\s<>]+`
const URLS = new RegExp(URL_TEXT, 'gi')
const MENTION = new RegExp(`${BEFORE}@?(${TOKEN})${AFTER}`, 'giu')
const INLINE = new RegExp(`${LINK}|${CODE}|(?<url>${URL_TEXT})|${BEFORE}(?<at>@?)(?<token>${TOKEN})${AFTER}`, 'giu')
const WHOLE = new RegExp(`^${TOKEN}$`, 'iu')
const FILE_URL = /^file:\/\//i
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const MARKDOWN_FILE = /\.md$/i

export const isMarkdown = (path: string): boolean => MARKDOWN_FILE.test(path)

export const hasMention = (text: string): boolean => /\.md(?![\w-])/i.test(text)

export const mentionsIn = (text: string): string[] =>
  Array.from(text.replace(URLS, ' ').matchAll(MENTION), match => match[1] ?? '')

export const resolvePath = (raw: string, { cwd, home }: Place): string => {
  const joined = raw.startsWith('~/') ? `${home}/${raw.slice(2)}` : raw.startsWith('/') ? raw : `${cwd}/${raw}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export const hrefOf = (path: string): string =>
  `file://${encodeURI(path).replace(/[()#?]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`

export const pathOfHref = (href: string, place: Place): string | null => {
  const target = href.trim().replace(/^<|>$/g, '').replace(/\s+["'].*$/, '')
  const isFileUrl = FILE_URL.test(target)
  if (!isFileUrl && (SCHEME.test(target) || !isMarkdown(target))) return null
  try {
    return resolvePath(decodeURIComponent(isFileUrl ? target.slice(7) : target), place)
  } catch {
    return null
  }
}

export const displayPath = (path: string, { cwd, home }: Place): string => {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

export const fitStart = (text: string, columns: number): string =>
  text.length > columns ? `…${text.slice(text.length - columns + 1)}` : text

export const linkify = (text: string, known: ReadonlySet<string>, place: Place): Linkified => {
  const hrefs = new Set<string>()
  const hrefFor = (raw: string) => {
    const path = resolvePath(raw, place)
    if (!known.has(path)) return null
    const href = hrefOf(path)
    hrefs.add(href)
    return href
  }
  const inline = (line: string) =>
    line.replace(INLINE, (whole: string, ...rest: unknown[]) => {
      const { link, target = '', ticks, code = '', url, at = '', token = '' } = rest.at(-1) as Found
      if (url) return whole
      if (link) {
        const path = pathOfHref(target, place)
        if (path && known.has(path)) hrefs.add(target)
        return whole
      }
      const href = ticks ? (WHOLE.test(code.trim()) ? hrefFor(code.trim()) : null) : hrefFor(token)
      if (!href) return whole
      return ticks ? `[${whole}](${href})` : `${at}[${token}](${href})`
    })
  const lines = marked(text.split('\n')).map(({ line, isCode }) => (isCode ? line : inline(line)))
  return { text: lines.join('\n'), hrefs: [...hrefs] }
}
