import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

type Options = {
  idleMs: number
}

const DEFAULT_IDLE_MS = 5 * 60 * 1000

function getIdleMsFromEnv(): number | undefined {
  const envValue = process.env.PRISMA_IDLE_DISCONNECT_MS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return undefined
}

export function createPrismaIdleDisconnectMiddleware(
  options: Partial<Options> = {}
) {
  const idleMs = getIdleMsFromEnv() ?? options.idleMs ?? DEFAULT_IDLE_MS

  let activeRequests = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let disconnecting: Promise<void> | null = null

  const clearIdleTimer = () => {
    if (!idleTimer) return
    clearTimeout(idleTimer)
    idleTimer = null
  }

  const scheduleIdleDisconnect = () => {
    clearIdleTimer()

    idleTimer = setTimeout(() => {
      if (activeRequests > 0 || disconnecting) return

      disconnecting = prisma
        .$disconnect()
        .catch((error) => {
          console.warn('Prisma idle disconnect failed:', error)
        })
        .finally(() => {
          disconnecting = null
        })
    }, idleMs)

    idleTimer.unref?.()
  }

  return function prismaIdleDisconnectMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Health check must stay ultra-light and should never touch the DB.
    if (req.path === '/health') {
      return next()
    }

    clearIdleTimer()
    activeRequests += 1

    let finished = false
    const markFinished = () => {
      if (finished) return
      finished = true

      activeRequests = Math.max(0, activeRequests - 1)
      if (activeRequests === 0) {
        scheduleIdleDisconnect()
      }
    }

    res.on('finish', markFinished)
    res.on('close', markFinished)

    if (!disconnecting) {
      return next()
    }

    return disconnecting
      .then(() => next())
      .catch(() => next())
  }
}

