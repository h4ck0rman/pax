import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { atlasQuestionStore } from './server/question-store';

function localQuestions(env: Record<string, string>): Plugin {
  const useAtlas = env.QUESTION_STORE === 'mongodb';
  const atlas = useAtlas && env.MONGODB_URI ? atlasQuestionStore(env.MONGODB_URI, env.MONGODB_DATABASE || 'pax') : null;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/questions') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'GET only' })); return; }
    const params = { search: (url.searchParams.get('search') || '').slice(0, 200), offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 1), random: url.searchParams.get('random') === 'true' };
    if (![params.offset, params.limit].every(Number.isInteger)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid pagination' })); return; }
    if (useAtlas) {
      if (!atlas) { res.statusCode = 503; res.end(JSON.stringify({ error: 'MongoDB connection is not configured.' })); return; }
      atlas.query(params).then(data => res.end(JSON.stringify(data))).catch(() => {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'The question database is unavailable. Check the server connection and Atlas Network Access.' }));
      });
      return;
    }
    execFile('python', [fileURLToPath(new URL('./scripts/query_questions.py', import.meta.url)), JSON.stringify(params)], { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) { res.statusCode = 503; res.end(JSON.stringify({ error: 'The local question database is unavailable. Check Python and data/extraction/questions.sqlite.' })); return; }
      res.end(stdout);
    });
  };
  return { name: 'pax-questions', configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', () => { void atlas?.close(); }); }, configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer?.once('close', () => { void atlas?.close(); }); } };
}
export default defineConfig(({ mode }) => ({ plugins: [react(), localQuestions({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)] }));
