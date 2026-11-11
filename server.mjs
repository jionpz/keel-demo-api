import { createServer } from 'node:http'
import { createBookmarkStore } from './src/bookmarks.js'
import { createRequestHandler } from './src/http.js'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 3001)

const store = createBookmarkStore({
  seed: [
    {
      title: 'Keel',
      url: 'https://github.com/jionpz/keel',
      status: 'reading',
      tags: ['ai', 'workflow'],
      notes: 'jstack + 天问的工程运行层',
    },
    {
      title: 'jstack',
      url: 'https://github.com/jionpz/jstack',
      tags: ['workflow'],
    },
    {
      title: 'Node.js test runner',
      url: 'https://nodejs.org/api/test.html',
      status: 'done',
      tags: ['node', 'testing'],
    },
  ],
})

const server = createServer(createRequestHandler({ store }))

server.listen(port, host, () => {
  console.log(`keel-demo-api listening on http://${host}:${port}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
