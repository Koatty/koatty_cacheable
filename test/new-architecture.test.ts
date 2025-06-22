import { CacheAble, CacheEvict } from '../src/cache';
import { injectCache } from '../src/inject';
import { CacheManager } from '../src/manager';

// Mock cache store for testing
class MockCacheStore {
  private cache = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    console.log(`Cache GET: ${key}`);
    return this.cache.get(key) || null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    console.log(`Cache SET: ${key} = ${value} (TTL: ${ttl})`);
    this.cache.set(key, value);
  }

  async del(key: string): Promise<void> {
    console.log(`Cache DEL: ${key}`);
    this.cache.delete(key);
  }
}

// Test service class
class TestService {
  @CacheAble("test-cache", { timeout: 60 })
  async getData(id: string): Promise<string> {
    console.log(`Executing getData(${id})`);
    return `data-${id}`;
  }

  @CacheEvict("test-cache")
  async updateData(id: string, value: string): Promise<void> {
    console.log(`Executing updateData(${id}, ${value})`);
  }
}

describe('New Architecture Test', () => {
  test('should work with direct decorator wrapping', async () => {
    // Initialize cache manager
    const cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(new MockCacheStore() as any);
    cacheManager.setDefaultConfig(300, true);

    // Create service instance
    const service = new TestService();

    // Test CacheAble
    console.log('\n=== Testing CacheAble ===');
    const result1 = await service.getData('123');
    expect(result1).toBe('data-123');

    const result2 = await service.getData('123'); // Should hit cache
    expect(result2).toBe('data-123');

    // Test CacheEvict
    console.log('\n=== Testing CacheEvict ===');
    await service.updateData('123', 'new-value');

    console.log('\n=== Testing after eviction ===');
    const result3 = await service.getData('123'); // Should miss cache
    expect(result3).toBe('data-123');
  });
}); 