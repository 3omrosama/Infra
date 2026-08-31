import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

export async function runPrismaMigrations(): Promise<boolean> {
  try {
    console.log('[DB] Running Prisma migrations (prisma migrate deploy)...');
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
    if (stdout) console.log(`[DB] Migration output: ${stdout.trim()}`);
    if (stderr && !stderr.includes('Environment variables loaded')) {
      console.warn(`[DB] Migration notice: ${stderr.trim()}`);
    }
    return true;
  } catch (err: any) {
    console.warn(`[DB] Notice on auto-migration execution: ${err?.message || err}`);
    return false;
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    return false;
  }
}
