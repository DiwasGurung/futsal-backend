const env = require('./config/env');
const { prisma, connectDB } = require('./config/db');
const app = require('./app');

(async () => {
  await connectDB();
  // 0.0.0.0 so emulators / phones on the LAN can reach the API
  const server = app.listen(env.port, '0.0.0.0', () =>
    console.log(`Futsal API running on port ${env.port} (${env.nodeEnv})`)
  );

  const shutdown = () =>
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
