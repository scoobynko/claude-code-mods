const FENCE = /^(?:[\s>]|[-*+]\s|\d+[.)]\s)*(`{3,}|~{3,})(.*)$/

export const fenceAfter = (open: string, line: string): string => {
  const [, mark, rest = ''] = FENCE.exec(line) ?? []
  if (!mark) return open
  if (!open) return mark.startsWith('`') && rest.includes('`') ? '' : mark
  return mark[0] === open[0] && mark.length >= open.length && rest.trim() === '' ? '' : open
}
