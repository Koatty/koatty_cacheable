/**
 * Architecture test for the new direct decorator wrapping approach
 * Tests the complete flow without IOC complexity
 */
import { CacheAble, CacheEvict } from '../src/cache';  
import { CacheManager } from '../src/manager';
import { KoattyCache } from '../src/index';
import { Component } from 'koatty_container';

// Mock cache store for testing
class MockCacheStore {
  private storage = new Map<string, any>();
  private operations: string[] = [];

  async get(key: string): Promise<any> {
    this.operations.push(`GET:${key}`);
    return this.storage.get(key) || null;
  }

  async set(key: string, value: any, timeout?: number): Promise<void> {
    this.operations.push(`SET:${key}:${timeout}`);
    this.storage.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.operations.push(`DEL:${key}`);
    this.storage.delete(key);
  }

  async close(): Promise<void> {
    this.storage.clear();
  }

  getOperations(): string[] {
    return [...this.operations];
  }

  clear(): void {
    this.storage.clear();
    this.operations.length = 0;
  }
}

// Test services
@Component("UserService", "COMPONENT")
class UserService {
  @CacheAble("user:profile", {
    params: ["userId"],
    timeout: 300
  })
  async getUserProfile(userId: string): Promise<any> {
    console.log(`[DB] Fetching user profile for: ${userId}`);
    return {
      userId,
      name: `User${userId}`,
      email: `user${userId}@example.com`,
      createdAt: new Date().toISOString()
    };
  }

  @CacheEvict("user:profile", {
    params: ["userId"],
    delayedDoubleDeletion: true
  })
  async updateUserProfile(userId: string, data: any): Promise<any> {
    console.log(`[DB] Updating user profile for: ${userId}`);
    return {
      userId,
      ...data,
      updatedAt: new Date().toISOString()
    };
  }
}

@Component("ProductService", "COMPONENT") 
class ProductService {
  @CacheAble("product:details", {
    params: ["productId", "category"],
    timeout: 600
  })
  async getProductDetails(productId: string, category: string): Promise<any> {
    console.log(`[DB] Fetching product: ${productId} in category: ${category}`);
    return {
      productId,
      category,
      name: `Product ${productId}`,
      price: 99.99,
      inStock: true
    };
  }

  @CacheEvict("product:details", {
    params: ["productId"],
    delayedDoubleDeletion: false
  })
  async updateProduct(productId: string, updates: any): Promise<any> {
    console.log(`[DB] Updating product: ${productId}`);
    return { productId, ...updates };
  }
}

describe('New Architecture Tests', () => {
  let mockStore: MockCacheStore;
  let cacheManager: CacheManager;
  let userService: UserService;
  let productService: ProductService;

  beforeEach(() => {
    // Initialize mock store and cache manager
    mockStore = new MockCacheStore();
    cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(mockStore as any);
    cacheManager.setDefaultConfig(300, true);

    // Create service instances
    userService = new UserService();
    productService = new ProductService();

    // Mock GetCacheStore
    jest.doMock('../src/store', () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(() => {
    mockStore.clear();
    cacheManager.setCacheStore(null);
    jest.clearAllMocks();
  });

  describe('Direct Decorator Wrapping', () => {
    test('should wrap methods at class definition time', async () => {
      // The decorators should have already wrapped the methods
      // We can test this by calling the methods and seeing cache behavior
      
      const result1 = await userService.getUserProfile('123');
      const result2 = await userService.getUserProfile('123');

      // Should get cached result
      expect(result1.createdAt).toBe(result2.createdAt);

      const operations = mockStore.getOperations();
      expect(operations.filter(op => op.startsWith('GET:')).length).toBe(2);
      expect(operations.filter(op => op.startsWith('SET:')).length).toBe(1);
    });

    test('should handle cache eviction immediately', async () => {
      // Cache some data first
      await userService.getUserProfile('456');
      mockStore.getOperations().length = 0; // Clear operation log

      // Update should evict cache
      await userService.updateUserProfile('456', { name: 'Updated User' });

      const operations = mockStore.getOperations();
      expect(operations.filter(op => op.startsWith('DEL:')).length).toBeGreaterThanOrEqual(1);
    });

    test('should work with multiple parameters', async () => {
      await productService.getProductDetails('prod-1', 'electronics');
      
      const operations = mockStore.getOperations();
      const getOp = operations.find(op => op.startsWith('GET:'));
      
      expect(getOp).toContain('product:details');
      // Should include both parameters in cache key
    });

    test('should handle different timeout configurations', async () => {
      // User service uses 300s timeout
      await userService.getUserProfile('timeout-test');
      
      // Product service uses 600s timeout
      await productService.getProductDetails('timeout-test', 'books');

      const operations = mockStore.getOperations();
      const setOps = operations.filter(op => op.startsWith('SET:'));
      
      // Should have different timeouts
      expect(setOps.some(op => op.includes(':300'))).toBe(true);
      expect(setOps.some(op => op.includes(':600'))).toBe(true);
    });
  });

  describe('Runtime Cache Store Access', () => {
    test('should dynamically get cache store at runtime', async () => {
      // Change cache store after service creation
      const newStore = new MockCacheStore();
      cacheManager.setCacheStore(newStore as any);

      await userService.getUserProfile('runtime-test');

      // Should use the new store
      expect(newStore.getOperations().length).toBeGreaterThan(0);
      expect(mockStore.getOperations().length).toBe(0);
    });

    test('should handle missing cache store gracefully', async () => {
      // Remove cache store
      cacheManager.setCacheStore(null);

      // Should still work without caching
      const result = await userService.getUserProfile('no-cache-test');
      expect(result.userId).toBe('no-cache-test');

      // No operations should be recorded
      expect(mockStore.getOperations().length).toBe(0);
    });
  });

  describe('Configuration Priority', () => {
    test('should use decorator timeout over global default', async () => {
      // Set global default to different value
      cacheManager.setDefaultConfig(100, true);

      // UserService decorator specifies 300s
      await userService.getUserProfile('priority-test');

      const operations = mockStore.getOperations();
      const setOp = operations.find(op => op.startsWith('SET:'));
      
      // Should use decorator timeout (300), not global (100)
      expect(setOp).toContain(':300');
    });

    test('should use global default when decorator doesn\'t specify timeout', async () => {
      // Create a service without explicit timeout
      @Component("DefaultTimeoutService", "COMPONENT")
      class DefaultTimeoutService {
        @CacheAble("default:test", { params: ["id"] })
        async getData(id: string): Promise<any> {
          return { id, data: 'test' };
        }
      }

      const service = new DefaultTimeoutService();
      cacheManager.setDefaultConfig(250, true);

      await service.getData('default-test');

      const operations = mockStore.getOperations();
      const setOp = operations.find(op => op.startsWith('SET:'));
      
      // Should use global default
      expect(setOp).toContain(':250');
    });
  });

  describe('Error Handling', () => {
    test('should handle cache store errors gracefully', async () => {
      // Create error-throwing store
      const errorStore = {
        get: jest.fn().mockRejectedValue(new Error('Get error')),
        set: jest.fn().mockRejectedValue(new Error('Set error')),
        del: jest.fn().mockRejectedValue(new Error('Del error')),
        close: jest.fn()
      };

      cacheManager.setCacheStore(errorStore as any);

      // Should work despite cache errors
      const result = await userService.getUserProfile('error-test');
      expect(result.userId).toBe('error-test');

      // Cache operations should have been attempted
      expect(errorStore.get).toHaveBeenCalled();
      expect(errorStore.set).toHaveBeenCalled();
    });

    test('should handle cache eviction errors gracefully', async () => {
      const errorStore = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockRejectedValue(new Error('Delete error')),
        close: jest.fn()
      };

      cacheManager.setCacheStore(errorStore as any);

      // Should work despite delete error
      const result = await userService.updateUserProfile('error-test', { name: 'Updated' });
      expect(result.userId).toBe('error-test');

      expect(errorStore.del).toHaveBeenCalled();
    });
  });

  describe('Comprehensive Flow', () => {
    test('should demonstrate complete cache lifecycle', async () => {
      console.log('\n=== Architecture Test Demo ===');

      // 1. Cache miss - first call
      console.log('1. First call (cache miss):');
      const user1 = await userService.getUserProfile('demo');
      expect(user1.userId).toBe('demo');

      // 2. Cache hit - second call
      console.log('2. Second call (cache hit):');
      const user2 = await userService.getUserProfile('demo');
      expect(user2.createdAt).toBe(user1.createdAt); // Same from cache

      // 3. Cache eviction
      console.log('3. Update user (cache eviction):');
      await userService.updateUserProfile('demo', { name: 'Updated Demo User' });

      // 4. Cache miss after eviction
      console.log('4. Call after eviction (cache miss):');
      const user3 = await userService.getUserProfile('demo');
      expect(user3.createdAt).not.toBe(user1.createdAt); // New data

      // 5. Multi-parameter caching
      console.log('5. Multi-parameter caching:');
      const product1 = await productService.getProductDetails('demo-prod', 'tech');
      const product2 = await productService.getProductDetails('demo-prod', 'tech');
      expect(product1.name).toBe(product2.name); // Same from cache

      console.log('=== Demo Complete ===\n');

      // Verify all operations occurred
      const operations = mockStore.getOperations();
      expect(operations.length).toBeGreaterThan(0);
      expect(operations.some(op => op.startsWith('GET:'))).toBe(true);
      expect(operations.some(op => op.startsWith('SET:'))).toBe(true);
      expect(operations.some(op => op.startsWith('DEL:'))).toBe(true);
    });
  });
}); 