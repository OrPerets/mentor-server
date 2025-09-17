module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Handle async operations better
  detectOpenHandles: true,
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts
  // Ensure proper cleanup
  globalTeardown: undefined,
  globalSetup: undefined
};
