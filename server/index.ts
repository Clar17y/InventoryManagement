import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import categoriesRouter from './routes/categories'
import productsRouter from './routes/products'
import inventoryRouter from './routes/inventory'
import hampersRouter from './routes/hampers'
import salesRouter from './routes/sales'
import settingsRouter from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3001

// ES module dirname workaround
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(cors())
app.use(express.json())

// API routes
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/hampers', hampersRouter)
app.use('/api/sales', salesRouter)
app.use('/api/settings', settingsRouter)

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static files in production
app.use(express.static(path.join(__dirname, '../dist')))

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  }
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
