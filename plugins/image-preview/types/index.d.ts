export type ImageItem = {
  id: string
  label: string
  fragment: string
  at?: number
}

export type ImageFile = { file: string; width: number; height: number; stamp?: number } | { error: string }

declare module 'claude-code' {
  interface PluginState {
    'image-preview': {
      items: ImageItem[]
      selected: string
      files: Record<string, ImageFile>
      seen: Record<string, number>
    }
  }
}
