/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `akx-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/one.txt', 'one')
    vfs.seed('/akx/two.txt', 'two')
    const first = identity(vfs, '/akx/one.txt')
    expect(identity(vfs, '/akx/two.txt')).not.toBe(first)
    expect(identity(vfs, '/akx/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/akx/skills/git/SKILL.md')
    vfs.rmSync('/akx/skills', { recursive: true })
    vfs.seed('/akx/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/akx/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/from.txt', 'moved')
    vfs.seed('/akx/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/akx/from.txt'), identity(vfs, '/akx/to.txt')]
    vfs.renameSync('/akx/from.txt', '/akx/to.txt')
    const renamed = identity(vfs, '/akx/to.txt')
    expect(vfs.readFileSync('/akx/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/akx/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/akx/restored') as VfsStats
    const directory = vfs.statSync('/akx/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/akx/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/akx/log.jsonl')
    vfs.writeFileSync('/akx/log.jsonl', 'second\n')
    const written = modified(vfs, '/akx/log.jsonl')
    vfs.appendFileSync('/akx/log.jsonl', 'third\n')
    const appended = modified(vfs, '/akx/log.jsonl')
    vfs.truncateSync('/akx/log.jsonl', 6)
    const truncated = modified(vfs, '/akx/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/akx/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/akx/log.jsonl', 'second\n')
    expect(modified(vfs, '/akx/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/akx/file', 5)
    expect([...vfs.readFileSync('/akx/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/akx/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/akx/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/akx/workspace')
    const empty = modified(vfs, '/akx/workspace')
    vfs.writeFileSync('/akx/workspace/file.txt', 'one')
    const created = modified(vfs, '/akx/workspace')
    vfs.writeFileSync('/akx/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/akx/workspace')
    vfs.rmSync('/akx/workspace/file.txt')
    const removed = modified(vfs, '/akx/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/akx/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/akx/seeded.txt', 'changed')
    vfs.mkdirSync('/akx/created')
    vfs.chmodSync('/akx/created', 0o700)
    vfs.renameSync('/akx/seeded.txt', '/akx/renamed.txt')
    vfs.rmSync('/akx/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/akx/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/akx/created' },
      { kind: 'chmod', path: '/akx/created', mode: 0o700 },
      { kind: 'remove', path: '/akx/seeded.txt' },
      { kind: 'write', path: '/akx/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/akx/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/akx')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/akx/one', '1')
    first()
    second()
    vfs.writeFileSync('/akx/two', '2')
    expect(seen).toEqual(['/akx/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/akx')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/akx/log', 'a')
    vfs.appendFileSync('/akx/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/akx/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/akx/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/akx/source', 'old')
    const descriptor = vfs.openFileSync('/akx/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/akx/source', '/akx/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/akx/destination'])
    expect(vfs.readFileSync('/akx/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/akx/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('reports the path identity through a BigInt file handle stat', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/session.lock', '')
    const handle = vfs.open('/akx/session.lock', 'w')
    const held = await handle.stat({ bigint: true }) as VfsBigIntStats
    const current = vfs.statSync('/akx/session.lock', { bigint: true }) as VfsBigIntStats

    expect([held.dev, held.ino]).toEqual([current.dev, current.ino])
    await handle.chmod(0o600)
    expect((vfs.statSync('/akx/session.lock') as VfsStats).mode & 0o777).toBe(0o600)
    await handle.close()
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/akx/staging/nested', { mode: 0o700 })
    vfs.seed('/akx/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/akx/staging', '/akx/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/akx/staging'],
      ['mkdir', '/akx/published'],
      ['mkdir', '/akx/published/nested'],
      ['write', '/akx/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/source/nested/file', 'source')
    vfs.seed('/akx/file', 'destination')
    vfs.seed('/akx/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/akx/source', '/akx/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/akx/source', '/akx/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/akx/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/akx/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/akx/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/akx/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/akx/source/nested', { mode: 0o700 })
    vfs.seed('/akx/source/nested/file', 'source')
    vfs.seedDirectory('/akx/destination', { mode: 0o711 })

    vfs.renameSync('/akx/source', '/akx/destination')

    expect(vfs.existsSync('/akx/source')).toBe(false)
    expect(vfs.readFileSync('/akx/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/akx/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/akx/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/session.jsonl', 'committed\n')
    vfs.linkSync('/akx/session.jsonl', '/akx/session-latest.jsonl')
    vfs.linkSync('/akx/session-latest.jsonl', '/akx/session-archive.jsonl')
    expect(identity(vfs, '/akx/session-latest.jsonl')).toBe(identity(vfs, '/akx/session.jsonl'))
    expect(linkCount(vfs, '/akx/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/akx/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/akx/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/akx/session.jsonl',
      '/akx/session-latest.jsonl',
      '/akx/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/akx/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/akx/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/akx/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/akx/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/akx/session-latest.jsonl')
    expect(linkCount(vfs, '/akx/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/akx/session-archive.jsonl')
    expect(linkCount(vfs, '/akx/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/akx/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/source', 'value')
    vfs.linkSync('/akx/source', '/akx/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/akx/source', '/akx/alias')

    expect(vfs.readFileSync('/akx/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/akx/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/akx/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/replacement', 'replacement')
    vfs.seed('/akx/target', 'old')
    vfs.linkSync('/akx/target', '/akx/target-alias')
    const replaced = vfs.openFileSync('/akx/target', 'r+')
    vfs.renameSync('/akx/replacement', '/akx/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/akx/target-alias'])
    expect(vfs.readFileSync('/akx/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/akx/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/akx/target-alias')).toBe(1n)

    vfs.seed('/akx/tree/file', 'tree')
    vfs.linkSync('/akx/tree/file', '/akx/outside')
    const moved = vfs.openFileSync('/akx/tree/file', 'r+')
    vfs.renameSync('/akx/tree', '/akx/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/akx/outside', '/akx/moved/file'])
    expect(linkCount(vfs, '/akx/moved/file')).toBe(2n)

    vfs.rmSync('/akx/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/akx/outside'])
    expect(vfs.readFileSync('/akx/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/akx/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/akx/file', 'value')
    vfs.seedDirectory('/akx/directory')
    expect(() => { vfs.renameSync('/akx/file', '/akx/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/akx/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/akx/directory').isDirectory()).toBe(true)
  })
})
