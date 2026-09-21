// Upload only the settings Pax needs, without printing secret values.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

process.loadEnvFile(resolve('.env'));

// PUBLIC_ORIGIN in .env is the local development origin. A deployment needs its
// own, so it is given as an argument and never taken from the local file.
const deployedOrigin = (process.argv[2] ?? '').replace(/\/$/, '');
if (deployedOrigin) process.env.PUBLIC_ORIGIN = deployedOrigin;

if (!/^https:\/\//.test(process.env.PUBLIC_ORIGIN ?? '')) {
  console.error('Pass the deployment origin, for example:');
  console.error('  node scripts/configure_vercel.mjs https://pax-eosin.vercel.app');
  console.error(`Refusing to upload PUBLIC_ORIGIN=${process.env.PUBLIC_ORIGIN ?? '(unset)'}`);
  process.exit(1);
}

/** Secret values are marked sensitive so Vercel will not display them again. */
const SETTINGS = [
  { key: 'MONGODB_URI', secret: true, required: true },
  { key: 'MONGODB_DATABASE', secret: false, required: true },
  { key: 'SESSION_SECRET', secret: true, required: true },
  { key: 'GOOGLE_CLIENT_ID', secret: false, required: true },
  { key: 'GOOGLE_CLIENT_SECRET', secret: true, required: true },
  { key: 'ALLOWED_EMAILS', secret: false, required: false },
  { key: 'ALLOWED_DOMAIN', secret: false, required: false },
  { key: 'PUBLIC_ORIGIN', secret: false, required: true },
];

// Deliberately never uploaded: the development sign-in shim must not exist in a
// deployment, and the question store selector is server-local.
const NEVER_UPLOAD = ['DEV_AUTH_EMAIL', 'QUESTION_STORE'];

const missing = SETTINGS.filter(setting => setting.required && !process.env[setting.key]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.map(setting => setting.key).join(', ')}`);
  process.exit(1);
}

if (!process.env.ALLOWED_EMAILS && !process.env.ALLOWED_DOMAIN) {
  console.error('Set ALLOWED_EMAILS or ALLOWED_DOMAIN, or nobody will be able to sign in.');
  process.exit(1);
}

for (const key of NEVER_UPLOAD) {
  if (process.env[key]) console.log(`Skipping ${key}: it must not be set on a deployment.`);
}

for (const { key, secret } of SETTINGS) {
  const value = process.env[key];
  if (!value) continue;

  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/vercel/dist/index.js'),
      'env',
      'add',
      key,
      'production,preview',
      secret ? '--sensitive' : '--no-sensitive',
      '--yes',
      '--force',
    ],
    { input: value, encoding: 'utf8', timeout: 60000 },
  );

  if (result.status !== 0) {
    console.error(`Could not configure ${key}. Check Vercel login and project linkage.`);
    process.exit(1);
  }
  console.log(`Configured ${key} for production and preview.`);
}

console.log('\nRemember to register the redirect URI in Google Cloud:');
console.log(`  ${(process.env.PUBLIC_ORIGIN || 'https://YOUR-DOMAIN').replace(/\/$/, '')}/api/auth/google/callback`);
