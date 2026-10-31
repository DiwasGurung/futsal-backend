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

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelRow = (row) => {
  const out = {};
  for (const k of Object.keys(row)) {
    const value = row[k];
    out[camel(k)] =
      typeof value === 'bigint'
        ? value.toString()
        : k === 'date_of_birth' && value instanceof Date
          ? value.toISOString().slice(0, 10)
          : value;
  }
  return out;
};

// Keep the existing SQL runner contract while using Prisma's Neon-compatible client.
const wrap = (runner) => ({
  async query(text, params = []) {
    const returnsRows =
      /^\s*(SELECT|WITH|VALUES|SHOW|EXPLAIN)\b/i.test(text) || /\bRETURNING\b/i.test(text);
    if (!returnsRows) {
      const rowCount = await runner.$executeRawUnsafe(text, ...params);
      return { rows: [], rowCount };
    }

    const rows = await runner.$queryRawUnsafe(text, ...params);
    return { rows: rows.map(camelRow), rowCount: rows.length };
  },
});

const db = wrap(prisma);

const tx = (fn) =>
  prisma.$transaction((transaction) => fn(wrap(transaction)), {
    maxWait: 15_000,
    timeout: 60_000,
  });

async function connectDB() {
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    console.log(`PostgreSQL connected: ${rows[0].db}`);
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { prisma, db, tx, connectDB };
