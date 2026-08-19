import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

function isSerializationFailure(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}

export async function serializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === 2) throw error
    }
  }
  throw new Error('Unreachable transaction retry')
}
