import { serve } from '@hono/node-server'
import assert from 'node:assert/strict'
import app from './app.js'

const server = serve({ fetch: app.fetch, port: 3111 })

async function run() {
  // --- GET / ---
  const root = await fetch('http://localhost:3111/')
  assert.equal(root.status, 200, 'GET / should return 200')
  const rootBody = await root.json()
  assert.equal(rootBody.name, 'hello-service', 'name should be hello-service')
  assert.equal(rootBody.version, '1.0.0', 'version should be 1.0.0')

  // --- GET /hello/:name ---
  const hello = await fetch('http://localhost:3111/hello/world')
  assert.equal(hello.status, 200, 'GET /hello/world should return 200')
  const helloBody = await hello.json()
  assert.equal(helloBody.greeting, 'Hello, world!', 'greeting should interpolate name')

  // --- 404 ---
  const notFound = await fetch('http://localhost:3111/nonexistent')
  assert.equal(notFound.status, 404, 'Unknown route should return 404')

  console.log('All tests passed')
}

run()
  .catch((err) => {
    console.error('Test failed:', err.message)
    process.exit(1)
  })
  .finally(() => {
    server.close()
  })
