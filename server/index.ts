import 'dotenv/config'
import { createApp } from './app'
import { prisma } from './lib/prisma'

const PORT = process.env.PORT || 3001

const app = createApp()

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})

// Graceful shutdown - disconnect Prisma so Neon can autosuspend
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`)
  server.close(() => {
    console.log('HTTP server closed')
  })
  await prisma.$disconnect()
  console.log('Prisma disconnected')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
