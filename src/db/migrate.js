const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('dotenv').config();

const action = process.argv[2] || 'deploy';
if (!['deploy', 'dev'].includes(action)) {
  console.error(`Unsupported migration action: ${action}`);
  process.exit(1);
}

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
if (!directUrl) {
  console.error("Missing direct database URL: set DIRECT_URL or DATABASE_URL_UNPOOLED to Neon's unpooled connection string.");
  process.exit(1);
}

const prismaCli = require.resolve('prisma');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', action], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, DATABASE_URL: directUrl },
});

if (result.error) {
  console.error('Migration failed:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
