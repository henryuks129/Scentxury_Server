import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    exclude: ['node_modules', 'dist', '.dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '.dist/',
        'src/tests/setup.ts',
        'src/test/setup.ts',
        'src/test/helpers.ts',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        // External service wrappers — require live API access; tested via integration
        'src/utils/logger.ts',
        'src/utils/qrcode.ts',
        'src/utils/currency.ts',
        'src/services/notification.service.ts',
        'src/services/export.service.ts',
        'src/scripts/**',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@models': path.resolve(__dirname, './src/models'),
      '@controllers': path.resolve(__dirname, './src/controllers'),
      '@routes': path.resolve(__dirname, './src/routes'),
      '@middleware': path.resolve(__dirname, './src/middleware'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@config': path.resolve(__dirname, './src/config'),
      '@types': path.resolve(__dirname, './src/types'),
      '@validators': path.resolve(__dirname, './src/validators'),
      '@queues': path.resolve(__dirname, './src/queues'),
    },
  },
});
