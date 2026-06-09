import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxy all Voxel Studio API requests to avoid CORS issues.
      '/api/voxel': {
        target: 'https://voxel-studio-backend.zeabur.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/voxel/, ''),
        secure: true,
      },
      // Proxy 3d-generate backend editor through port 5173
      '/studio': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/studio/, ''),
      },
    },
  },
});
