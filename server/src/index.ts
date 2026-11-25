import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import fs from 'node:fs';

fs.mkdirSync(config.storageDir, { recursive: true });

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Mission server listening on http://localhost:${config.port} (${config.env})`);
  if (!config.setupToken) console.warn('[warn] SETUP_TOKEN is not set; the first-run setup page is open to anyone who can reach it.');
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
