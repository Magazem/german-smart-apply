import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/german_smart_apply?schema=public';
process.env.JWT_SECRET ??= 'test-only-jwt-secret';
// fileURLToPath (not `.pathname`) — `.pathname` leaves a leading "/" before
// the drive letter on Windows (e.g. "/C:/Users/..."), which path.join then
// mangles into an invalid "C:\C:\Users\..." path.
process.env.CV_UPLOAD_DIR ??= fileURLToPath(new URL('./test/.uploads', import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.e2e-spec.ts', 'src/**/*.test.ts'],
    // E2E specs share one Postgres connection pool and mutate the same
    // tables; running files in parallel workers causes cross-test
    // interference (each spec cleans "its" rows in before/after hooks).
    fileParallelism: false,
  },
  plugins: [
    // NestJS's DI relies on TS "emitDecoratorMetadata" (design:paramtypes),
    // which esbuild (Vitest's default TS transform) does not emit. Compile
    // test-run TS through SWC instead, per NestJS's own Vitest recipe.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
