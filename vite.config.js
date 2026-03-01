import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    glsl({
      include: ['**/*.vert', '**/*.frag', '**/*.glsl'],
      warnDuplicatedImports: true,
      defaultExtension: 'glsl',
      compress: false,
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
