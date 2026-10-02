const FENCE = /^(?:[\s>]|[-*+]\s|\d+[.)]\s)*(`{3,64}|~{3,64})(.*)$/

export type Marked = { line: string; isCode: boolean }

export const fenceAfter = (open: string, line: string): string => {
  const [, mark, rest = ''] = FENCE.exec(line) ?? []
  if (!mark) return open
  if (!open) return mark.startsWith('`') && rest.includes('`') ? '' : mark
  return mark[0] === open[0] && mark.length >= open.length && rest.trim() === '' ? '' : open
}

export const marked = (lines: string[]): Marked[] => {
  let fence = ''
  return lines.map(line => {
    const wasOpen = fence !== ''
    fence = fenceAfter(fence, line)
    return { line, isCode: wasOpen || fence !== '' }
  })
}
