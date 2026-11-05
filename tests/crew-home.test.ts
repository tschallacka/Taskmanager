// The crew home folder the Owner types once per crew: the guess, what a typed folder must look like to
// paste into a terminal, and the form a $HOME heredoc needs. The browser store is read without a window,
// so a blocked or missing store must read as nothing remembered. Run:
//   node --import tsx --test tests/crew-home.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { guessCrewHome, normalizeCrewHome, readCrewHome, shellCrewHome, writeCrewHome } from '../app/utils/crewHome'

describe('guessCrewHome', () => {
  test('the guess is a folder per crew under ~/crew-home', () => {
    assert.equal(guessCrewHome('taskmanager'), '~/crew-home/taskmanager')
  })
})

describe('normalizeCrewHome', () => {
  test('trims spaces and a trailing slash', () => {
    assert.equal(normalizeCrewHome('  ~/crew-home-taskmanager/  '), '~/crew-home-taskmanager')
    assert.equal(normalizeCrewHome('/Users/me/crew/'), '/Users/me/crew')
  })

  test('keeps the root folder as it is', () => {
    assert.equal(normalizeCrewHome('/'), '/')
  })

  test('refuses an empty folder, a bare ~ and a relative path', () => {
    assert.equal(normalizeCrewHome(''), null)
    assert.equal(normalizeCrewHome('   '), null)
    assert.equal(normalizeCrewHome('~'), null)
    assert.equal(normalizeCrewHome('crew-home/taskmanager'), null)
  })

  test('refuses a folder with spaces or shell characters, which a pasted command would break', () => {
    assert.equal(normalizeCrewHome('~/my crew'), null)
    assert.equal(normalizeCrewHome('~/crew;rm -rf ~'), null)
    assert.equal(normalizeCrewHome('~/$HOME/crew'), null)
    assert.equal(normalizeCrewHome('/tmp/"quoted"'), null)
  })
})

describe('shellCrewHome', () => {
  test('a ~ folder becomes $HOME inside a heredoc, an absolute folder stays', () => {
    assert.equal(shellCrewHome('~/crew-home/taskmanager'), '$HOME/crew-home/taskmanager')
    assert.equal(shellCrewHome('/Users/me/crew'), '/Users/me/crew')
  })
})

describe('the browser store', () => {
  test('with no window the store reads as nothing remembered and writing reports it was not kept', () => {
    assert.equal(readCrewHome('taskmanager'), null)
    assert.equal(writeCrewHome('taskmanager', '~/crew-home-taskmanager'), false)
  })
})
