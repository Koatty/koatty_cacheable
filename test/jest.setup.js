// Jest setup file
// Set environment to test
process.env.NODE_ENV = 'test';

// Mock console.log to reduce noise in tests
// global.console = {
//   ...console,
//   log: jest.fn(),
// };

// Setup global test environment
require('reflect-metadata');

// Global cleanup to prevent Jest from hanging
afterAll(async () => {
  // Clear any open handles
  try {
    const { CacheManager } = require('../src/manager');
    const cacheManager = CacheManager.getInstance();
    const store = cacheManager.getCacheStore();
    if (store && typeof store.close === 'function') {
      await store.close();
    }
    cacheManager.setCacheStore(null);
  } catch (error) {
    // Ignore cleanup errors
  }
}); 