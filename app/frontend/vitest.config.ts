import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Behavioral render tests live in *.test.tsx and run under jsdom via vitest.
// The pure-logic *.test.ts files keep using Node's built-in runner
// (`node --test`) — vitest deliberately only picks up *.test.tsx here so the
// two runners never collide.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
  },
})
