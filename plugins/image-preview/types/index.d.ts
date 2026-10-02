export type ImageItem = {
  id: string
  label: string
  fragment: string
  at?: number
  agentId?: string
  file?: { path: string; version: number }
}

export type ImageFile = ({ file: string; width: number; height: number } | { error: string }) & { version?: number }

declare module 'claude-code' {
  interface PluginState {
    'image-preview': {
      items: ImageItem[]
      selected: string
      files: Record<string, ImageFile>
      seen: Record<string, number>
      agents: string[]
      zoomed: boolean
    }
  }
}
