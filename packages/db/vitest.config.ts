import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/german_smart_apply?schema=public';

export default defineConfig({
  test: {
    testTimeout: 15000,
  },
});
