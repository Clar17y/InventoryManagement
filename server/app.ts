import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import categoriesRouter from './routes/categories'
import productsRouter from './routes/products'
import inventoryRouter from './routes/inventory'
import hampersRouter from './routes/hampers'
import salesRouter from './routes/sales'
import analyticsRouter from './routes/analytics'
import settingsRouter from './routes/settings'
import expensesRouter from './routes/expenses'
import etsyRouter from './routes/etsy'
import etsySyncRouter from './routes/etsySync'
import { requireAuth } from './middleware/requireAuth'
import { createPrismaIdleDisconnectMiddleware } from './middleware/prismaIdleDisconnect'
import { healthResponseSchema } from '#contracts/routes/health'

export function createApp() {
  const app = express()

  // ES module dirname workaround
  const __dirname = path.dirname(fileURLToPath(import.meta.url))

  app.use(cors())
  app.use(express.json())

  // Health check
  app.get('/api/health', (_, res) => {
    const payload = { status: 'ok', timestamp: new Date().toISOString() }
    res.json(healthResponseSchema.parse(payload))
  })

  // Disconnect Prisma when idle so Neon can autosuspend (no open connections)
  app.use('/api', createPrismaIdleDisconnectMiddleware({ idleMs: 5 * 60 * 1000 }))

  // Require auth for all other API routes
  app.use('/api', requireAuth)

  // API routes
  app.use('/api/categories', categoriesRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/inventory', inventoryRouter)
  app.use('/api/hampers', hampersRouter)
  app.use('/api/sales', salesRouter)
  app.use('/api/analytics', analyticsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/expenses', expensesRouter)
  app.use('/api/etsy', etsyRouter)
  app.use('/api/etsy/sync', etsySyncRouter)

  // Serve static files in production
  app.use(express.static(path.join(__dirname, '../dist')))

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../dist/index.html'))
    }
  })

  return app
}

