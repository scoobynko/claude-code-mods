import { expect, test } from 'claude-code/testing'

import { fit, pngSize } from '../hooks/picture'
import { pngHeader } from './fixtures'

test('reads the size out of a PNG header', () => {
  expect(pngSize(`${pngHeader(800, 400)}\n`)).toEqual({ width: 800, height: 400 })
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
