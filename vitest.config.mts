
import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      module: {
        type: 'es6',
      },
      jsc: {
        target: 'es2022',
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],

  resolve: {
    alias: {
      '@src': resolve(process.cwd(), 'src'),
      '@test': resolve(process.cwd(), 'test'),
    },
  },

  test: {
    globals: true,
    environment: 'node',

    // Discover Unit, Integration, and E2E tests.
    include: [
      'src/**/*.spec.ts',
      'test/**/*.spec.ts',
      'test/**/*.e2e-spec.ts',
      'test/**/*.integration-spec.ts',
    ],

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],

    testTimeout: 10000,
    hookTimeout: 15000,

    coverage: {
      provider: 'v8',

      reporter: [
        'text',
        'html',
        'lcov',
      ],

      include: [
        'src/**/*.ts',
      ],

      exclude: [
        // Application bootstrap is outside the current test scope.
        'src/main.ts',

        // NestJS module declarations.
        'src/**/*.module.ts',

        // Test files.
        'src/**/*.spec.ts',

        // TypeScript-only type declarations.
        'src/**/*.types.ts',
      ],

      // Fail CI if coverage drops below 100%.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
