import type { ClientModule } from 'claude-code'

const Zone: ClientModule<{ columns: number; rows: number }> = (size, surface) => {
  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left' && !event.ctrl && !event.alt && !event.shift) surface.post('toggle')
  })
  const { Box } = surface.elements

  return <Box width={size.columns} height={size.rows} />
}

export default Zone
