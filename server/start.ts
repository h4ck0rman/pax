import { fileURLToPath } from 'node:url';
import { atlasQuestionStore } from './question-store.js';
import { createProductionServer } from './production.js';

const { APP_PASSWORD, MONGODB_URI, MONGODB_DATABASE = 'pax', APP_USERNAME = 'pax' } = process.env;
if (!APP_PASSWORD || APP_PASSWORD.length < 16 || !MONGODB_URI) {
  console.error('Set APP_PASSWORD (at least 16 characters) and MONGODB_URI before starting Pax.');
  process.exit(1);
}
const store = atlasQuestionStore(MONGODB_URI, MONGODB_DATABASE);
const server = createProductionServer({ password: APP_PASSWORD, username: APP_USERNAME, dist: fileURLToPath(new URL('../dist/', import.meta.url)), store });
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Password-protected Pax listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => { void store.close().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
});
