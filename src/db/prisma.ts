// Punto de entrada para instanciar el cliente de PRISMA
// EXPORTA UN CLIENTE/USUARIO DE PRISMA

import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '../../generated/prisma/client' 

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
})

export const prisma = new PrismaClient({ adapter })