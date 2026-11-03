import { test, expect } from 'claude-code/testing'

import { countLines, extOf } from './count'

test('skips blanks and separates comments', () => {
  const text = ['// a', '', 'const x = 1', '/* b', 'c */', 'let y // tail'].join('\n')

  expect(countLines(text, 'ts')).toEqual({ all: 5, code: 2, comments: 3, blank: 1 })
})

test('python docstrings and hash comments', () => {
  const text = ['"""doc', 'more"""', '# c', 'x = 1', ''].join('\n')

  expect(countLines(text, 'py')).toEqual({ all: 4, code: 1, comments: 3, blank: 1 })
})

test('extension of a path', () => {
  expect(extOf('/a/b/Main.TSX')).toBe('tsx')
})
