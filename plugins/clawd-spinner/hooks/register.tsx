import type { EngineInterface, Register, Timer } from 'claude-code'

const TYPING_POSES = [
  `
..oooooooooooo............
..oo##oooooo##.........=..
..oooooooooooooooo....=...
..oooooooooooooooo...=....
..oo....oo..oo.======.....
..o.....o...o.............`,
  `
..oooooooooooo............
..oo##oooooo##............
..oooooooooooooo.......=..
..ooooooooooooOOOO....=...
..oo....oo..oo..OO...=....
..o.....o...o..======.....`,
  `
..oooooooooooo............
..oo##oooooo##............
..oooooooooooooooo.....=..
..oooooooooooo........=...
..oo....oo..oo.......=....
..o.....o...o..======.....`,
]
const THINKING_POSES = [
  `
..oooooooooooo............
..oo##oooo##oo............
oooooooooooooooo.......=..
..oooooooooooo........=...
..llll....llll.......=....
..llll....llll.======.....`,
  `
..........................
..oooooooooooo............
..oo##oooo##oo.........=..
oooooooooooooooo......=...
..oooooooooooo.......=....
..o.o.....o.o..======.....`,
]

const ROBOT = `
.........aa.........
........aaaa........
.........aa.........
.........d..........
...DDDDDDDDDDDDDD...
..DoooooooooooooodD.
.DoooooooooooooooddD
.DoooCCCCCCCCCCooddD
.DooCcccccccccLooddD
.DooCcccccccccLooddD
.DooCcccccccccLooddD
.DooCcccccccccLooddD
.DooCcccccccccLooddD
.DooCcccccccccLooddD
.DoooCCCCCCCCCCooddD
..DoooooooooooooddD.
...DDDDDDDDDDDDDD...
...DooooooooodD.....
..DDDoooooooodDDD...
.DLLLDooooooodDLLD..
.DoodDooDDDDDdDoodD.
.DDDDDoDLLLLLDDoodD.
DLLLLLDDoooodDDoodD.
DoooodDDoooodDDoodD.
DoooodDDoooodDDoodD.
DoooodDDoooodDDodD..
gDDDDD..DDDDD..DD.g.
.g.g.g.g.g.g.g.g.g.g`
const ROBOT_LAPTOP = `
DDDDDDDDDD
DMMMMMMMMD
DmmmccmmnD
DmmmmmmmnD
DDDDDDDDDD`
const ROBOT_COLORS: Record<string, number> = {
  D: 0x3c1e0e,
  d: 0xa45f33,
  o: 0xd4874e,
  L: 0xe8a66f,
  c: 0xece4d6,
  C: 0xf6d6ad,
  e: 0x1b1b1b,
  a: 0xf1e8d6,
  A: 0xffd36e,
  m: 0x8c8c8c,
  M: 0xc2c2c2,
  n: 0x5e5e5e,
  g: 0xcfa57c,
  G: 0x7a5638,
}
const ROBOT_EYE_COLUMNS = [6, 11]
const ROBOT_EYE_ROW = 9
const ROBOT_MOUTH_ROW = 12
const ROBOT_LAPTOP_ROW = 18
const ROBOT_LAPTOP_COLUMN = 5
const ROBOT_HANDS = [
  { column: 3, art: 'DLD' },
  { column: 14, art: 'DdD' },
]
const ROBOT_HAND_MS = 140
const ROBOT_BOB_MS = 420
const ROBOT_READ_MS = 450
const ROBOT_READ_STEPS = [-1, 0, 1, 1]
const ROBOT_LOOP_MS = 6000
const ROBOT_PAUSE = [2600, 3200]
const ROBOT_BLINK = [5600, 5720]
const SMILE_MS = 1400

const BODY_COLOR = 0xd77757
const PIXEL_COLORS: Record<string, number> = {
  o: BODY_COLOR,
  l: BODY_COLOR,
  O: 0xbd674b,
  '#': 0x000000,
  '=': 0x898989,
}
const BLOCK_GLYPHS: Record<string, number> = {
  l: 0x258b,
}
const TERMINAL_DEFAULT = 0x01000000
const SPACE = 0x20
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
]

const POSE_PIXELS = (TYPING_POSES[0] ?? '').trim().split('\n')
const SPRITE_COLUMNS = (POSE_PIXELS[0]?.length ?? 0) / 2
const SPRITE_ROWS = POSE_PIXELS.length / 2
const isGridPose = (pose: string) => {
  const rows = pose.trim().split('\n')
  return rows.length === SPRITE_ROWS * 2 && rows.every(row => row.length === SPRITE_COLUMNS * 2)
}
if (!Number.isInteger(SPRITE_COLUMNS) || !Number.isInteger(SPRITE_ROWS) || ![...TYPING_POSES, ...THINKING_POSES].every(isGridPose)) {
  throw new Error('clawd-spinner: every pose must share one size with an even width and height')
}
const ROBOT_PIXELS = ROBOT.trim().split('\n')
const ROBOT_COLUMNS = ROBOT_PIXELS[0]?.length ?? 0
const ROBOT_ROWS = ROBOT_PIXELS.length / 2
if (!Number.isInteger(ROBOT_ROWS) || !ROBOT_PIXELS.every(row => row.length === ROBOT_COLUMNS)) {
  throw new Error('clawd-spinner: the robot must be a rectangle with an even height')
}
const HEAD_ROW = 0
const SPRITE_TOP = HEAD_ROW + 1
const FRAME_MS = 40
const TYPE_MS = FRAME_MS
const BOB_MS = 420
const MS_PER_COLUMN = 70
const LINE_GAP = 1
const MAX_QUEUED_LINES = 6
const MAX_SCANNED_LINE = 200
const CODE_BRIGHT = 0xf0a27e
const INTAKE_BRIGHT = 0x8ab4f8
const FADED = 0x3a3a3a
const HM_TEXT = 'hm...'
const HM_COLOR = 0xd8d8d8
const HM_LIFE_MS = 1800
const HM_MS_PER_CHAR = 140
const HM_MS_PER_DRIFT = 450
const CODE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])
const CODE_KEYS = ['content', 'new_string', 'new_source', 'command']
const CODE_VALUE_START = new RegExp(`"(?:${CODE_KEYS.join('|')})"\\s*:\\s*"`, 'g')
const KEY_PREFIX_WINDOW = 2 * Math.max(...CODE_KEYS.map(key => `"${key}":"`.length))
const FENCE = /^\s*```/
const KEY = 'clawd'
const TYPING_SOUND = 'sounds/typing.wav'
const TYPING_GAIN = 0.5
const SOUND_KEY = 'sound'
const SOUND_COMMAND = 'clawd-sound'
const SOUND_LABEL = '[♪]'
const CHARACTER_KEY = 'character'
const CHARACTER_COMMAND = 'clawd-spinner'

type Cell = readonly [number, number, number]
type Character = {
  name: string
  label: string
  spriteColumns: number
  columns: number
  rows: number
  lineRows: number
  lineStartRow: number
  lineRiseMs: number
  hmColumns: readonly number[]
  typing: (elapsed: number, isSmiling: boolean) => Uint32Array
  thinking: (elapsed: number) => Uint32Array
}
type RobotPose = {
  isLit?: boolean
  eyeShift?: number
  eyes?: 'open' | 'focused' | 'shut'
  mouth?: 'flat' | 'smile'
  laptop?: { bob: number; isLeftUp: boolean; isRightUp: boolean }
}
type Choice = { character: Character; loaded?: Promise<void> }
type Floating = { text: string; bornAt: number }
type ValueScan = { json: string; cursor: number; isInValue: boolean; line: string }
type FenceScan = { line: string; isInFence: boolean }
type Sound = { isOn: boolean; canPlay: boolean; loaded?: Promise<void>; stop?: AbortController }

const BLANK: Cell = [SPACE, TERMINAL_DEFAULT, TERMINAL_DEFAULT]

function spriteCells(pose: string): Cell[] {
  const pixels = pose.trim().split('\n')
  const markAt = (x: number, y: number) => pixels[y]?.[x] ?? '.'
  const cells: Cell[] = []

  for (let row = 0; row < SPRITE_ROWS; row++) {
    for (let column = 0; column < SPRITE_COLUMNS; column++) {
      const x = column * 2
      const y = row * 2
      const marks = [markAt(x, y), markAt(x + 1, y), markAt(x, y + 1), markAt(x + 1, y + 1)]
      const quarter = marks.map(mark => PIXEL_COLORS[mark])
      const fg = quarter.find(color => color !== undefined)
      if (fg === undefined) {
        cells.push(BLANK)
        continue
      }
      const glyph = marks.every(mark => mark === marks[0]) ? BLOCK_GLYPHS[marks[0] ?? '.'] : undefined
      if (glyph !== undefined) {
        cells.push([glyph, fg, TERMINAL_DEFAULT])
        continue
      }
      const bg = quarter.find(color => color !== undefined && color !== fg) ?? TERMINAL_DEFAULT
      const mask = quarter.reduce<number>((bits, color, i) => (color === fg ? bits | (1 << i) : bits), 0)
      cells.push([QUADRANTS[mask] ?? SPACE, fg, bg])
    }
  }

  return cells
}

function halfBlockCells(pixels: string[], colors: Record<string, number>): Cell[] {
  const cells: Cell[] = []
  for (let y = 0; y < pixels.length; y += 2) {
    for (let x = 0; x < (pixels[y]?.length ?? 0); x++) {
      const top = colors[pixels[y]?.[x] ?? '.']
      const bottom = colors[pixels[y + 1]?.[x] ?? '.']
      if (top === undefined && bottom === undefined) cells.push(BLANK)
      else if (top === undefined) cells.push([0x2584, bottom ?? TERMINAL_DEFAULT, TERMINAL_DEFAULT])
      else if (bottom === undefined) cells.push([0x2580, top, TERMINAL_DEFAULT])
      else if (top === bottom) cells.push([0x2588, top, TERMINAL_DEFAULT])
      else cells.push([0x2580, top, bottom])
    }
  }
  return cells
}

function baseFrame(sprite: Cell[], spriteColumns: number, columns: number, rows: number): Uint32Array {
  const words = new Uint32Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) words.set(BLANK, i * 3)
  sprite.forEach((cell, i) => {
    const row = SPRITE_TOP + Math.floor(i / spriteColumns)
    words.set(cell, (row * columns + (i % spriteColumns)) * 3)
  })
  return words
}

const poseAt = (frames: Uint32Array[], elapsed: number, msPerPose: number) =>
  frames[Math.floor(elapsed / msPerPose) % frames.length] ?? new Uint32Array()

const CLAWD_LANE = 34
const CLAWD_COLUMNS = SPRITE_COLUMNS + CLAWD_LANE
const CLAWD_ROWS = SPRITE_TOP + SPRITE_ROWS
const clawdFrame = (pose: string) => baseFrame(spriteCells(pose), SPRITE_COLUMNS, CLAWD_COLUMNS, CLAWD_ROWS)
const CLAWD_TYPING = TYPING_POSES.map(clawdFrame)
const CLAWD_THINKING = THINKING_POSES.map(clawdFrame)

const CLAWD: Character = {
  name: 'clawd',
  label: 'Clawd',
  spriteColumns: SPRITE_COLUMNS,
  columns: CLAWD_COLUMNS,
  rows: CLAWD_ROWS,
  lineRows: SPRITE_ROWS,
  lineStartRow: CLAWD_ROWS - 1,
  lineRiseMs: 450,
  hmColumns: [1, 4, 2, 5],
  typing: elapsed => poseAt(CLAWD_TYPING, elapsed, TYPE_MS),
  thinking: elapsed => poseAt(CLAWD_THINKING, elapsed, BOB_MS),
}

function stamp(pixels: string[][], row: number, column: number, art: string) {
  ;[...art].forEach((mark, i) => {
    const line = pixels[row]
    if (line && mark !== '.' && column + i < line.length) line[column + i] = mark
  })
}

function drawRobot(pose: RobotPose): string[] {
  const pixels = ROBOT_PIXELS.map(row => [...(pose.isLit ? row.replace(/a/g, 'A') : row)])
  if (pose.laptop) {
    const top = ROBOT_LAPTOP_ROW + pose.laptop.bob
    ROBOT_LAPTOP.trim().split('\n').forEach((line, i) => stamp(pixels, top + i, ROBOT_LAPTOP_COLUMN, line))
    const [left, right] = ROBOT_HANDS
    if (left) stamp(pixels, pose.laptop.isLeftUp ? top : top + 1, left.column, left.art)
    if (right) stamp(pixels, pose.laptop.isRightUp ? top : top + 1, right.column, right.art)
  }
  const eyes = pose.eyes ?? 'open'
  const eyeRows = eyes === 'shut' ? [] : eyes === 'focused' ? [1] : [0, 1]
  for (const column of ROBOT_EYE_COLUMNS) {
    for (const row of eyeRows) stamp(pixels, ROBOT_EYE_ROW + row, column + (pose.eyeShift ?? 0), 'ee')
  }
  if (pose.mouth === 'smile') {
    stamp(pixels, ROBOT_MOUTH_ROW, 7, 'e..e')
    stamp(pixels, ROBOT_MOUTH_ROW + 1, 8, 'ee')
  } else {
    stamp(pixels, ROBOT_MOUTH_ROW, 8, 'eee')
  }
  return pixels.map(row => row.join(''))
}

const ROBOT_LANE = 38
const ROBOT_FRAME_COLUMNS = ROBOT_COLUMNS + ROBOT_LANE
const ROBOT_FRAME_ROWS = SPRITE_TOP + ROBOT_ROWS
const robotFrames = new Map<string, Uint32Array>()
const robotFrame = (pose: RobotPose) => {
  const key = JSON.stringify(pose)
  let frame = robotFrames.get(key)
  if (!frame) {
    frame = baseFrame(halfBlockCells(drawRobot(pose), ROBOT_COLORS), ROBOT_COLUMNS, ROBOT_FRAME_COLUMNS, ROBOT_FRAME_ROWS)
    robotFrames.set(key, frame)
  }
  return frame
}

const within = (at: number, [from, to]: number[]) => at >= (from ?? 0) && at < (to ?? 0)

function robotTyping(elapsed: number, isSmiling: boolean) {
  const inLoop = elapsed % ROBOT_LOOP_MS
  const hand = Math.floor(elapsed / ROBOT_HAND_MS) % 2
  const isPaused = within(inLoop, ROBOT_PAUSE)
  const laptop = {
    bob: Math.floor(elapsed / ROBOT_BOB_MS) % 2,
    isLeftUp: !isPaused && hand === 0,
    isRightUp: !isPaused && hand === 1,
  }
  if (isSmiling) return robotFrame({ laptop, mouth: 'smile' })
  const eyeShift = ROBOT_READ_STEPS[Math.floor(inLoop / ROBOT_READ_MS) % ROBOT_READ_STEPS.length] ?? 0
  return robotFrame({ laptop, eyeShift, eyes: within(inLoop, ROBOT_BLINK) ? 'shut' : 'focused' })
}

const ROBOT_THINKING: RobotPose[] = [{}, { isLit: true, eyeShift: -1 }, { eyes: 'focused' }, { isLit: true, eyeShift: 1 }]

const ROBOT_CHARACTER: Character = {
  name: 'robot',
  label: 'Robot',
  spriteColumns: ROBOT_COLUMNS,
  columns: ROBOT_FRAME_COLUMNS,
  rows: ROBOT_FRAME_ROWS,
  lineRows: 9,
  lineStartRow: SPRITE_TOP + Math.floor(ROBOT_LAPTOP_ROW / 2),
  lineRiseMs: 330,
  hmColumns: [12, 15, 13, 16],
  typing: robotTyping,
  thinking: elapsed => robotFrame(ROBOT_THINKING[Math.floor(elapsed / BOB_MS) % ROBOT_THINKING.length] ?? {}),
}

const CHARACTERS = [CLAWD, ROBOT_CHARACTER]

const maxLine = (character: Character) => character.columns - character.spriteColumns - LINE_GAP - character.lineRows

const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `+${(tokens / 1000).toFixed(1)}k` : `+${tokens}`

const isDrawable = (char: string) => {
  const code = char.codePointAt(0) ?? 0
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0x24f && code !== 0xad)
}

const displayLine = (raw: string, length: number) =>
  [...raw.replace(/\t/g, '  ').trim()].filter(isDrawable).join('').slice(0, length)

function scanCodeValues(scan: ValueScan, json: string, onLine: (line: string) => void) {
  scan.json = scan.json.slice(scan.cursor) + json
  scan.cursor = 0
  const append = (text: string) => {
    if (scan.line.length < MAX_SCANNED_LINE) scan.line += text
  }

  while (scan.cursor < scan.json.length) {
    if (!scan.isInValue) {
      CODE_VALUE_START.lastIndex = scan.cursor
      const start = CODE_VALUE_START.exec(scan.json)
      if (!start) {
        scan.cursor = Math.max(scan.cursor, scan.json.length - KEY_PREFIX_WINDOW)
        return
      }
      scan.cursor = start.index + start[0].length
      scan.isInValue = true
      scan.line = ''
      continue
    }

    const char = scan.json[scan.cursor] ?? ''
    if (char === '"') {
      onLine(scan.line)
      scan.isInValue = false
      scan.cursor++
    } else if (char === '\\') {
      const escaped = scan.json[scan.cursor + 1]
      if (escaped === undefined) return
      if (escaped === 'u') {
        const hex = scan.json.slice(scan.cursor + 2, scan.cursor + 6)
        if (hex.length < 4) return
        append(String.fromCharCode(parseInt(hex, 16)))
        scan.cursor += 6
        continue
      }
      if (escaped === 'n') {
        onLine(scan.line)
        scan.line = ''
      } else if (escaped === 't') {
        append('\t')
      } else if (escaped !== 'r') {
        append(escaped)
      }
      scan.cursor += 2
    } else {
      append(char)
      scan.cursor++
    }
  }
}

function scanFencedCode(scan: FenceScan, text: string, onLine: (line: string) => void) {
  const lines = (scan.line + text).split('\n')
  scan.line = (lines.pop() ?? '').slice(0, MAX_SCANNED_LINE)
  for (const line of lines) {
    if (FENCE.test(line)) scan.isInFence = !scan.isInFence
    else if (scan.isInFence) onLine(line)
  }
}

const mix = (from: number, to: number, amount: number) => {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * amount) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

const hmOpacity = (age: number) => {
  const progress = age / HM_LIFE_MS
  if (progress < 0.15) return progress / 0.15
  if (progress > 0.6) return Math.max(0, (1 - progress) / 0.4)
  return 1
}

function syncSound($: EngineInterface, sound: Sound, isTyping: boolean) {
  const shouldPlay = sound.isOn && sound.canPlay && isTyping
  if (shouldPlay === (sound.stop !== undefined)) return
  if (!shouldPlay) {
    sound.stop?.abort()
    sound.stop = undefined
    return
  }

  const stop = new AbortController()
  sound.stop = stop
  const giveUp = () => {
    if (stop.signal.aborted) return
    sound.canPlay = false
    sound.stop = undefined
  }
  void $.audio.play({ asset: TYPING_SOUND }, { shouldLoop: true, gain: TYPING_GAIN, signal: stop.signal }).then(giveUp, giveUp)
}

function loadSound($: EngineInterface, sound: Sound) {
  sound.loaded ??= $.store.get(SOUND_KEY).then(
    saved => {
      sound.isOn = saved === true
    },
    () => undefined,
  )
  return sound.loaded
}

async function toggleSound($: EngineInterface, sound: Sound, isTyping: boolean) {
  await loadSound($, sound)
  sound.isOn = !sound.isOn
  sound.canPlay = true
  syncSound($, sound, isTyping)
  $.ui.invalidate('ui.render')
  await $.store.set(SOUND_KEY, sound.isOn).catch(() => undefined)
}

const characterNamed = (name: string) => {
  const wanted = name.trim().toLowerCase()
  return CHARACTERS.find(character => character.name === wanted || character.label.toLowerCase() === wanted)
}

function loadCharacter($: EngineInterface, choice: Choice) {
  choice.loaded ??= $.store.get(CHARACTER_KEY).then(
    saved => {
      choice.character = (typeof saved === 'string' && characterNamed(saved)) || CLAWD
    },
    () => undefined,
  )
  return choice.loaded
}

async function askForCharacter($: EngineInterface, current: Character) {
  const others = CHARACTERS.filter(character => character !== current)
  return $.ui
    .ask('Who should sit under the spinner?', {
      header: 'Spinner',
      options: [current, ...others].map(character => character.label),
    })
    .catch(() => undefined)
}

async function chooseCharacter($: EngineInterface, choice: Choice, args: string) {
  await loadCharacter($, choice)
  const wanted = args.trim() || (await askForCharacter($, choice.character))
  if (wanted === undefined) return `${choice.character.label} stays.`
  const character = characterNamed(wanted)
  if (!character) return `No character called ${wanted}. Pick ${CHARACTERS.map(one => one.name).join(' or ')}.`
  choice.character = character
  $.ui.invalidate('ui.render')
  await $.store.set(CHARACTER_KEY, character.name).catch(() => undefined)
  return `${character.label} sits under the spinner now.`
}

function startTicker(
  $: EngineInterface,
  spinners: Set<string>,
  nextFrame: () => string | undefined,
  sound: Sound,
  isTyping: () => boolean,
): Timer {
  return $.clock.every(FRAME_MS, () => {
    const cells = nextFrame()
    syncSound($, sound, isTyping())
    if (cells === undefined) return
    for (const requestId of spinners) {
      void $.ui.blit({ requestId, key: KEY, cells }).then(
        ({ deny }) => {
          if (deny) spinners.delete(requestId)
        },
        () => spinners.delete(requestId),
      )
    }
  })
}

export const register: Register = on => {
  const spinners = new Set<string>()
  const queuedLines: string[] = []
  let intakes: Floating[] = []
  let codeLines: Floating[] = []
  let pendingIntake = 0
  let isThinking = false
  let hm: { bornAt: number; column: number } | undefined
  let hmCount = 0
  let ticks = 0
  let ticker: Timer | undefined
  let smileUntil = -1
  const sound: Sound = { isOn: false, canPlay: true }
  const choice: Choice = { character: CLAWD }

  const now = () => ticks * FRAME_MS
  const lane = () => choice.character.columns - choice.character.spriteColumns
  const travelled = (intake: Floating) => Math.floor((now() - intake.bornAt) / MS_PER_COLUMN)
  const risen = (line: Floating) => Math.floor((now() - line.bornAt) / choice.character.lineRiseMs)

  const queueLine = (raw: string) => {
    const line = displayLine(raw, maxLine(choice.character))
    if (line && queuedLines.push(line) > MAX_QUEUED_LINES) queuedLines.shift()
  }

  const advance = () => {
    ticks++
    intakes = intakes.filter(intake => travelled(intake) < lane() + intake.text.length)
    codeLines = codeLines.filter(line => risen(line) < choice.character.lineRows)

    const newestIntake = intakes.at(-1)
    if (pendingIntake > 0 && (!newestIntake || travelled(newestIntake) > newestIntake.text.length)) {
      intakes.push({ text: formatTokens(pendingIntake), bornAt: now() })
      pendingIntake = 0
    }

    const newestLine = codeLines.at(-1)
    const nextLine = !newestLine || risen(newestLine) >= 1 ? queuedLines.shift() : undefined
    if (nextLine) {
      codeLines.push({ text: nextLine, bornAt: now() })
      if (queuedLines.length === 0) smileUntil = now() + SMILE_MS
    }

    const { hmColumns } = choice.character
    if (!hm || now() - hm.bornAt >= HM_LIFE_MS) {
      hm = isThinking ? { bornAt: now(), column: hmColumns[hmCount++ % hmColumns.length] ?? 0 } : undefined
    }
  }

  const frame = () => {
    const { character } = choice
    const { columns, rows, spriteColumns } = character
    const words = (isThinking ? character.thinking(now()) : character.typing(now(), now() < smileUntil)).slice()
    const write = (row: number, column: number, text: string, color: number, minColumn = 0) =>
      [...text].forEach((char, i) => {
        const at = column + i
        if (row >= 0 && row < rows && at >= minColumn && at < columns) {
          words.set([char.codePointAt(0) ?? SPACE, color, TERMINAL_DEFAULT], (row * columns + at) * 3)
        }
      })

    if (hm) {
      const age = now() - hm.bornAt
      const shown = HM_TEXT.slice(0, 1 + Math.floor(age / HM_MS_PER_CHAR))
      write(HEAD_ROW, hm.column + Math.floor(age / HM_MS_PER_DRIFT), shown, mix(FADED, HM_COLOR, hmOpacity(age)))
    }

    for (const line of codeLines) {
      const up = risen(line)
      const color = mix(CODE_BRIGHT, FADED, (now() - line.bornAt) / (character.lineRows * character.lineRiseMs))
      write(character.lineStartRow - up, spriteColumns + LINE_GAP + up, line.text, color)
    }

    for (const intake of intakes) {
      const fromLaptop = lane() - travelled(intake)
      const color = mix(FADED, INTAKE_BRIGHT, Math.min(1, travelled(intake) / lane()))
      write(HEAD_ROW, spriteColumns + fromLaptop, intake.text, color, spriteColumns)
    }

    return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
  }

  const nextFrame = () => {
    advance()
    return spinners.size ? frame() : undefined
  }

  const isTyping = () => ticker !== undefined && spinners.size > 0 && !isThinking

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: SOUND_COMMAND, description: 'Turn Clawd’s typing sound on or off' })
    await $.command.register({
      name: CHARACTER_COMMAND,
      description: 'Pick who sits under the spinner',
      argumentHint: `[${CHARACTERS.map(character => character.name).join('|')}]`,
    })

    return next(e)
  })

  on('command.run', { command: SOUND_COMMAND }, async $ => {
    await toggleSound($, sound, isTyping())

    return { text: sound.isOn ? 'Typing sound on.' : 'Typing sound off.' }
  })

  on('command.run', { command: CHARACTER_COMMAND }, async ($, e) => {
    const before = choice.character
    const text = await chooseCharacter($, choice, e.args)
    if (choice.character !== before) {
      intakes = []
      codeLines = []
      hm = undefined
    }

    return { text }
  })

  on('turn.start', ($, e, next) => {
    intakes = []
    codeLines = []
    queuedLines.length = 0
    pendingIntake = 0
    isThinking = false
    hm = undefined
    ticker ??= startTicker($, spinners, nextFrame, sound, isTyping)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const expectedIntake = e.agentId
      ? Promise.resolve(0)
      : $.session.usage().then(
          usage => usage.context.tokens ?? 0,
          () => 0,
        )
    void expectedIntake.then(tokens => {
      pendingIntake += tokens
    })

    const stream = next(e)
    const toolNames = new Map<number, string>()
    const valueScans = new Map<number, ValueScan>()
    const fenceScan: FenceScan = { line: '', isInFence: false }

    for await (const chunk of stream) {
      if (chunk.kind === 'tool') {
        toolNames.set(chunk.index, chunk.name)
      } else if (chunk.kind === 'input' && CODE_TOOLS.has(toolNames.get(chunk.index) ?? '')) {
        const scan = valueScans.get(chunk.index) ?? { json: '', cursor: 0, isInValue: false, line: '' }
        valueScans.set(chunk.index, scan)
        scanCodeValues(scan, chunk.json, queueLine)
      } else if (chunk.kind === 'text') {
        scanFencedCode(fenceScan, chunk.text, queueLine)
      } else if (chunk.kind === 'stop' && chunk.usage) {
        const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } = chunk.usage
        const intake = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
        const expected = await expectedIntake
        pendingIntake = Math.max(0, pendingIntake + intake - expected)
      }
      yield chunk
    }

    return await stream.result
  })

  on('turn.complete', ($, e, next) => {
    if (!e.agentId) {
      ticker?.cancel()
      ticker = undefined
      syncSound($, sound, false)
    }

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const line = await next(e)
    if (e.surface !== 'terminal') return line

    isThinking = e.props.mode === 'thinking'
    spinners.add(e.requestId)
    ticker ??= startTicker($, spinners, nextFrame, sound, isTyping)
    await Promise.all([loadSound($, sound), loadCharacter($, choice)])
    const { Box, Button, Raster } = $.ui.resolve(e)
    const toggle = () => void toggleSound($, sound, isTyping())
    const { columns, rows } = choice.character

    return (
      <Box flexDirection="column">
        {line}
        <Box marginLeft={2} marginTop={2}>
          <Raster key={KEY} columns={columns} rows={rows} cells={frame()} />
        </Box>
        <Box marginLeft={2} marginTop={1}>
          <Button key="sound" plain dimColor={!sound.isOn} label={SOUND_LABEL} onPress={toggle} />
        </Box>
      </Box>
    )
  })
}
