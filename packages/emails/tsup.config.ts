import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  bundle: true,
  noExternal: [
    'react',
    'react-dom',
    '@react-email/render',
    '@react-email/components',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
