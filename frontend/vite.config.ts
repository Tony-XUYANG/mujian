import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'mujian-versioned-app-shell',
    async writeBundle(options) {
      const root = resolve(options.dir || 'dist');
      const files = await Promise.all(['asset-manifest.json', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'sw.js'].map(path => readFile(resolve(root, path))));
      const version = createHash('sha256').update(Buffer.concat(files)).digest('hex').slice(0, 20);
      await writeFile(resolve(root, 'sw.js'), files.at(-1)!.toString().replace('__BUILD_ID__', version));
    },
  }],
  build: { manifest: 'asset-manifest.json' },
  server: { proxy: { '/api': 'http://127.0.0.1:8080', '/uploads': 'http://127.0.0.1:8080' } },
});
