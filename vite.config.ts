import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * `npm run dev` also serves the /api routes (normally Vercel functions) with in-memory storage,
 * so sync can be tried locally. Data resets when the dev server restarts.
 */
function localApi(): Plugin {
  return {
    name: 'wingman-local-api',
    apply: (_config, env) => env.command === 'serve' && !process.env.VITEST,
    configureServer(server) {
      process.env.WINGMAN_DEV_MEMORY = '1';
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z]+)(\?.*)?$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' ? undefined : body });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

// Every build gets an id; the app compares it with /version.json to spot a newer version.
const BUILD_ID = Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: 'wingman-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  test: { environment: 'node' },
});
