import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ImageItem } from '../types'
import { collect } from './collect'
import type { Found, Message } from './collect'

const PANE = 'images'
const LIST_ROWS = 8

const items = atom({ plugin: 'image-preview', key: 'items' } as const, [])
const selected = atom({ plugin: 'image-preview', key: 'selected' } as const, '')
const seen = atom({ plugin: 'image-preview', key: 'seen' } as const, {})

type Dated = Found & { at?: number }

const twoDigits = (value: number) => String(value).padStart(2, '0')

const clockTime = (at: number) => {
  const date = new Date(at)
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

async function absolute($: EngineInterface, path: string) {
  if (path.startsWith('/')) return path
  if (path.startsWith('~/')) return `${(await $.env.get('HOME')) ?? '~'}${path.slice(1)}`
  return `${await $.session.cwd()}/${path.replace(/^\.\//, '')}`
}

async function scan($: EngineInterface): Promise<Dated[]> {
  const stamps = await read($, seen)
  const messages: readonly Message[] = await $.session.messages({ as: 'api' })
  const dated: Dated[] = []

  for (const one of collect(messages)) {
    if (one.kind === 'block') {
      const at = stamps[one.id]
      dated.push(at === undefined ? one : { ...one, at })
      continue
    }
    const path = await absolute($, one.path)
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat?.kind === 'file') dated.push({ ...one, path, at: stat.mtimeMs })
  }

  return dated
}

async function show($: EngineInterface, id: string) {
  await update($, selected, () => id)
}

async function refresh($: EngineInterface) {
  const found = await scan($)
  const before = await read($, items)
  const fresh: ImageItem[] = found.map(({ id, label, fragment, at }) => (at === undefined ? { id, label, fragment } : { id, label, fragment, at }))
  const freshIds = new Set(fresh.map(item => item.id))
  const merged = [...before.filter(item => !freshIds.has(item.id)), ...fresh]
  await update($, items, () => merged)

  const current = await read($, selected)
  const newest = merged.at(-1)
  const isFollowing = current === '' || current === before.at(-1)?.id
  if (newest && isFollowing) await show($, newest.id)

  return merged.length
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'image-preview', description: 'Show the images of this session in a pane' })

    return next(e)
  })

  on('command.run', { command: 'image-preview' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Images', focus: true, closeOnEscape: true })
    const count = await refresh($)

    return {
      text: count === 0 ? 'Images pane opened. No images in this session yet.' : `Images pane opened with ${count} image${count === 1 ? '' : 's'}.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = [...(await read($, items))].reverse()
    if (list.length === 0) return <Text dimColor>No images in this session yet.</Text>

    const current = await read($, selected)
    const at = Math.max(0, list.findIndex(item => item.id === current))
    const first = Math.max(0, Math.min(at - Math.floor(LIST_ROWS / 2), list.length - LIST_ROWS))

    return (
      <Box flexDirection="column">
        {list.slice(first, first + LIST_ROWS).map((item, i) => {
          const place = first + i + 1
          const label = item.at === undefined ? item.label : `${item.label}  ${clockTime(item.at)}`
          const pick = () => void show($, item.id)
          return place <= 9 ? (
            <Button key={`pick-${item.id}`} plain hotkey={String(place)} label={label} dimColor={item.id !== current} onPress={pick} />
          ) : (
            <Button key={`pick-${item.id}`} plain label={`${place}: ${label}`} dimColor={item.id !== current} onPress={pick} />
          )
        })}
        {list.length > LIST_ROWS && <Text dimColor>{list.length} images</Text>}
      </Box>
    )
  })
}
