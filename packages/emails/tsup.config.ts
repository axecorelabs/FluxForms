import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  bundle: true,
  external: [],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
