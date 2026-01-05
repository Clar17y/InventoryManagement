import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import categoriesRouter from './routes/categories'
import productsRouter from './routes/products'
import inventoryRouter from './routes/inventory'
import hampersRouter from './routes/hampers'
import salesRouter from './routes/sales'
import settingsRouter from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3001

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

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
