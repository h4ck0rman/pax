// Upload only the four required server settings, without printing secret values.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
process.loadEnvFile(resolve('.env'));
for (const key of ['MONGODB_URI', 'MONGODB_DATABASE', 'APP_USERNAME', 'APP_PASSWORD']) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key} in local environment`);
  const secret = key === 'MONGODB_URI' || key === 'APP_PASSWORD';
  const result = spawnSync(process.execPath, [resolve('node_modules/vercel/dist/index.js'), 'env', 'add', key, 'production,preview', secret ? '--sensitive' : '--no-sensitive', '--yes', '--force'], { input: value, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) { console.error(`Could not configure ${key}. Check Vercel login and project linkage.`); process.exit(1); }
  console.log(`Configured ${key} for production and preview.`);
}
