// src/lib/jwt.ts
import { sign, verify } from 'hono/jwt'

const SECRET = process.env.JWT_SECRET || 'super-secret-dev-key'

export async function createToken(payload: { sub: string; role: string }) {
  return await sign({ 
    ...payload, 
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // Expira en 24 horas
  }, SECRET)
}

export async function verifyToken(token: string) {
  return await verify(token, SECRET, 'HS256')
}