// src/middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../lib/jwt'
import { prisma } from '../db/prisma'
import type { User } from '../../generated/prisma/client'

// 1. Definimos el entorno que espera este middleware
type AuthEnv = {
  Variables: {
    user: User
  }
}

// 2. Creamos el middleware usando createMiddleware para tener tipado perfecto
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  // 3. Buscamos el header de autorización
  const authHeader = c.req.header('Authorization')
  
  // 4. Verificamos que exista y tenga el formato correcto ("Bearer <token>")
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No autorizado. Falta el token Bearer.' }, 401)
  }

  // 5. Extraemos el token (quitando la palabra "Bearer ")
  const token = authHeader.split(' ')[1]!

  try {
    // 6. Verificamos el token usando nuestra utilidad de JWT
    const payload = await verifyToken(token)
    
    // 7. Buscamos al usuario en la base de datos para asegurarnos de que aún existe
    const user = await prisma.user.findUnique({ 
      where: { id: payload.sub as string } 
    })
    
    if (!user) {
      return c.json({ error: 'Usuario no encontrado.' }, 401)
    }

    // 8. Inyectamos el usuario en el contexto (c.get('user') estará disponible después)
    c.set('user', user)
    
    // 9. Damos paso a la siguiente función (la ruta final)
    await next()
    
  } catch (error) {
    // Si verifyToken falla (token expirado o inválido), caemos aquí
    return c.json({ error: 'Token inválido o expirado.' }, 401)
  }
})