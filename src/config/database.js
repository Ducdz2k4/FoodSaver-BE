import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['warn', 'error']
});

export const connectDatabase = async () => {
  try {
    if (!env.databaseUrl) {
      console.warn('[Database] DATABASE_URL is not configured.');
      return false;
    }

    await prisma.$connect();
    const sanitizedUrl = env.databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database] MySQL connected successfully via Prisma ORM (${sanitizedUrl})`);
    return true;
  } catch (error) {
    console.warn('[Database] Could not connect to MySQL:', error.message);
    console.warn('[Database] Tip: Run "npm run docker:up" to start the MySQL container.');
    return false;
  }
};

export const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    console.log('[Database] Disconnected from MySQL.');
  } catch (error) {
    console.error('[Database] Error disconnecting:', error.message);
  }
};
