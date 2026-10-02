export const image = (media_type: string, data: string) => ({ type: 'image', source: { type: 'base64', media_type, data } })

export const PASTED = 'P'.repeat(300)
export const SHOT = 'S'.repeat(300)

export const pngHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

type Row = { role: 'user' | 'assistant'; content: Array<{ type: string; [field: string]: unknown }> }

export const call = (name: string, input: object, id = 't1', result: unknown = 'ok'): [Row, Row] => [
  { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: result }] },
]
