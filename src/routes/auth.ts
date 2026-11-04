// src/routes/auth.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma'
import { createToken } from '../lib/jwt'

const auth = new Hono()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
})

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json')

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return c.json({ error: 'El correo ya está registrado' }, 400)
  }

  // Bun nos da hashing nativo (Argon2id por defecto)
  const passwordHash = await Bun.password.hash(password)

  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  })

  const token = await createToken({ sub: user.id, role: user.role })

  return c.json({
    message: 'Usuario registrado',
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  }, 201)
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return c.json({ error: 'Credenciales inválidas' }, 401)
  }

  const isValid = await Bun.password.verify(password, user.passwordHash)
  if (!isValid) {
    return c.json({ error: 'Credenciales inválidas' }, 401)
  }

  const token = await createToken({ sub: user.id, role: user.role })

  return c.json({
    message: 'Login exitoso',
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  })
})

export default auth