// src/app.ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

// Definimos el tipo de variables que pasaremos por el contexto (luego añadiremos el usuario)
type Env = {
  Variables: {
    requestId: string
  }
}

export function createApp() {
  const app = new Hono<Env>()

  // Middlewares globales
  app.use('*', logger())
  app.use('*', cors()) // Permite peticiones desde otros dominios (útil para frontends)

  // Middleware para inyectar un ID único a cada petición
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID())
    await next()
  })

  // Ruta de prueba (Health Check)
  app.get('/health', (c) => {
    return c.json({ 
      status: 'ok', 
      message: 'API de Tickets funcionando',
      requestId: c.get('requestId') 
    })
  })

  // Manejo de errores centralizado (evita que el servidor se caiga y muestra JSON)
  app.onError((err, c) => {
    console.error(`[Error] ${err.message}`)
    return c.json({
      error: 'Internal Server Error',
      message: err.message,
      requestId: c.get('requestId')
    }, 500)
  })

  // Manejo de rutas no encontradas (404)
  app.notFound((c) => {
    return c.json({ error: 'Not Found', message: 'La ruta no existe' }, 404)
  })

  return app
}