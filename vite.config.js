import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxy all Voxel Studio API requests to avoid CORS issues.
      // Frontend calls /api/voxel/... → Vite forwards to voxel-studio-backend.zeabur.app/...
      '/api/voxel': {
        target: 'https://voxel-studio-backend.zeabur.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/voxel/, ''),
        secure: true,
      },
    },
  },
});
