import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ImageFile, ImageItem } from '../types'
import { base64Image, collect, imageId, imagePaths } from './collect'
import type { Block, Found, Message } from './collect'
import { fit, pngSize } from './picture'

const PANE = 'images'
const LIST_ROWS = 8
const FRAGMENT_ROWS = 3
const CHROME_ROWS = 2
const MIN_PICTURE_ROWS = 4
const NO_CONVERTER = 2
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
const MATERIALIZE = [
  'mkdir -p "$1" || exit 1',
  'if [ "$4" = decode ]; then base64 --decode > "$2" || exit 1; fi',
  'if [ "$2" != "$3" ]; then',
  '  sips -s format png "$2" --out "$3" >/dev/null 2>&1 || magick "$2" "$3" 2>/dev/null || convert "$2" "$3" 2>/dev/null || exit 2',
  '  if [ "$4" = decode ]; then rm -f "$2"; fi',
  'fi',
  'head -c 24 "$3" | base64',
].join('\n')

const items = atom({ plugin: 'image-preview', key: 'items' } as const, [])
const selected = atom({ plugin: 'image-preview', key: 'selected' } as const, '')
const files = atom({ plugin: 'image-preview', key: 'files' } as const, {})
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

async function tempDir($: EngineInterface, sessionId?: string) {
  const base = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')
  return `${base}/claude-image-preview-${sessionId ?? (await $.session.id())}`
}

async function materialize($: EngineInterface, one: Found): Promise<ImageFile> {
  const dir = await tempDir($)
  const isPngFile = one.kind === 'path' && /\.png$/i.test(one.path)
  const out = isPngFile ? one.path : `${dir}/${one.id}.png`
  const source =
    one.kind === 'path' ? one.path : one.mediaType === 'image/png' ? out : `${dir}/${one.id}.${EXTENSIONS[one.mediaType] ?? 'img'}`
  const argv = ['sh', '-c', MATERIALIZE, 'sh', dir, source, out, one.kind === 'block' ? 'decode' : 'keep']

  try {
    const ran = await $.process.run(argv, one.kind === 'block' ? { stdin: one.data } : {})
    if (ran.exitCode === NO_CONVERTER) return { error: 'Showing this image needs sips or ImageMagick to convert it to PNG.' }
    const size = ran.exitCode === 0 ? pngSize(ran.stdout) : undefined
    return size ? { file: out, ...size } : { error: 'This image could not be prepared for preview.' }
  } catch {
    return { error: 'Image previews need a shell (macOS or Linux).' }
  }
}

async function show($: EngineInterface, id: string, found?: Dated[]) {
  await update($, selected, () => id)
  if ((await read($, files))[id]) return
  const one = (found ?? (await scan($))).find(candidate => candidate.id === id)
  const file: ImageFile = one ? await materialize($, one) : { error: 'This image is no longer in the conversation.' }
  await update($, files, all => ({ ...all, [id]: file }))
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
  if (newest && isFollowing) await show($, newest.id, found)
  else if (current) await show($, current, found)

  return merged.length
}

const awaited = new Set<string>()

async function notice($: EngineInterface, blocks: readonly Block[]) {
  const inner = blocks.flatMap(block => (block.type === 'tool_result' && Array.isArray(block.content) ? (block.content as Block[]) : []))
  const arrived = [...blocks, ...inner].flatMap(block => base64Image(block) ?? [])
  for (const block of blocks) {
    if (block.type === 'tool_use' && typeof block.id === 'string' && imagePaths(block.input).length > 0) awaited.add(block.id)
  }
  const finished = blocks.filter(block => block.type === 'tool_result' && awaited.delete(String(block.tool_use_id)))
  if (arrived.length === 0) return finished.length > 0

  const now = await $.clock.now()
  await update($, seen, all => ({ ...Object.fromEntries(arrived.map(one => [imageId(one.data), now])), ...all }))
  return true
}

async function refreshIfOpen($: EngineInterface) {
  const panes = await $.ui.panes()
  if (panes.some(pane => pane.id === PANE)) await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'image-preview', description: 'Show the images of this session in a pane' })

    return next(e)
  })

  on('command.run', { command: 'image-preview' }, async $ => {
    const count = await refresh($)
    await $.ui.open({ id: PANE, title: 'Images', focus: true, closeOnEscape: true })

    return {
      text: count === 0 ? 'Images pane opened. No images in this session yet.' : `Images pane opened with ${count} image${count === 1 ? '' : 's'}.`,
    }
  })

  on('session.append', async ($, e, next) => {
    const kept = next(e)
    const isNews = !e.agentId && (await notice($, e.message.content))
    if (isNews) {
      void kept
        .catch(() => undefined)
        .then(() => refreshIfOpen($))
        .catch(() => undefined)
    }

    return kept
  })

  on('session.end', async ($, e, next) => {
    await $.process.run(['rm', '-rf', await tempDir($, e.sessionId)]).catch(() => undefined)
    await update($, items, () => [])
    await update($, selected, () => '')
    await update($, files, () => ({}))
    await update($, seen, () => ({}))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = [...(await read($, items))].reverse()
    if (list.length === 0) return <Text dimColor>No images in this session yet.</Text>

    const current = await read($, selected)
    const at = Math.max(0, list.findIndex(item => item.id === current))
    const first = Math.max(0, Math.min(at - Math.floor(LIST_ROWS / 2), list.length - LIST_ROWS))
    const shown = list[at]
    const label = shown?.label ?? ''
    const file = (await read($, files))[shown?.id ?? '']
    const columns = e.props.bodyColumns
    const listRows = Math.min(list.length, LIST_ROWS) + (list.length > LIST_ROWS ? 1 : 0)
    const room = Math.max(MIN_PICTURE_ROWS, e.props.scroll.bodyRows - listRows - FRAGMENT_ROWS - CHROME_ROWS)

    const picture = () => {
      if (!file) return <Text dimColor>Loading…</Text>
      if ('error' in file) return <Text dimColor>{file.error}</Text>
      if (e.surface !== 'terminal') return <Markdown key="preview" text={`[Open ${label}](file://${encodeURI(file.file)})`} />
      const { Image } = $.ui.resolve(e)
      return <Image key="preview" source={{ file: file.file, format: 'png' }} {...fit(file, columns, room)} alt={label} />
    }

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
        <Box marginTop={1} flexDirection="column">
          {picture()}
          <Text dimColor wrap="wrap">
            {(shown?.fragment ?? '').slice(0, columns * FRAGMENT_ROWS)}
          </Text>
        </Box>
      </Box>
    )
  })
}
