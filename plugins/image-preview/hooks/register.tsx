import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ImageFile, ImageItem } from '../types'
import { base64Image, collect, imageId, imagePaths, namedFiles, pathId, proseOf, resultText } from './collect'
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
  'umask 077',
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
const agents = atom({ plugin: 'image-preview', key: 'agents' } as const, [])

type Dated = Found & { at?: number; mtime?: number; agentId?: string }
type Roots = { cwd: string; home: string; started: number }

const MTIME_SLACK_MS = 2000
const awaited = new Set<string>()
const settled = new Set<string>()
const noted = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()

function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

const twoDigits = (value: number) => String(value).padStart(2, '0')

const clockTime = (at: number) => {
  const date = new Date(at)
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

const timeOf = (item: ImageItem) => item.at ?? Number.NEGATIVE_INFINITY

const byTime = (a: ImageItem, b: ImageItem) => (timeOf(a) === timeOf(b) ? 0 : timeOf(a) < timeOf(b) ? -1 : 1)

const isReady = (file: ImageFile | undefined, mtime: number | undefined) => file !== undefined && !('error' in file) && file.stamp === mtime

const itemOf = ({ id, label, fragment, at, mtime, agentId }: Dated): ImageItem => ({
  id,
  label,
  fragment,
  ...(at === undefined ? {} : { at }),
  ...(mtime === undefined ? {} : { mtime }),
  ...(agentId === undefined ? {} : { agentId }),
})

const under = (base: string, path: string, roots: Roots) =>
  path.startsWith('/') ? path : path.startsWith('~/') ? `${roots.home}${path.slice(1)}` : `${base}/${path.replace(/^\.\//, '')}`

const spellings = (path: string, bases: readonly string[], roots: Roots) =>
  path.startsWith('/') || path.startsWith('~/')
    ? [under(roots.cwd, path, roots)]
    : [roots.cwd, ...bases.map(base => under(roots.cwd, base, roots))].map(base => under(base, path, roots))

async function rootsOf($: EngineInterface): Promise<Roots> {
  const [usage, cwd, home] = await Promise.all([$.session.usage().catch(() => undefined), $.session.cwd(), $.env.get('HOME')])
  return { cwd, home: home ?? '~', started: (usage?.startedAt ?? 0) - MTIME_SLACK_MS }
}

async function placed($: EngineInterface, path: string, bases: readonly string[], roots: Roots) {
  const tried = spellings(path, bases, roots)
  const stats = await Promise.all(tried.map(spelling => $.fs.stat(spelling, { resolve: true }).catch(() => undefined)))
  const at = stats.findIndex(stat => stat?.kind === 'file' && stat.mtimeMs >= roots.started)
  const stat = stats[at]
  return stat ? { path: stat.realPath ?? tried[at] ?? path, mtime: stat.mtimeMs } : undefined
}

async function conversation($: EngineInterface, agentId: string | undefined): Promise<readonly Message[]> {
  if (agentId === undefined) return $.session.messages({ as: 'api' })
  const answer = await $.session.messages({ as: 'api', agentId })
  return Array.isArray(answer) ? answer : []
}

async function scan($: EngineInterface, agentId?: string, known?: Roots): Promise<Dated[]> {
  const [stamps, roots, messages] = await Promise.all([read($, seen), known ?? rootsOf($), conversation($, agentId)])
  const tag = agentId === undefined ? {} : { agentId }
  const found = collect(messages)
  const places = await Promise.all(found.map(one => (one.kind === 'path' ? placed($, one.path, one.bases, roots) : undefined)))
  const dated = new Map<string, Dated>()

  found.forEach((one, i) => {
    if (one.kind === 'block') {
      const at = stamps[one.id]
      dated.set(one.id, at === undefined ? { ...one, ...tag } : { ...one, ...tag, at })
      return
    }
    const file = places[i]
    if (!file) return
    const id = pathId(file.path)
    if (dated.has(id) && one.from === 'text') return
    dated.delete(id)
    dated.set(id, { ...one, ...tag, id, path: file.path, at: file.mtime, mtime: file.mtime })
  })

  return [...dated.values()]
}

async function scanAll($: EngineInterface) {
  const [roots, listed, remembered] = await Promise.all([rootsOf($), $.agent.list().catch(() => []), read($, agents)])
  const running = new Set(listed.filter(agent => agent.status === 'running').map(agent => agent.id))
  const ids = [...new Set([...remembered, ...listed.map(agent => agent.id)])].filter(id => running.has(id) || !settled.has(id))
  const [main, ...others] = await Promise.all([scan($, undefined, roots), ...ids.map(id => scan($, id, roots))])
  for (const id of ids) {
    if (running.has(id)) settled.delete(id)
    else settled.add(id)
  }
  return [...(main ?? []), ...others.flat()]
}

async function tempDir($: EngineInterface, sessionId?: string) {
  const [base, id] = await Promise.all([$.env.get('TMPDIR'), sessionId ?? $.session.id()])
  return `${(base ?? '/tmp').replace(/\/+$/, '')}/claude-image-preview-${id}`
}

async function materialize($: EngineInterface, one: Dated): Promise<ImageFile> {
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
    if (!size) return { error: 'This image could not be prepared for preview.' }
    return one.mtime === undefined ? { file: out, ...size } : { file: out, ...size, stamp: one.mtime }
  } catch {
    return { error: 'Image previews need a shell (macOS or Linux).' }
  }
}

async function prepare($: EngineInterface, id: string, one: Dated | undefined) {
  const file: ImageFile = one ? await materialize($, one) : { error: 'This image is no longer in the conversation.' }
  await update($, files, all => ({ ...all, [id]: file }))
}

async function show($: EngineInterface, id: string, found?: Dated[]) {
  const [list, ready] = await Promise.all([read($, items), read($, files), update($, selected, () => id)])
  const item = list.find(other => other.id === id)
  if (isReady(ready[id], item?.mtime)) return
  const known = found?.find(candidate => candidate.id === id)
  await prepare($, id, known ?? (await scan($, item?.agentId)).find(candidate => candidate.id === id))
}

async function relist($: EngineInterface) {
  const [found, before] = await Promise.all([scanAll($), read($, items)])
  const fresh = new Map(found.map(one => [one.id, itemOf(one)]))
  const merged = [...before.filter(item => !fresh.has(item.id)), ...fresh.values()].sort(byTime)
  if (JSON.stringify(merged) !== JSON.stringify(before)) await update($, items, () => merged)

  return { found, before, merged }
}

async function refresh($: EngineInterface, isOpening = false) {
  const { found, before, merged } = await relist($)
  const current = await read($, selected)
  const newest = merged.at(-1)
  const isFollowing = isOpening || current === '' || current === before.at(-1)?.id
  if (newest && isFollowing) await show($, newest.id, found)
  else if (current) await show($, current, found)

  return merged.length
}

async function keep($: EngineInterface, found: Dated[]) {
  const ready = await read($, files)
  for (const one of found) {
    if (one.kind === 'block' && !isReady(ready[one.id], undefined)) await prepare($, one.id, one)
  }
}

async function notice($: EngineInterface, blocks: readonly Block[], agentId: string | undefined) {
  if (agentId !== undefined && !noted.has(agentId)) {
    noted.add(agentId)
    settled.delete(agentId)
    await update($, agents, all => [...all.filter(id => id !== agentId), agentId])
  }
  const results = blocks.filter(block => block.type === 'tool_result')
  const inner = results.flatMap(block => (Array.isArray(block.content) ? (block.content as Block[]) : []))
  const arrived = [...blocks, ...inner].flatMap(block => base64Image(block) ?? [])
  for (const block of blocks) {
    if (block.type === 'tool_use' && typeof block.id === 'string' && namedFiles(String(block.name), block.input).length > 0) {
      awaited.add(block.id)
    }
  }
  const finished = results.filter(block => awaited.delete(String(block.tool_use_id)))
  const mentioned = imagePaths([proseOf(blocks), ...results.map(resultText)])
  if (arrived.length === 0) return finished.length > 0 || mentioned.length > 0

  const now = await $.clock.now()
  await update($, seen, all => ({ ...all, ...Object.fromEntries(arrived.map(one => [imageId(one.data), now])) }))
  return true
}

async function forget($: EngineInterface) {
  awaited.clear()
  settled.clear()
  noted.clear()
  await Promise.all([
    update($, items, () => []),
    update($, selected, () => ''),
    update($, files, () => ({})),
    update($, seen, () => ({})),
    update($, agents, () => []),
  ])
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
    const count = await inOrder(() => refresh($, true))
    await $.ui.open({ id: PANE, title: 'Images', focus: true, closeOnEscape: true })

    return {
      text: count === 0 ? 'Images pane opened. No images in this session yet.' : `Images pane opened with ${count} image${count === 1 ? '' : 's'}.`,
    }
  })

  on('session.append', async ($, e, next) => {
    const kept = next(e)
    const isNews = await notice($, e.message.content, e.agentId)
    if (isNews) {
      void kept
        .catch(() => undefined)
        .then(() => inOrder(() => refreshIfOpen($)))
        .catch(() => undefined)
    }

    return kept
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId === undefined) {
      const listed = await inOrder(() => relist($)).catch(() => undefined)
      if (listed) void inOrder(() => keep($, listed.found)).catch(() => undefined)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const dir = await tempDir($, e.sessionId)
    await Promise.all([$.process.run(['rm', '-rf', dir]).catch(() => undefined), inOrder(() => forget($))])

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const [kept, current, ready] = await Promise.all([read($, items), read($, selected), read($, files)])
    const list = [...kept].reverse()
    if (list.length === 0) return <Text dimColor>No images in this session yet.</Text>

    const at = Math.max(0, list.findIndex(item => item.id === current))
    const first = Math.max(0, Math.min(at - Math.floor(LIST_ROWS / 2), list.length - LIST_ROWS))
    const shown = list[at]
    const label = shown?.label ?? ''
    const file = ready[shown?.id ?? '']
    const columns = e.props.bodyColumns
    const listRows = Math.min(list.length, LIST_ROWS) + (list.length > LIST_ROWS ? 1 : 0)
    const room = Math.max(MIN_PICTURE_ROWS, e.props.scroll.bodyRows - listRows - FRAGMENT_ROWS - CHROME_ROWS)

    const picture = () => {
      if (!file) return <Text dimColor>Loading…</Text>
      if ('error' in file) return <Text dimColor>{file.error}</Text>
      if (e.surface !== 'terminal') return <Markdown key="preview" text={`[Open ${label}](file://${encodeURI(file.file)})`} />
      const { Image } = $.ui.resolve(e)
      const source = { file: file.file, format: 'png' as const }
      const drawn = file.stamp === undefined ? source : { ...source, generation: Math.floor(file.stamp) }
      return <Image key="preview" source={drawn} {...fit(file, columns, room)} alt={label} />
    }

    return (
      <Box flexDirection="column">
        {list.slice(first, first + LIST_ROWS).map((item, i) => {
          const place = first + i + 1
          const label = item.at === undefined ? item.label : `${item.label}  ${clockTime(item.at)}`
          const pick = () => void inOrder(() => show($, item.id))
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
