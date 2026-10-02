export type MdView = {
  mode: 'list' | 'file'
  path: string
  text: string
  totalChars: number
  error: string
}

declare module 'claude-code' {
  interface PluginState {
    'md-view': { files: string[]; view: MdView }
  }
}
