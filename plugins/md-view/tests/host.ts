import type { On, PaneOpenArgs, SessionMessage, TurnStepToolUse } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { mock } from 'claude-code/testing'

export const SURFACES = ['terminal', 'desktop'] as const

export const README = '# Readme\n\nHello.'
export const GUIDE = '# Guide\n\nRead me.'

export const SAID: SessionMessage[] = [
  { role: 'assistant', text: 'I read docs/guide.md and missing.md.', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/proj/README.md' } }] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't2', tool: 'Bash', input: { command: 'cat docs/guide.md' } }] },
  { role: 'user', text: 'What about notes/todo.md?', toolUses: [] },
]

export const PANE = {
  plugin: 'md-view',
  component: 'Pane',
  requestId: 'md-view',
  props: { title: 'Markdown', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

export const host = (on: On, messages: SessionMessage[] = SAID) => {
  const disk: Record<string, string> = {
    '/proj/README.md': README,
    '/proj/docs/guide.md': GUIDE,
    '/proj/notes/todo.md': '- [ ] todo',
  }
  const opened: PaneOpenArgs[] = []
  const step: { answer: string; toolUses: TurnStepToolUse[] } = { answer: '', toolUses: [] }
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.messages', () => ({ value: messages }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    yield { kind: 'text', index: 0, text: step.answer }
    return { turnId: e.turnId, index: e.index, answer: step.answer, toolUses: step.toolUses, stopReason: 'end_turn', usage: null }
  })
  on('command.register', () => ({ value: {} }))
  on('fs.stat', (_, e) => {
    const text = disk[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const text = disk[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.scroll', () => ({}))
  return { disk, opened, step }
}

export const start = ($: Engine) => $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

export type Host = ReturnType<typeof host>

export const say = async ($: Engine, { step }: Host, answer: string, toolUses: TurnStepToolUse[] = []) => {
  step.answer = answer
  step.toolUses = toolUses
  for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'test', messageCount: 1 })) void chunk
}
