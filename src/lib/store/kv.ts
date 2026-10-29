import { openDB, type IDBPDatabase } from 'idb'

/**
 * Key-value storage backed by IndexedDB, read synchronously from an in-memory cache.
 *
 * `hydrate()` runs once before the app renders: it opens the database, copies any data
 * left by version 1.x from localStorage on the first run, and fills the cache. After that,
 * `getItem` and `setItem` work like localStorage (strings in, strings out), so the hooks
 * stay synchronous, and writes go to IndexedDB in the background.
 *
 * The 1.x keys are also mirrored to localStorage, so going back to 1.1 keeps working and
 * a failed IndexedDB write never loses data. Large collections added in 2.x are not mirrored.
 */

export const DB_NAME = 'mirror-gambit'
const DB_VERSION = 1
const KV_STORE = 'kv'
const META_MIGRATED = 'meta.migrated-from-localstorage'

/** Every key version 1.x wrote to localStorage. */
export const LEGACY_KEYS = [
  'mirror-gambit.settings.v1',
  'mirror-gambit.srs-cards.v1',
  'mirror-gambit.opening-stats.v1',
  'mirror-gambit.puzzle-stats.v1',
  'mirror-gambit.review-history.v1',
] as const

const MIRRORED = new Set<string>(LEGACY_KEYS)

const cache = new Map<string, string>()
let db: IDBPDatabase | null = null
let hydrated = false

function legacyStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface HydrateResult {
  /** 'indexeddb' normally; 'localstorage' when IndexedDB could not be opened. */
  backend: 'indexeddb' | 'localstorage'
  /** Keys copied from localStorage on this run (only on the first run after upgrading). */
  migrated: string[]
}

export async function hydrate(): Promise<HydrateResult> {
  cache.clear()
  const ls = legacyStorage()
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB')
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(KV_STORE)) d.createObjectStore(KV_STORE)
      },
    })
  } catch (e) {
    console.warn('IndexedDB unavailable, using localStorage', e)
    db = null
  }

  if (!db) {
    // Fallback: behave exactly like 1.x.
    if (ls) for (const key of LEGACY_KEYS) {
      const v = ls.getItem(key)
      if (v !== null) cache.set(key, v)
    }
    hydrated = true
    return { backend: 'localstorage', migrated: [] }
  }

  const migrated: string[] = []
  const done = await db.get(KV_STORE, META_MIGRATED)
  if (!done && ls) {
    const tx = db.transaction(KV_STORE, 'readwrite')
    for (const key of LEGACY_KEYS) {
      const v = ls.getItem(key)
      if (v !== null) {
        await tx.store.put(v, key)
        migrated.push(key)
      }
    }
    await tx.store.put(new Date().toISOString(), META_MIGRATED)
    await tx.done
  }

  let cursor = await db.transaction(KV_STORE).store.openCursor()
  while (cursor) {
    if (typeof cursor.value === 'string') cache.set(String(cursor.key), cursor.value)
    cursor = await cursor.continue()
  }
  hydrated = true
  return { backend: 'indexeddb', migrated }
}

export function isHydrated(): boolean {
  return hydrated
}

export function getItem(key: string): string | null {
  if (!hydrated) {
    // Before hydrate (unit tests that skip it): read straight from localStorage.
    return legacyStorage()?.getItem(key) ?? null
  }
  return cache.get(key) ?? null
}

/** Parses a stored JSON value, or returns the fallback when the key is empty or unreadable. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function setItem(key: string, value: string): void {
  cache.set(key, value)
  if (MIRRORED.has(key) || !db) {
    try {
      legacyStorage()?.setItem(key, value)
    } catch {
      /* storage full or blocked; IndexedDB still has it */
    }
  }
  if (db) {
    db.put(KV_STORE, value, key).catch((e) => console.warn(`Could not save ${key}`, e))
  }
}

export function removeItem(key: string): void {
  cache.delete(key)
  try {
    legacyStorage()?.removeItem(key)
  } catch {
    /* ignore */
  }
  db?.delete(KV_STORE, key).catch(() => {})
}

/** Waits for pending writes (used by tests and before quitting). */
export async function flush(): Promise<void> {
  if (!db) return
  await db.transaction(KV_STORE, 'readonly').done
}

/** Closes the database and clears the cache (tests only). */
export function resetForTests(): void {
  db?.close()
  db = null
  hydrated = false
  cache.clear()
}
