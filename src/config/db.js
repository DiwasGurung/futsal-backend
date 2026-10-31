const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const databaseUrl = new URL(env.databaseUrl);
if (databaseUrl.hostname.includes('-pooler')) {
  if (!databaseUrl.searchParams.has('pgbouncer')) databaseUrl.searchParams.set('pgbouncer', 'true');
  if (!databaseUrl.searchParams.has('connection_limit')) databaseUrl.searchParams.set('connection_limit', '10');
  if (!databaseUrl.searchParams.has('connect_timeout')) databaseUrl.searchParams.set('connect_timeout', '15');
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl.toString() } },
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

const tx = (fn) =>
  prisma.$transaction((transaction) => fn(transaction), {
    maxWait: 15_000,
    timeout: 60_000,
  });

async function connectDB() {
  try {
    const rows = await prisma.$queryRaw`SELECT current_database() AS db`;
    console.log(`PostgreSQL connected: ${rows[0].db}`);
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { prisma, tx, connectDB };
