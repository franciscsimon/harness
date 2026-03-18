import { serve } from '@hono/node-server'
import app from './app.js'

serve({ fetch: app.fetch, port: 3111 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
