const FENCE = /^ {0,3}(`{3,}|~{3,})/

export const fenceAfter = (open: string, line: string): string => {
  const mark = FENCE.exec(line)?.[1]
  if (!mark) return open
  if (!open) return mark
  return mark[0] === open[0] && mark.length >= open.length && line.trim() === mark ? '' : open
}
