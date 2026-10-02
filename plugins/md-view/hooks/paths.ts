import { fenceAfter } from './fences'

const TOKEN = String.raw`[\w.+~\/-][\w@.+~\/-]*\.md`
const BEFORE = String.raw`(?<![\w@.+~\/:-])`
const AFTER = String.raw`(?![\w@+~\/-]|\.\w)`
const LINK = String.raw`(\[(?:[^\]\n\\]|\\.)*\]\(([^)\n]*)\))`
const CODE = '(`+)([^`\\n]+)\\3'
const MENTION = new RegExp(`${BEFORE}@?(${TOKEN})${AFTER}`, 'gi')
const INLINE = new RegExp(`${LINK}|${CODE}|${BEFORE}(@?)(${TOKEN})${AFTER}`, 'gi')
const WHOLE = new RegExp(`^${TOKEN}$`, 'i')

export const hasMention = (text: string): boolean => /\.md(?![\w-])/i.test(text)

export const mentionsIn = (text: string): string[] => Array.from(text.matchAll(MENTION), match => match[1] ?? '')

export const resolvePath = (raw: string, cwd: string, home: string): string => {
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

export const pathOfHref = (href: string, cwd: string, home: string): string | null => {
  const target = href.trim().replace(/^<|>$/g, '').replace(/\s+["'].*$/, '')
  if (/^file:\/\//i.test(target)) {
    try {
      return resolvePath(decodeURIComponent(target.slice(7)), cwd, home)
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || !/\.md$/i.test(target)) return null
  try {
    return resolvePath(decodeURIComponent(target), cwd, home)
  } catch {
    return null
  }
}

export const displayPath = (path: string, cwd: string, home: string): string => {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

export type Linkified = { text: string; hrefs: string[] }

export const linkify = (text: string, known: ReadonlySet<string>, cwd: string, home: string): Linkified => {
  const hrefs = new Set<string>()
  const hrefFor = (raw: string) => {
    const path = resolvePath(raw, cwd, home)
    if (!known.has(path)) return null
    const href = hrefOf(path)
    hrefs.add(href)
    return href
  }
  const inline = (line: string) =>
    line.replace(INLINE, (whole, link, target, ticks, code, at, token) => {
      if (link) {
        const path = pathOfHref(target, cwd, home)
        if (path && known.has(path)) hrefs.add(target)
        return whole
      }
      if (ticks) {
        const href = WHOLE.test(code.trim()) ? hrefFor(code.trim()) : null
        return href ? `[${whole}](${href})` : whole
      }
      const href = hrefFor(token)
      return href ? `${at}[${token}](${href})` : whole
    })
  let fence = ''
  const lines = text.split('\n').map(line => {
    const wasOpen = fence
    fence = fenceAfter(fence, line)
    return wasOpen || fence ? line : inline(line)
  })
  return { text: lines.join('\n'), hrefs: [...hrefs] }
}
