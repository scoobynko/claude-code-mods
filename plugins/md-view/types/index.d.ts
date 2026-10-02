export type MdFile = {
  text: string
  totalChars: number
  error: string
  stamp: string
}

export type MdView = {
  path: string
  file: MdFile | null
}

declare module 'claude-code' {
  interface PluginState {
    'md-view': { files: string[]; view: MdView }
  }
}
