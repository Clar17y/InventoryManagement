import type { NextFunction, Request, Response } from 'express'
import { supabase } from '../lib/supabase'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const devBypassAuth =
    process.env.VITE_DEV_BYPASS_AUTH === 'true' || process.env.DEV_BYPASS_AUTH === 'true'
  const isProduction = process.env.NODE_ENV === 'production'

  if (devBypassAuth && !isProduction) {
    return next()
  }

  if (req.method === 'OPTIONS') {
    return next()
  }

  // Etsy redirects back without our Supabase session, so this callback must be public.
  if (req.method === 'GET' && req.path === '/etsy/callback') {
    return next()
  }

  const authorization = req.headers.authorization
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return next()
}
