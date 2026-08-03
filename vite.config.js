import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs/promises';

const MODELS_DIR = resolve(__dirname, 'public/generated/models');
const ANIMATIONS_DIR = resolve(__dirname, 'public/generated/animations');
const MANIFEST_PATH = resolve(__dirname, 'public/generated/generated-library-manifest.json');

async function ensureDirs() {
  await fs.mkdir(MODELS_DIR, { recursive: true });
  await fs.mkdir(ANIMATIONS_DIR, { recursive: true });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeManifest(manifest) {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function localLibraryPlugin() {
  return {
    name: 'local-library',
    configureServer(server) {
      server.middlewares.use('/api/local-library/save-model', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = await readBody(req);
          const { id, name, description, modelJson } = body;
          if (!id || !modelJson) {
            return sendJson(res, 400, { ok: false, error: 'Missing id or modelJson' });
          }
          await ensureDirs();
          const filePath = resolve(MODELS_DIR, `${id}.json`);
          const modelToWrite = { ...modelJson, name: name || modelJson.name || id };
          await fs.writeFile(filePath, JSON.stringify(modelToWrite, null, 2), 'utf8');

          const manifest = await readManifest();
          const existingIndex = manifest.findIndex((m) => m.assetId === id);
          const entry = {
            assetId: id,
            name: name || modelToWrite.name,
            description: description || '',
            category: 'decor',
            tags: modelToWrite.tags || [],
            hasIdleAnimation: false,
            animations: [],
            path: `generated/models/${id}.json`,
            createdAt: Date.now(),
          };
          if (existingIndex >= 0) {
            manifest[existingIndex] = entry;
          } else {
            manifest.unshift(entry);
          }
          await writeManifest(manifest);

          sendJson(res, 200, { ok: true, id, path: entry.path });
        } catch (err) {
          console.error('[LocalLibrary] save-model error:', err);
          sendJson(res, 500, { ok: false, error: err.message });
        }
      });

      server.middlewares.use('/api/local-library/save-animation', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = await readBody(req);
          const { id, modelId, name, type, plan } = body;
          if (!id || !modelId || !plan) {
            return sendJson(res, 400, { ok: false, error: 'Missing id, modelId or plan' });
          }
          await ensureDirs();
          const filePath = resolve(ANIMATIONS_DIR, `${id}.json`);
          const planToWrite = {
            ...plan,
            _modelId: modelId,
            _name: name || 'generated animation',
            _type: type || 'interaction',
          };
          await fs.writeFile(filePath, JSON.stringify(planToWrite, null, 2), 'utf8');

          const manifest = await readManifest();
          const entry = manifest.find((m) => m.assetId === modelId);
          if (entry) {
            if (!Array.isArray(entry.animations)) {
              // Migrate legacy single-animation entries
              entry.animations = [];
              if (entry.animId && entry.animPath) {
                entry.animations.unshift({
                  animId: entry.animId,
                  name: entry.animName || '生成动画',
                  type: entry.animType || 'idle',
                  path: entry.animPath,
                });
              }
            }
            entry.animations = entry.animations.filter((a) => a.animId !== id);
            entry.animations.unshift({
              animId: id,
              name: name || '生成动画',
              type: type || 'interaction',
              path: `generated/animations/${id}.json`,
            });
            entry.hasIdleAnimation = entry.animations.some((a) => a.type === 'idle');
            await writeManifest(manifest);
          }

          sendJson(res, 200, { ok: true, id, path: `generated/animations/${id}.json` });
        } catch (err) {
          console.error('[LocalLibrary] save-animation error:', err);
          sendJson(res, 500, { ok: false, error: err.message });
        }
      });

      server.middlewares.use('/api/local-library/list', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          await ensureDirs();
          const manifest = await readManifest();
          sendJson(res, 200, manifest);
        } catch (err) {
          console.error('[LocalLibrary] list error:', err);
          sendJson(res, 500, { ok: false, error: err.message });
        }
      });
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    rollupOptions: {
      external: [/^\/api\/voxel\/.*/],
      input: {
        main: resolve(__dirname, 'index.html'),
        'chii-island': resolve(__dirname, 'src/demos/chii-island/index.html'),
        'chii-player-candidates': resolve(__dirname, 'src/demos/chii-island/player-candidates.html'),
        'agentland-friends': resolve(__dirname, 'src/demos/agentland-friends/index.html'),
        'ghost-home': resolve(__dirname, 'src/demos/ghost-home/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api/voxel': {
        target: 'https://voxel-studio-backend.zeabur.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/voxel/, ''),
        secure: true,
      },
      '/studio': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/studio/, ''),
      },
    },
  },
  plugins: [localLibraryPlugin()],
});
