import { NotFoundError, ValidationError } from './bookmarks.js'

const MAX_BODY_BYTES = 64 * 1024

export class PayloadTooLargeError extends Error {
  constructor() {
    super('请求体不能超过 64 KiB')
    this.name = 'PayloadTooLargeError'
  }
}

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function sendEmpty(res, statusCode, headers = {}) {
  res.writeHead(statusCode, headers)
  res.end()
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError()
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new ValidationError('body', '请求体必须是合法 JSON')
  }
}

function errorBody(code, message, field) {
  return { error: { code, message, ...(field === undefined ? {} : { field }) } }
}

function mapError(error) {
  if (error instanceof ValidationError)
    return { statusCode: 400, body: errorBody('VALIDATION_ERROR', error.message, error.field) }
  if (error instanceof PayloadTooLargeError)
    return { statusCode: 413, body: errorBody('PAYLOAD_TOO_LARGE', error.message) }
  if (error instanceof NotFoundError)
    return { statusCode: 404, body: errorBody('NOT_FOUND', error.message) }
  return { statusCode: 500, body: errorBody('INTERNAL_ERROR', '服务器内部错误') }
}

export function createRequestHandler({ store, version = '0.1.0', now = () => Date.now() }) {
  const startedAt = now()

  return async function handler(req, res) {
    const method = req.method ?? 'GET'
    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      sendJson(res, 400, errorBody('VALIDATION_ERROR', '请求路径不合法'))
      return
    }

    try {
      if (method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          version,
          uptimeSeconds: Math.max(0, Math.floor((now() - startedAt) / 1000)),
          bookmarks: store.count(),
        })
        return
      }

      if (method === 'GET' && pathname === '/api') {
        sendJson(res, 200, {
          name: 'keel-demo-api',
          version,
          endpoints: [
            'GET /health',
            'GET /api',
            'GET /api/bookmarks',
            'POST /api/bookmarks',
            'GET /api/bookmarks/:id',
            'PATCH /api/bookmarks/:id',
            'DELETE /api/bookmarks/:id',
            'GET /api/tags',
          ],
        })
        return
      }

      if (method === 'GET' && pathname === '/api/bookmarks') {
        sendJson(res, 200, { items: store.list(), total: store.count() })
        return
      }

      if (method === 'GET' && pathname === '/api/tags') {
        const items = store.tagCounts()
        sendJson(res, 200, { items, totalTags: items.length })
        return
      }

      if (method === 'POST' && pathname === '/api/bookmarks') {
        const body = await readJson(req)
        const bookmark = store.create(body)
        sendJson(res, 201, bookmark, { location: `/api/bookmarks/${bookmark.id}` })
        return
      }

      const match = pathname.match(/^\/api\/bookmarks\/([^/]+)$/)
      if (match !== null) {
        const id = decodeURIComponent(match[1])
        if (method === 'GET') {
          const bookmark = store.get(id)
          if (bookmark === null) throw new NotFoundError()
          sendJson(res, 200, bookmark)
          return
        }
        if (method === 'PATCH') {
          const body = await readJson(req)
          sendJson(res, 200, store.update(id, body))
          return
        }
        if (method === 'DELETE') {
          store.remove(id)
          sendEmpty(res, 204)
          return
        }
      }

      sendJson(res, 404, errorBody('NOT_FOUND', '端点不存在'))
    } catch (error) {
      const mapped = mapError(error)
      sendJson(res, mapped.statusCode, mapped.body)
    }
  }
}
