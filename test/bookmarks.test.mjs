import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKMARK_STATUSES,
  NotFoundError,
  ValidationError,
  createBookmarkStore,
  normalizeCreate,
  normalizePatch,
} from '../src/bookmarks.js'

const NOW = '2026-11-11T00:00:00.000Z'

function store() {
  return createBookmarkStore({ now: () => NOW })
}

describe('normalizeCreate', () => {
  it('应用缺省值并规范化 URL、tags 与空白', () => {
    const bookmark = normalizeCreate({
      title: '  Keel  ',
      url: 'https://github.com/jionpz/keel',
      tags: ['AI', ' workflow ', 'ai'],
    })
    assert.equal(bookmark.title, 'Keel')
    assert.equal(bookmark.status, 'unread')
    assert.deepEqual(bookmark.tags, ['ai', 'workflow'])
    assert.equal(bookmark.notes, '')
  })

  it('拒绝非法 URL、状态、标题与 tags', () => {
    assert.throws(
      () => normalizeCreate({ title: 'x', url: 'ftp://example.com' }),
      (error) => error instanceof ValidationError && error.field === 'url',
    )
    assert.throws(
      () => normalizeCreate({ title: 'x', url: 'https://example.com', status: 'later' }),
      (error) => error instanceof ValidationError && error.field === 'status',
    )
    assert.throws(
      () => normalizeCreate({ title: '   ', url: 'https://example.com' }),
      (error) => error instanceof ValidationError && error.field === 'title',
    )
    assert.throws(
      () => normalizeCreate({ title: 'x', url: 'https://example.com', tags: ['ok', 1] }),
      (error) => error instanceof ValidationError && error.field === 'tags',
    )
  })

  it('暴露稳定的状态集合', () => {
    assert.deepEqual(BOOKMARK_STATUSES, ['unread', 'reading', 'done'])
  })
})

describe('normalizePatch', () => {
  it('接受部分字段并拒绝空 patch / 未知字段', () => {
    assert.deepEqual(normalizePatch({ status: 'done' }), { status: 'done' })
    assert.throws(
      () => normalizePatch({}),
      (error) => error instanceof ValidationError && error.field === 'body',
    )
    assert.throws(
      () => normalizePatch({ id: 'forged' }),
      (error) => error instanceof ValidationError && error.field === 'body',
    )
  })
})

describe('bookmark store', () => {
  it('创建、读取、更新与删除，并保留 id / createdAt', () => {
    const s = store()
    const created = s.create({ title: 'Keel', url: 'https://github.com/jionpz/keel' })
    assert.equal(s.count(), 1)
    assert.equal(s.get(created.id).title, 'Keel')

    const updated = s.update(created.id, { status: 'done', tags: ['Reading'] })
    assert.equal(updated.id, created.id)
    assert.equal(updated.createdAt, created.createdAt)
    assert.equal(updated.status, 'done')
    assert.deepEqual(updated.tags, ['reading'])

    s.remove(created.id)
    assert.equal(s.get(created.id), null)
    assert.equal(s.count(), 0)
  })

  it('更新或删除不存在的书签返回 NotFoundError', () => {
    const s = store()
    assert.throws(() => s.update('missing', { status: 'done' }), NotFoundError)
    assert.throws(() => s.remove('missing'), NotFoundError)
  })

  it('按创建时间倒序返回副本，外部修改不污染 store', () => {
    let tick = 0
    const s = createBookmarkStore({ now: () => `2026-11-11T00:00:0${tick++}.000Z` })
    const first = s.create({ title: 'first', url: 'https://example.com/1' })
    const second = s.create({ title: 'second', url: 'https://example.com/2' })
    const list = s.list()
    assert.deepEqual(
      list.map((item) => item.id),
      [second.id, first.id],
    )
    list[0].tags.push('mutated')
    assert.deepEqual(s.get(second.id).tags, [])
  })

  it('tagCounts 只统计现有标签，按 count 降序、tag 升序', () => {
    const s = store()
    s.create({ title: 'a', url: 'https://example.com/a', tags: ['Workflow', 'ai'] })
    s.create({ title: 'b', url: 'https://example.com/b', tags: ['workflow'] })
    s.create({ title: 'c', url: 'https://example.com/c', tags: ['node', 'testing', 'ai'] })
    assert.deepEqual(s.tagCounts(), [
      { tag: 'ai', count: 2 },
      { tag: 'workflow', count: 2 },
      { tag: 'node', count: 1 },
      { tag: 'testing', count: 1 },
    ])
  })

  it('tagCounts 同计数按码点升序，astral 字符不因 UTF-16 码元序错位', () => {
    const s = store()
    const created = s.create({
      title: 'astral',
      url: 'https://example.com/astral',
      tags: ['😀', '\uFFFF'],
    })
    assert.deepEqual(created.tags, ['\uFFFF', '😀'])
    assert.deepEqual(s.tagCounts(), [
      { tag: '\uFFFF', count: 1 },
      { tag: '😀', count: 1 },
    ])
  })

  it('tagCounts 在空 store 返回空数组，删除后计数下降', () => {
    const s = store()
    assert.deepEqual(s.tagCounts(), [])
    const created = s.create({
      title: 'x',
      url: 'https://example.com',
      tags: ['ai', 'workflow'],
    })
    assert.deepEqual(s.tagCounts(), [
      { tag: 'ai', count: 1 },
      { tag: 'workflow', count: 1 },
    ])
    s.remove(created.id)
    assert.deepEqual(s.tagCounts(), [])
  })

  it('seed 走与 create 相同的校验', () => {
    const seeded = createBookmarkStore({
      now: () => NOW,
      seed: [{ title: 'seed', url: 'https://example.com' }],
    })
    assert.equal(seeded.count(), 1)
  })
})
