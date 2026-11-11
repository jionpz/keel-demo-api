import { randomUUID } from 'node:crypto'

export const BOOKMARK_STATUSES = ['unread', 'reading', 'done']
export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export class NotFoundError extends Error {
  constructor(message = '书签不存在') {
    super(message)
    this.name = 'NotFoundError'
  }
}

function text(value, field, { min = 0, max, trim = true } = {}) {
  if (typeof value !== 'string') throw new ValidationError(field, `${field} 必须是字符串`)
  const result = trim ? value.trim() : value
  if (result.length < min) throw new ValidationError(field, `${field} 至少 ${min} 个字符`)
  if (max !== undefined && result.length > max)
    throw new ValidationError(field, `${field} 最多 ${max} 个字符`)
  return result
}

function url(value) {
  const raw = text(value, 'url', { min: 1, max: 2048 })
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new ValidationError('url', 'url 必须是合法 URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new ValidationError('url', 'url 必须是 http(s) URL')
  return parsed.toString()
}

function status(value) {
  if (!BOOKMARK_STATUSES.includes(value))
    throw new ValidationError('status', `status 必须是 ${BOOKMARK_STATUSES.join(' | ')}`)
  return value
}

function tags(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ValidationError('tags', 'tags 必须是数组')
  if (value.length > 20) throw new ValidationError('tags', 'tags 最多 20 个')
  const unique = new Set()
  for (const raw of value) {
    const tag = text(raw, 'tags', { min: 1, max: 40 }).toLowerCase()
    unique.add(tag)
  }
  return [...unique].sort()
}

function notes(value) {
  if (value === undefined || value === null) return ''
  return text(value, 'notes', { max: 2000 })
}

export function normalizeCreate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new ValidationError('body', '请求体必须是 JSON 对象')
  return {
    title: text(input.title, 'title', { min: 1, max: 200 }),
    url: url(input.url),
    status: input.status === undefined ? 'unread' : status(input.status),
    tags: tags(input.tags),
    notes: notes(input.notes),
  }
}

const PATCH_FIELDS = ['title', 'url', 'status', 'tags', 'notes']

export function normalizePatch(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new ValidationError('body', '请求体必须是 JSON 对象')
  const keys = Object.keys(input)
  const unknown = keys.filter((key) => !PATCH_FIELDS.includes(key))
  if (unknown.length > 0)
    throw new ValidationError('body', `不支持的字段：${unknown.join(', ')}`)
  if (keys.length === 0) throw new ValidationError('body', '至少需要一个待更新字段')
  const patch = {}
  if (input.title !== undefined) patch.title = text(input.title, 'title', { min: 1, max: 200 })
  if (input.url !== undefined) patch.url = url(input.url)
  if (input.status !== undefined) patch.status = status(input.status)
  if (input.tags !== undefined) patch.tags = tags(input.tags)
  if (input.notes !== undefined) patch.notes = notes(input.notes)
  return patch
}

function clone(bookmark) {
  return { ...bookmark, tags: [...bookmark.tags] }
}

/**
 * 进程内 store。刻意不碰文件或数据库，方便测试和 Keel 在任意环境重复执行。
 */
export function createBookmarkStore({
  now = () => new Date().toISOString(),
  id = () => randomUUID(),
  seed = [],
} = {}) {
  const items = new Map()

  function insert(input, metadata = {}) {
    const normalized = normalizeCreate(input)
    const createdAt = metadata.createdAt ?? now()
    const bookmark = {
      id: metadata.id ?? id(),
      ...normalized,
      createdAt,
      updatedAt: metadata.updatedAt ?? createdAt,
    }
    items.set(bookmark.id, bookmark)
    return clone(bookmark)
  }

  function requireItem(bookmarkId) {
    const bookmark = items.get(bookmarkId)
    if (bookmark === undefined) throw new NotFoundError()
    return bookmark
  }

  for (const item of seed) insert(item)

  return {
    count() {
      return items.size
    },

    list() {
      return [...items.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .map(clone)
    },

    get(bookmarkId) {
      const bookmark = items.get(bookmarkId)
      return bookmark === undefined ? null : clone(bookmark)
    },

    create(input) {
      return insert(input)
    },

    update(bookmarkId, input) {
      const bookmark = requireItem(bookmarkId)
      const patch = normalizePatch(input)
      const updated = { ...bookmark, ...patch, updatedAt: now() }
      items.set(bookmarkId, updated)
      return clone(updated)
    },

    remove(bookmarkId) {
      requireItem(bookmarkId)
      items.delete(bookmarkId)
    },
  }
}
