// src/routes/tickets.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma'
import { requireAuth } from '../middleware/auth'
import { isValidTransition } from '../lib/ticket-state' // Importación movida al tope
import type { User } from '../../generated/prisma/client'

// 1. Definimos el entorno para que TypeScript sepa que 'user' existe aquí
type TicketEnv = {
  Variables: {
    user: User
  }
}

// 2. Creamos el router de tickets
const tickets = new Hono<TicketEnv>()

// 3. Protegemos TODAS las rutas de este archivo de una sola vez
tickets.use('*', requireAuth)

// ============================================================================
// GET /api/tickets - Listar tickets
// ============================================================================
tickets.get('/', async (c) => {
  const user = c.get('user')

  // Filtro por rol: si es cliente, solo ve sus tickets. Agente/Admin ven todos.
  const whereClause = user.role === 'CUSTOMER' ? { customerId: user.id } : {}

  // Buscamos en la base de datos (ignorando los tickets con soft delete)
  const ticketsList = await prisma.ticket.findMany({
    where: { 
      ...whereClause, 
      deletedAt: null 
    },
    include: { 
      customer: { select: { name: true, email: true } },
      assignee: { select: { name: true, email: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  return c.json(ticketsList)
})

// ============================================================================
// POST /api/tickets - Crear un ticket
// ============================================================================
const createTicketSchema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres'),
  description: z.string().min(10, 'La descripción debe tener al menos 10 caracteres'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

tickets.post('/', zValidator('json', createTicketSchema), async (c) => {
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
})

// ============================================================================
// POST /api/tickets/:id/transition - Cambiar estado de un ticket
// ============================================================================
const transitionSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED']),
})

tickets.post('/:id/transition', zValidator('json', transitionSchema), async (c) => {
  const user = c.get('user')
  const ticketId = c.req.param('id')
  const { status: newStatus } = c.req.valid('json')

  // 1. Validar permisos: Solo agentes y admins pueden cambiar estados
  if (user.role === 'CUSTOMER') {
    return c.json({ error: 'Solo los agentes pueden cambiar el estado de un ticket' }, 403)
  }

  // 2. Buscar el ticket en la base de datos
  const ticket = await prisma.ticket.findUnique({ 
    where: { id: ticketId } 
  })
  
  if (!ticket || ticket.deletedAt) {
    return c.json({ error: 'Ticket no encontrado' }, 404)
  }

  // 3. Regla especial PRIMERO: Si está CLOSED, solo ADMIN puede reabrirlo (a OPEN)
  if (ticket.status === 'CLOSED') {
    if (user.role !== 'ADMIN') {
      return c.json({ error: 'Solo un administrador puede reabrir un ticket cerrado' }, 403)
    }
    if (newStatus !== 'OPEN') {
      return c.json({ error: 'Un ticket cerrado solo puede reabrirse a OPEN por un administrador' }, 400)
    }
  } else {
    // 4. Si no está cerrado, validamos con la máquina de estados normal
    if (!isValidTransition(ticket.status as any, newStatus as any)) {
      return c.json({ 
        error: `Transición no permitida: no se puede pasar de ${ticket.status} a ${newStatus}` 
      }, 400)
    }
  }

  // 5. ¡Magia de Prisma! Usamos una transacción.
  // Si algo falla dentro de esta función, TODOS los cambios se revierten (rollback).
  const updatedTicket = await prisma.$transaction(async (tx) => {
    // a) Actualizamos el ticket
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { 
        status: newStatus,
        // Si el nuevo estado es CLOSED, guardamos la fecha de cierre. Si no, la dejamos en null.
        closedAt: newStatus === 'CLOSED' ? new Date() : null 
      }
    })

    // b) Creamos el registro de auditoría
    await tx.auditLog.create({
      data: {
        ticketId: ticketId,
        actorId: user.id,
        action: 'STATUS_CHANGED',
        // Guardamos de dónde a dónde cambió, en formato JSON
        metadata: JSON.stringify({ from: ticket.status, to: newStatus })
      }
    })

    return updated // Devolvemos el ticket actualizado
  })

  return c.json({ 
    message: 'Estado actualizado correctamente', 
    ticket: updatedTicket 
  })
})

export default tickets