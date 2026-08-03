import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { localLibraryPlugin } from './vite/localLibraryPlugin.js';

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
    },
  },
  plugins: [localLibraryPlugin({ rootDir: __dirname })],
});
