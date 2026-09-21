import { fileURLToPath } from 'node:url';
import { atlasQuestionStore } from './question-store.js';
import { createProductionServer } from './production.js';
import { resolveAuthDeps } from './auth/routes.js';
import { AuthConfigError } from './auth/config.js';
import { closeAll } from './mongo.js';

const auth = resolveAuthDeps();
if (auth instanceof AuthConfigError) {
  console.error(`Pax cannot start: ${auth.message}.`);
  console.error(
    'Required: MONGODB_URI, SESSION_SECRET (32+ characters), GOOGLE_CLIENT_ID, ' +
      'GOOGLE_CLIENT_SECRET, and ALLOWED_EMAILS or ALLOWED_DOMAIN.',
  );
  process.exit(1);
}

const store = atlasQuestionStore(auth.config.mongoUri, auth.config.mongoDatabase);
const server = createProductionServer({
  dist: fileURLToPath(new URL('../dist/', import.meta.url)),
  store,
  auth,
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Pax listening on port ${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      void closeAll().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
