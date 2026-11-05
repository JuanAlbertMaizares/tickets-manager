// src/routes/tickets.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma'
import { requireAuth } from '../middleware/auth'
import type { User } from '../../generated/prisma/client'

// 1. Definimos el entorno para que TypeScript sepa que 'user' existe aquí
type TicketEnv = {
  Variables: {
    user: User
  }
}

// 2. Creamos el router de tickets
const tickets = new Hono<TicketEnv>()

// 3. ¡Magia de Hono! Protegemos TODAS las rutas de este archivo de una sola vez
tickets.use('*', requireAuth)

// 4. GET /api/tickets - Listar tickets
tickets.get('/', async (c) => {
  // Como usamos requireAuth, sabemos al 100% que 'user' está aquí
  const user = c.get('user')

  // Filtro por rol: si es cliente(customer), solo ve sus tickets. Agente/Admin ven todos.
  const whereClause = user.role === 'CUSTOMER' ? { customerId: user.id } : {}

  // Buscamos en la base de datos (ignorando los tickets con soft delete)
  const ticketsList = await prisma.ticket.findMany({
    where: { 
      ...whereClause, 
      deletedAt: null 
    },
    include: { 
      customer: { select: { name: true, email: true } } 
    },
    orderBy: { createdAt: 'desc' }
  })

  return c.json(ticketsList)
})

// 5. POST /api/tickets - Crear un ticket
const createTicketSchema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres'),
  description: z.string().min(10, 'La descripción debe tener al menos 10 caracteres'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

tickets.post(
    '/', 
    zValidator('json', createTicketSchema), 
    async (c) => {
        const user = c.get('user')
        const data = c.req.valid('json')

        // Creamos el ticket en la base de datos
        const ticket = await prisma.ticket.create({
            data: {
            title: data.title,
            description: data.description,
            priority: data.priority,
            customerId: user.id, // El creador siempre es el dueño (cliente)
            }
        })

        // Registramos la acción en el historial (AuditLog)
        await prisma.auditLog.create({
            data: {
            ticketId: ticket.id,
            actorId: user.id,
            action: 'TICKET_CREATED'
            }
        })

        return c.json(ticket, 201)
    }
)

export default tickets