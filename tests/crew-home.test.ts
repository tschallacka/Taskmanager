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

/** A stand-in for the browser's localStorage, which Node does not have. */
function fakeStore(options: { throwOnRead?: boolean, throwOnWrite?: boolean } = {}) {
  const items = new Map<string, string>()
  return {
    items,
    getItem(key: string): string | null {
      if (options.throwOnRead) throw new Error('storage blocked')
      return items.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      if (options.throwOnWrite) throw new Error('quota exceeded')
      items.set(key, String(value))
    }
  }
}

/** Runs the callback with the fake store in place of localStorage, then restores whatever was there. */
function withStore<T>(store: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })
  try {
    return run()
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

describe('the browser store, per crew', () => {
  test('a folder written for a crew is read back for that crew, normalized', () => {
    withStore(fakeStore(), () => {
      assert.equal(writeCrewHome('taskmanager', '~/crew-home-taskmanager/'), true)
      assert.equal(readCrewHome('taskmanager'), '~/crew-home-taskmanager')
    })
  })

  test('each crew keeps its own folder, and an unknown crew reads as nothing remembered', () => {
    withStore(fakeStore(), () => {
      writeCrewHome('taskmanager', '~/crew-home-taskmanager')
      writeCrewHome('fundesign', '/Users/me/fundesign')
      assert.equal(readCrewHome('taskmanager'), '~/crew-home-taskmanager')
      assert.equal(readCrewHome('fundesign'), '/Users/me/fundesign')
      assert.equal(readCrewHome('unknown'), null)
    })
  })

  test('a second write for a crew replaces its folder and leaves the other crews alone', () => {
    withStore(fakeStore(), () => {
      writeCrewHome('taskmanager', '~/crew-home-taskmanager')
      writeCrewHome('fundesign', '/Users/me/fundesign')
      writeCrewHome('taskmanager', '/Users/me/crew/taskmanager')
      assert.equal(readCrewHome('taskmanager'), '/Users/me/crew/taskmanager')
      assert.equal(readCrewHome('fundesign'), '/Users/me/fundesign')
    })
  })

  test('a store that refuses the write reports it was not kept and remembers nothing', () => {
    withStore(fakeStore({ throwOnWrite: true }), () => {
      assert.equal(writeCrewHome('taskmanager', '~/crew-home-taskmanager'), false)
      assert.equal(readCrewHome('taskmanager'), null)
    })
  })

  test('a store that throws on read reads as nothing remembered', () => {
    withStore(fakeStore({ throwOnRead: true }), () => {
      assert.equal(readCrewHome('taskmanager'), null)
    })
  })

  test('a stored value that is no longer a usable folder reads as nothing remembered', () => {
    const store = fakeStore()
    store.setItem('taskmanager.crewHome.taskmanager', '~/my crew')
    withStore(store, () => {
      assert.equal(readCrewHome('taskmanager'), null)
    })
  })
})
