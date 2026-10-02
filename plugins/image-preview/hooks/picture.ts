type Size = { width: number; height: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const HEADER_BYTES = 24
const MAX_CELLS = 255

export function pngSize(headerBase64: string): Size | undefined {
  let binary = ''
  try {
    binary = atob(headerBase64.trim())
  } catch {
    return undefined
  }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  if (bytes.length < HEADER_BYTES || !PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return undefined
  const view = new DataView(bytes.buffer)
  const size = { width: view.getUint32(16), height: view.getUint32(20) }
  return size.width > 0 && size.height > 0 ? size : undefined
}

const clamp = (value: number, max: number) => Math.max(1, Math.min(Math.round(value), max))

export function fit(size: Size, columns: number, rows: number) {
  const maxColumns = clamp(columns, MAX_CELLS)
  const maxRows = clamp(rows, MAX_CELLS)
  const natural = (maxColumns * size.height) / size.width / 2
  if (natural <= maxRows) return { columns: maxColumns, rows: clamp(natural, maxRows) }
  return { columns: clamp((maxRows * 2 * size.width) / size.height, maxColumns), rows: maxRows }
}
