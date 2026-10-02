import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ImageFile, ImageItem } from '../types'
import { arrivals, collect, imageId, pathId } from './collect'
import type { Block, Found, Message, Pending } from './collect'
import { fit, pngSize } from './picture'

const PANE = 'images'
const MAIN = ''
const LIST_ROWS = 8
const FRAGMENT_ROWS = 3
const CHROME_ROWS = 3
const TRANSCRIPT_COLUMNS = 24
const MIN_PICTURE_ROWS = 4
const NO_CONVERTER = 2
const NOT_CONVERTED = 3
const MTIME_SLACK_MS = 2000
const MATERIALIZE = [
  'umask 077',
  'mkdir -p "$1" || exit 1',
  'if [ "$4" = decode ]; then base64 --decode > "$2" || exit 1; fi',
  'if [ "$(head -c 8 "$2" | base64)" = iVBORw0KGgo= ]; then',
  '  if [ "$4" = decode ]; then mv "$2" "$3" || exit 1; out=$3; else out=$2; fi',
  'else',
  '  command -v sips >/dev/null 2>&1 || command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1 || exit 2',
  '  sips -s format png "$2" --out "$3" >/dev/null 2>&1 || magick "$2[0]" "$3" 2>/dev/null || convert "$2[0]" "$3" 2>/dev/null || exit 3',
  '  if [ "$4" = decode ]; then rm -f "$2"; fi',
  '  out=$3',
  'fi',
  'head -c 24 "$out" | base64',
  'printf "%s\\n" "$out"',
].join('\n')

const VIEW = 'case "$(uname)" in Darwin) open "$1" ;; *) xdg-open "$1" >/dev/null 2>&1 & ;; esac'

const items = atom({ plugin: 'image-preview', key: 'items' } as const, [])
const selected = atom({ plugin: 'image-preview', key: 'selected' } as const, '')
const files = atom({ plugin: 'image-preview', key: 'files' } as const, {})
const seen = atom({ plugin: 'image-preview', key: 'seen' } as const, {})
const agents = atom({ plugin: 'image-preview', key: 'agents' } as const, [])
const zoomed = atom({ plugin: 'image-preview', key: 'zoomed' } as const, false)

type Dated = Found & { at?: number; agentId?: string; version?: number }
type Source = { id: string } & ({ kind: 'block'; mediaType: string; data: string } | { kind: 'path'; path: string })
type Roots = { cwd: string; home: string; started: number }

const pending: Pending = new Map()
const noted = new Set<string>()
const stale = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()
let isRefreshQueued = false
let screen = { columns: 0, rows: 0 }
let ended = 0

function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

const clockTime = (at: number) => new Date(at).toTimeString().slice(0, 5)

const timeOf = (item: ImageItem) => item.at ?? item.file?.version ?? Number.NEGATIVE_INFINITY

const byTime = (a: ImageItem, b: ImageItem) => (timeOf(a) === timeOf(b) ? 0 : timeOf(a) < timeOf(b) ? -1 : 1)

const isReady = (file: ImageFile | undefined, version: number | undefined) => file !== undefined && file.version === version

const itemOf = (one: Dated): ImageItem => ({
  id: one.id,
  label: one.label,
  fragment: one.fragment,
  at: one.at,
  agentId: one.agentId,
  file: one.kind === 'path' && one.version !== undefined ? { path: one.path, version: one.version } : undefined,
})

const under = (base: string, path: string, roots: Roots) =>
  path.startsWith('/')
    ? path
    : path === '~' || path.startsWith('~/')
      ? `${roots.home}${path.slice(1)}`
      : `${base}/${path.replace(/^\.\//, '')}`

const spellings = (path: string, bases: readonly string[], roots: Roots) => [
  ...new Set([...bases.map(base => under(roots.cwd, base, roots)), roots.cwd].map(base => under(base, path, roots))),
]

async function rootsOf($: EngineInterface): Promise<Roots> {
  const [usage, cwd, home] = await Promise.all([$.session.usage().catch(() => undefined), $.session.cwd(), $.env.get('HOME')])
  return { cwd, home: home ?? '~', started: (usage?.startedAt ?? 0) - MTIME_SLACK_MS }
}

async function placed($: EngineInterface, path: string, bases: readonly string[], roots: Roots) {
  const tried = spellings(path, bases, roots)
  const stats = await Promise.all(tried.map(spelling => $.fs.stat(spelling, { resolve: true }).catch(() => undefined)))
  const at = stats.findIndex(stat => stat?.kind === 'file' && stat.mtimeMs >= roots.started)
  const stat = stats[at]
  return stat ? { path: stat.realPath ?? tried[at] ?? path, version: stat.mtimeMs } : undefined
}

async function conversation($: EngineInterface, agentId: string | undefined): Promise<readonly Message[]> {
  if (agentId === undefined) return $.session.messages({ as: 'api' })
  const answer = await $.session.messages({ as: 'api', agentId })
  return Array.isArray(answer) ? answer : []
}

async function scan($: EngineInterface, agentId?: string, known?: Roots): Promise<Dated[]> {
  const [stamps, roots, messages] = await Promise.all([read($, seen), known ?? rootsOf($), conversation($, agentId)])
  const found = collect(messages)
  const places = await Promise.all(found.map(one => (one.kind === 'path' ? placed($, one.path, one.bases, roots) : undefined)))
  const dated = new Map<string, Dated>()

  found.forEach((one, i) => {
    if (one.kind === 'block') {
      dated.set(one.id, { ...one, agentId, at: stamps[one.id] })
      return
    }
    const file = places[i]
    if (!file) return
    const id = pathId(file.path)
    if (dated.has(id) && one.from === 'text') return
    dated.delete(id)
    dated.set(id, { ...one, agentId, id, ...file })
  })

  return [...dated.values()]
}

async function everyone($: EngineInterface) {
  const [listed, remembered] = await Promise.all([$.agent.list().catch(() => []), read($, agents)])
  return [MAIN, ...new Set([...remembered, ...listed.map(agent => agent.id)])]
}

async function readFiles($: EngineInterface, found: readonly Dated[]) {
  const read = [...new Set(found.flatMap(one => (one.kind === 'block' && one.readFrom ? [one.readFrom] : [])))]
  const real = await Promise.all(read.map(path => $.fs.stat(path, { resolve: true }).then(stat => stat.realPath ?? path, () => path)))
  return new Set(real.map(pathId))
}

async function relist($: EngineInterface, scope?: readonly string[]) {
  const [roots, before, ids] = await Promise.all([rootsOf($), read($, items), scope ?? everyone($)])
  const scanned = (await Promise.all(ids.map(id => scan($, id === MAIN ? undefined : id, roots)))).flat()
  const hasFiles = before.some(item => item.file) || scanned.some(one => one.kind === 'path')
  const alreadyRead = hasFiles ? await readFiles($, scanned) : new Set<string>()
  const found = scanned.filter(one => !alreadyRead.has(one.id))
  const fresh = new Map(found.map(one => [one.id, itemOf(one)]))
  const merged = [...before.filter(item => !fresh.has(item.id) && !alreadyRead.has(item.id)), ...fresh.values()].sort(byTime)
  if (JSON.stringify(merged) !== JSON.stringify(before)) await update($, items, () => merged)

  return { found, before, merged }
}

async function tempDir($: EngineInterface, sessionId?: string) {
  const [base, id] = await Promise.all([$.env.get('TMPDIR'), sessionId ?? $.session.id()])
  return `${(base ?? '/tmp').replace(/\/+$/, '')}/claude-image-preview-${id}`
}

async function materialize($: EngineInterface, one: Source, version: number | undefined): Promise<ImageFile> {
  const dir = await tempDir($)
  const plan =
    one.kind === 'path'
      ? { source: one.path, mode: 'keep', init: {} }
      : { source: `${dir}/${one.id}.src`, mode: 'decode', init: { stdin: one.data } }

  try {
    const ran = await $.process.run(['sh', '-c', MATERIALIZE, 'sh', dir, plan.source, `${dir}/${one.id}.png`, plan.mode], plan.init)
    if (ran.exitCode === NO_CONVERTER) return { error: 'Showing this image needs sips or ImageMagick to convert it to PNG.', version }
    if (ran.exitCode === NOT_CONVERTED) return { error: 'This image could not be converted to PNG.', version }
    const [header = '', file = ''] = ran.stdout.split('\n')
    const size = ran.exitCode === 0 ? pngSize(header) : undefined
    return size && file ? { file, ...size, version } : { error: 'This image could not be prepared for preview.', version }
  } catch {
    return { error: 'This image could not be prepared: no shell (macOS or Linux only), or it took too long.', version }
  }
}

async function prepare($: EngineInterface, id: string, one: Source | undefined, version: number | undefined) {
  const file: ImageFile = one ? await materialize($, one, version) : { error: 'This image is no longer in the conversation.', version }
  await update($, files, all => ({ ...all, [id]: file }))
}

async function show($: EngineInterface, id: string, found?: Dated[], isRetry = false) {
  const [list, ready, current] = await Promise.all([read($, items), read($, files), read($, selected)])
  if (current !== id) await update($, selected, () => id)
  const item = list.find(other => other.id === id)
  const version = item?.file?.version
  const file = ready[id]
  if (isReady(file, version) && !(isRetry && file !== undefined && 'error' in file)) return

  const source: Source | undefined = item?.file
    ? { kind: 'path', id, path: item.file.path }
    : (found?.find(one => one.id === id) ?? (await scan($, item?.agentId)).find(one => one.id === id))
  await prepare($, id, source, version)
}

async function refresh($: EngineInterface, scope?: readonly string[]) {
  const { found, before, merged } = await relist($, scope)
  const current = await read($, selected)
  const newest = merged.at(-1)
  const isFollowing = scope === undefined || current === '' || current === before.at(-1)?.id
  if (newest && isFollowing) await show($, newest.id, found)
  else if (current) await show($, current, found)

  return merged.length
}

async function refreshStale($: EngineInterface) {
  const scope = [...stale]
  stale.clear()
  isRefreshQueued = false
  const panes = await $.ui.panes()
  if (panes.some(pane => pane.id === PANE)) await refresh($, scope)
}

async function keep($: EngineInterface, found: Dated[]) {
  const startedIn = ended
  const ready = await read($, files)
  for (const one of found) {
    if (ended !== startedIn) return
    if (one.kind === 'block' && !isReady(ready[one.id], undefined)) await prepare($, one.id, one, undefined)
  }
}

async function refreshSoon($: EngineInterface, scope: string) {
  stale.add(scope)
  if (isRefreshQueued) return
  isRefreshQueued = true
  await inOrder(() => refreshStale($))
}

async function end($: EngineInterface, sessionId: string) {
  const [wasZoomed, panes] = await Promise.all([read($, zoomed), $.ui.panes().catch(() => [])])
  await forget($)
  if (wasZoomed && panes.some(pane => pane.id === PANE)) await resize($, false)
  await $.process.run(['rm', '-rf', await tempDir($, sessionId)]).catch(() => undefined)
}

async function notice($: EngineInterface, role: string | undefined, blocks: readonly Block[], agentId: string | undefined) {
  if (agentId !== undefined && !noted.has(agentId)) {
    noted.add(agentId)
    await update($, agents, all => (all.includes(agentId) ? all : [...all, agentId]))
  }
  const { images, isNews } = arrivals(role, blocks, pending)
  if (images.length > 0) {
    const now = await $.clock.now()
    await update($, seen, all => ({ ...all, ...Object.fromEntries(images.map(one => [imageId(one.data), now])) }))
  }
  return isNews
}

async function resize($: EngineInterface, isZoomed: boolean) {
  const wide = isZoomed && screen.columns > TRANSCRIPT_COLUMNS ? { columns: screen.columns - TRANSCRIPT_COLUMNS, rows: screen.rows } : {}
  await $.ui.open({ id: PANE, title: 'Images', focus: true, closeOnEscape: true, ...wide })
}

async function zoom($: EngineInterface, isZoomed: boolean) {
  if ((await read($, zoomed)) !== isZoomed) await update($, zoomed, () => isZoomed)
  await resize($, isZoomed)
}

async function toggleZoom($: EngineInterface) {
  await resize($, await update($, zoomed, isZoomed => !isZoomed))
}

async function view($: EngineInterface, file: string) {
  const ran = await $.process.run(['sh', '-c', VIEW, 'sh', file]).catch(() => undefined)
  if (ran?.exitCode !== 0) $.ui.toast('Could not open the image in a viewer.')
}

async function forget($: EngineInterface) {
  pending.clear()
  noted.clear()
  stale.clear()
  isRefreshQueued = false
  await Promise.all([
    update($, items, () => []),
    update($, selected, () => ''),
    update($, files, () => ({})),
    update($, seen, () => ({})),
    update($, agents, () => []),
    update($, zoomed, () => false),
  ])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'image-preview', description: 'Show the images of this session in a pane' })

    return next(e)
  })

  on('command.run', { command: 'image-preview' }, async $ => {
    const count = await inOrder(() => refresh($))
    await zoom($, false)

    return {
      text: count === 0 ? 'Images pane opened. No images in this session yet.' : `Images pane opened with ${count} image${count === 1 ? '' : 's'}.`,
    }
  })

  on('session.append', async ($, e, next) => {
    const kept = next(e)
    if (await notice($, e.message.role, e.message.content, e.agentId)) {
      void kept
        .catch(() => undefined)
        .then(() => refreshSoon($, e.agentId ?? MAIN))
        .catch(() => undefined)
    }

    return kept
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId === PANE && e.element === 'zone') await toggleZoom($)

    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || !(await read($, zoomed))) return next(e)
    await zoom($, false)

    return { value: undefined }
  })

  on('session.compact', async ($, e, next) => {
    const listed = await inOrder(() => relist($, [e.agentId ?? MAIN])).catch(() => undefined)
    if (listed) void inOrder(() => keep($, listed.found)).catch(() => undefined)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    ended++
    await inOrder(() => end($, e.sessionId))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const [kept, current, ready, isZoomed] = await Promise.all([read($, items), read($, selected), read($, files), read($, zoomed)])
    if (e.viewport && e.surface === 'terminal') {
      screen = { columns: e.viewport.columns + (e.props.placement === 'dock' ? e.props.bodyColumns : 0), rows: e.viewport.rows }
    }
    const list = [...kept].reverse()
    const at = Math.max(0, list.findIndex(item => item.id === current))
    const shown = list[at]
    if (!shown) return <Text dimColor>No images in this session yet.</Text>

    const first = Math.max(0, Math.min(at - Math.floor(LIST_ROWS / 2), list.length - LIST_ROWS))
    const file = ready[shown.id]
    const columns = e.props.bodyColumns
    const isEnlarged = isZoomed && e.surface === 'terminal'
    const isDrawable = file !== undefined && !('error' in file)
    const listRows = Math.min(list.length, LIST_ROWS) + (list.length > LIST_ROWS ? 1 : 0)
    const taken = isEnlarged ? CHROME_ROWS : listRows + FRAGMENT_ROWS + CHROME_ROWS
    const room = Math.max(MIN_PICTURE_ROWS, e.props.scroll.bodyRows - taken)

    const picture = () => {
      if (!file) return <Text dimColor>Loading…</Text>
      if ('error' in file) return <Text dimColor>{file.error}</Text>
      if (e.surface !== 'terminal') return <Markdown key="preview" text={`[Open ${shown.label}](file://${encodeURI(file.file)})`} />
      const { Image, Client } = $.ui.resolve(e)
      const source = { file: file.file, format: 'png' as const }
      const drawn = file.version === undefined ? source : { ...source, generation: Math.floor(file.version) }
      const size = fit(file, columns, room)
      return (
        <Box flexDirection="column">
          <Image key="preview" source={drawn} {...size} alt={shown.label} />
          <Box position="absolute" top={0} left={0}>
            <Client key="zone" module="./zone.tsx" props={size} width={size.columns} height={size.rows} />
          </Box>
        </Box>
      )
    }

    const actions = () => (
      <Box flexDirection="row" gap={3}>
        {(isEnlarged || isDrawable) && (
          <Button key="enlarge" plain hotkey="e" label={isEnlarged ? 'Back to list' : 'Enlarge'} onPress={() => void toggleZoom($)} />
        )}
        {file !== undefined && !('error' in file) && (
          <Button key="view" plain hotkey="o" label="Open in viewer" onPress={() => void view($, file.file)} />
        )}
      </Box>
    )

    if (isEnlarged) {
      return (
        <Box flexDirection="column">
          {picture()}
          {actions()}
        </Box>
      )
    }

    const last = Math.min(list.length, first + LIST_ROWS)
    const rows = (from: number, to: number) =>
      list.slice(from, to).map((item, i) => {
        const place = from + i + 1
        const time = timeOf(item)
        const text = Number.isFinite(time) ? `${item.label}  ${clockTime(time)}` : item.label
        const row = place <= 9 ? { hotkey: String(place), label: text } : { label: `${place}: ${text}` }
        const pick = () => void inOrder(() => show($, item.id, undefined, true))
        return <Button key={`pick-${item.id}`} plain {...row} dimColor={item.id !== current} onPress={pick} />
      })

    return (
      <Box flexDirection="column">
        {rows(first, at + 1)}
        <Box marginBottom={at + 1 < last || list.length > LIST_ROWS ? 1 : 0} flexDirection="column">
          {picture()}
          {e.surface === 'terminal' && actions()}
          <Text dimColor wrap="wrap">
            {shown.fragment.slice(0, columns * FRAGMENT_ROWS)}
          </Text>
        </Box>
        {rows(at + 1, last)}
        {list.length > LIST_ROWS && <Text dimColor>{list.length} images</Text>}
      </Box>
    )
  })
}
