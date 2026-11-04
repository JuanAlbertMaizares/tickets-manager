// src/lib/ticket-state.ts
import type { TicketStatus } from '../../generated/prisma/client'

// 1. Definimos el mapa de transiciones válidas.
// Es un objeto donde la clave es el estado actual y el valor es un array de estados permitidos.
export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_CUSTOMER', 'RESOLVED', 'CANCELLED'],
  PENDING_CUSTOMER: ['IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'], // Si el cliente responde, se puede reabrir (OPEN)
  CLOSED: [], // Un ticket cerrado ya no se mueve (el Admin tiene su propia ruta para forzar)
  CANCELLED: [],
}

// 2. Función auxiliar para validar si un cambio es legal
export function isValidTransition(current: TicketStatus, next: TicketStatus): boolean {
  // Buscamos los estados permitidos para el estado actual.
  // Si el estado actual no existe en el mapa (por seguridad), devolvemos un array vacío.
  const allowedNextStates = VALID_TRANSITIONS[current] || []
  
  // Verificamos si el nuevo estado está en la lista de permitidos
  return allowedNextStates.includes(next)
}