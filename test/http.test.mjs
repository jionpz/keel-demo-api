import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBookmarkStore } from '../src/bookmarks.js'
import { createRequestHandler } from '../src/http.js'

let server
let baseUrl
let socketDirectory
let socketPath

function fetch(url, options = {}) {
  if (socketPath === undefined) return globalThis.fetch(url, options)
  return new Promise((resolve, reject) => {
    const pending = request(
      {
        socketPath,
        path: new URL(url).pathname + new URL(url).search,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('error', reject)
        response.on('end', () => {
          const body = Buffer.concat(chunks)
          resolve(new Response(body.length === 0 ? null : body, {
            status: response.statusCode,
            headers: Object.fromEntries(
              Object.entries(response.headers)
                .filter(([, value]) => value !== undefined)
                .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value]),
            ),
          }))
        })
      },
    )
    pending.on('error', reject)
    pending.end(options.body)
  })
}

before(async () => {
  const store = createBookmarkStore({
    now: () => '2026-11-11T00:00:00.000Z',
    seed: [{ title: 'seed', url: 'https://example.com', tags: ['demo'] }],
  })
  server = createServer(createRequestHandler({ store, version: '9.9.9' }))
  if (process.env.TEST_TRANSPORT === 'tcp') {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  } else {
    socketDirectory = await mkdtemp(join(tmpdir(), 'keel-api-http-'))
    socketPath = join(socketDirectory, 'http.sock')
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
    baseUrl = 'http://localhost'
  }
})

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    })
  }
  if (socketDirectory !== undefined) await rm(socketDirectory, { recursive: true, force: true })
})

describe('HTTP API', () => {
  it('health 返回版本、uptime 与 store 数量', async () => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.status, 'ok')
    assert.equal(body.version, '9.9.9')
    assert.equal(typeof body.uptimeSeconds, 'number')
    assert.equal(body.bookmarks, 1)
  })

  it('GET /api/bookmarks 返回 items 与 total', async () => {
    const response = await fetch(`${baseUrl}/api/bookmarks`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.total, 1)
    assert.equal(body.items.length, 1)
  })

  it('创建、读取、更新、删除完整链路', async () => {
    const created = await fetch(`${baseUrl}/api/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Keel',
        url: 'https://github.com/jionpz/keel',
        tags: ['AI'],
      }),
    })
    assert.equal(created.status, 201)
    assert.match(created.headers.get('location'), /^\/api\/bookmarks\//)
    const bookmark = await created.json()
    assert.deepEqual(bookmark.tags, ['ai'])

    const fetched = await fetch(`${baseUrl}/api/bookmarks/${bookmark.id}`)
    assert.equal(fetched.status, 200)
    assert.equal((await fetched.json()).title, 'Keel')

    const updated = await fetch(`${baseUrl}/api/bookmarks/${bookmark.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    assert.equal(updated.status, 200)
    assert.equal((await updated.json()).status, 'done')

    const removed = await fetch(`${baseUrl}/api/bookmarks/${bookmark.id}`, { method: 'DELETE' })
    assert.equal(removed.status, 204)
    assert.equal(await removed.text(), '')

    const missing = await fetch(`${baseUrl}/api/bookmarks/${bookmark.id}`)
    assert.equal(missing.status, 404)
    assert.equal((await missing.json()).error.code, 'NOT_FOUND')
  })

  it('非法输入返回结构化的 400', async () => {
    const response = await fetch(`${baseUrl}/api/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', url: 'not-a-url' }),
    })
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.equal(body.error.code, 'VALIDATION_ERROR')
    assert.equal(body.error.field, 'url')
  })

  it('非法 JSON、未知端点与未知方法都有明确错误', async () => {
    const badJson = await fetch(`${baseUrl}/api/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    assert.equal(badJson.status, 400)
    assert.equal((await badJson.json()).error.code, 'VALIDATION_ERROR')

    const unknown = await fetch(`${baseUrl}/nope`)
    assert.equal(unknown.status, 404)
    assert.equal((await unknown.json()).error.code, 'NOT_FOUND')

    const wrongMethod = await fetch(`${baseUrl}/api/bookmarks`, { method: 'PUT' })
    assert.equal(wrongMethod.status, 404)
  })

  it('超过 64 KiB 的请求体返回 413', async () => {
    const response = await fetch(`${baseUrl}/api/bookmarks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(70 * 1024), url: 'https://example.com' }),
    })
    assert.equal(response.status, 413)
    assert.equal((await response.json()).error.code, 'PAYLOAD_TOO_LARGE')
  })
})
