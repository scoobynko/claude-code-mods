import { expect, test } from 'claude-code/testing'

import { fit, pngSize } from '../hooks/picture'

const header = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

test('reads the size out of a PNG header', () => {
  expect(pngSize(`${header(800, 400)}\n`)).toEqual({ width: 800, height: 400 })
})

test('refuses what is not a PNG', () => {
  expect(pngSize(btoa('GIF89a and then some more bytes'))).toBeUndefined()
  expect(pngSize('')).toBeUndefined()
})

test('fills the width when the height allows', () => {
  expect(fit({ width: 800, height: 400 }, 60, 30)).toEqual({ columns: 60, rows: 15 })
})

test('shrinks to the rows it has, keeping the shape', () => {
  expect(fit({ width: 100, height: 400 }, 60, 20)).toEqual({ columns: 10, rows: 20 })
})

test('stays inside what an Image takes', () => {
  expect(fit({ width: 4000, height: 1 }, 400, 30)).toEqual({ columns: 255, rows: 1 })
  expect(fit({ width: 1, height: 4000 }, 60, 400)).toEqual({ columns: 1, rows: 255 })
})
