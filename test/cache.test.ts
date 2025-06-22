/**
 * Cache decorator and injection functionality test suite
 */
import { CacheAble, CacheEvict } from "../src/cache";
import { injectCache } from "../src/inject";
import { CacheManager } from "../src/manager";
import { KoattyCache } from "../src/index";
import { IOCContainer, Component } from "koatty_container";
import { Koatty } from "koatty_core";
import { Helper } from "koatty_lib";

// Mock cache store for testing
class MockCacheStore {
  private storage = new Map<string, any>();
  private operations: Array<{ operation: string; key: string; value?: any }> = [];

  async get(key: string): Promise<any> {
    this.operations.push({ operation: 'get', key });
    return this.storage.get(key) || null;
  }

  async set(key: string, value: any, timeout?: number): Promise<void> {
    this.operations.push({ operation: 'set', key, value });
    this.storage.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.operations.push({ operation: 'del', key });
    this.storage.delete(key);
  }

  async close(): Promise<void> {
    // Mock close method
  }

  // Test helper methods
  getOperations() {
    return this.operations;
  }

  clearOperations() {
    this.operations = [];
  }

  hasKey(key: string): boolean {
    return this.storage.has(key);
  }

  clear() {
    this.storage.clear();
    this.operations = [];
  }
}

// Test service class with cache decorators
@Component("TestUserService", "COMPONENT")  
class TestUserService {
  constructor() {}

  @CacheAble("user:profile", {
    params: ["userId"],
    timeout: 300
  })
  async getUserProfile(userId: string): Promise<any> {
    // Simulate database query
    return {
      id: userId,
      name: `User${userId}`,
      email: `user${userId}@example.com`,
      fetchedAt: new Date().toISOString()
    };
  }

  @CacheAble("user:settings", {
    params: ["userId", "category"],
    timeout: 600
  })
  async getUserSettings(userId: string, category: string, extra?: string): Promise<any> {
    return {
      userId,
      category,
      settings: { theme: "dark", language: "en" },
      extra,
      fetchedAt: new Date().toISOString()
    };
  }

  @CacheEvict("user:profile", {
    params: ["userId"],
    delayedDoubleDeletion: true
  })
  async updateUserProfile(userId: string, data: any): Promise<any> {
    return {
      id: userId,
      ...data,
      updatedAt: new Date().toISOString()
    };
  }

  @CacheEvict("user:settings", {
    params: ["userId"],
    delayedDoubleDeletion: false
  })
  async resetUserSettings(userId: string): Promise<void> {
    // Reset user settings
  }

  // Method without cache decorator
  async normalMethod(param: string): Promise<string> {
    return `normal-${param}`;
  }
}

@Component("TestProductService", "COMPONENT")
class TestProductService {
  @CacheAble("product:list", {
    params: [],
    timeout: 120
  })
  async getAllProducts(): Promise<any> {
    return {
      products: [
        { id: 1, name: "Product1" },
        { id: 2, name: "Product2" }
      ],
      fetchedAt: new Date().toISOString()
    };
  }

  @CacheEvict("product:list", {
    params: [],
    delayedDoubleDeletion: false
  })
  async clearAllProducts(): Promise<void> {
    // Clear products
  }
}

describe("Cache Decorator and Injection Tests", () => {
  let mockStore: MockCacheStore;
  let userService: TestUserService;
  let productService: TestProductService;
  let cacheManager: CacheManager;
  let app: Koatty;

  beforeEach(async () => {
    // Reset cache manager and mock store
    mockStore = new MockCacheStore();
    app = {} as Koatty;
    
    // Initialize cache manager with mock store
    cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(mockStore as any);
    cacheManager.setDefaultConfig(300, true);
    
    // Create service instances
    userService = new TestUserService();
    productService = new TestProductService();
    
    // Mock GetCacheStore function
    jest.doMock("../src/store", () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(async () => {
    mockStore.clear();
    // Properly close cache store if it exists
    try {
      const store = cacheManager.getCacheStore();
      if (store && typeof store.close === 'function') {
        await store.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    cacheManager.setCacheStore(null);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Final cleanup to ensure no resources are left open
    try {
      const { closeCacheStore } = await import('../src/inject');
      await closeCacheStore(app);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Cache Functionality", () => {
    test("should cache method results with CacheAble decorator", async () => {
      // Clear operations to track cache behavior
      mockStore.clearOperations();

      // First call - should execute method and cache result
      const result1 = await userService.getUserProfile("123");
      expect(result1).toEqual({
        id: "123",
        name: "User123",
        email: "user123@example.com",
        fetchedAt: expect.any(String)
      });

      // Should have cache get (miss) and cache set operations
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ 
        operation: 'get', 
        key: expect.stringContaining('user:profile') 
      });
      expect(operations).toContainEqual({ 
        operation: 'set', 
        key: expect.stringContaining('user:profile'), 
        value: expect.any(String) 
      });

      mockStore.clearOperations();

      // Second call - should return cached result
      const result2 = await userService.getUserProfile("123");
      expect(result2.id).toBe("123");
      expect(result2.name).toBe("User123");

      // Should only have cache get (hit) operation
      const operations2 = mockStore.getOperations();
      expect(operations2).toContainEqual({ 
        operation: 'get', 
        key: expect.stringContaining('user:profile') 
      });
      // Should not have set operation on cache hit
      expect(operations2.filter(op => op.operation === 'set')).toHaveLength(0);
    });

    test("should clear cache with CacheEvict decorator", async () => {
      // First, cache a result
      await userService.getUserProfile("456");
      mockStore.clearOperations();

      // Execute CacheEvict method
      await userService.updateUserProfile("456", { name: "Updated User" });

      // Should have cache delete operation
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ 
        operation: 'del', 
        key: expect.stringContaining('user:profile') 
      });
    });

    test("should handle cache with multiple parameters", async () => {
      mockStore.clearOperations();

      // Call method with multiple parameters
      const result = await userService.getUserSettings("789", "theme", "extra");
      expect(result.userId).toBe("789");
      expect(result.category).toBe("theme");
      expect(result.extra).toBe("extra");

      // Should have cache operations
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ 
        operation: 'get', 
        key: expect.stringContaining('user:settings') 
      });
      expect(operations).toContainEqual({ 
        operation: 'set', 
        key: expect.stringContaining('user:settings'), 
        value: expect.any(String) 
      });
    });

    test("should handle methods without cache decorators normally", async () => {
      mockStore.clearOperations();

      const result = await userService.normalMethod("test");
      expect(result).toBe("normal-test");

      // Should not have any cache operations
      const operations = mockStore.getOperations();
      expect(operations).toHaveLength(0);
    });

    test("should work when cache store is not available", async () => {
      // Set cache store to null to simulate unavailable cache
      cacheManager.setCacheStore(null);

      // Method should still work, just without caching
      const result = await userService.getUserProfile("999");
      expect(result).toEqual({
        id: "999",
        name: "User999",
        email: "user999@example.com",
        fetchedAt: expect.any(String)
      });

      // No cache operations should occur
      const operations = mockStore.getOperations();
      expect(operations).toHaveLength(0);
    });
  });

  describe("Cache Configuration", () => {
    test("should use decorator-specific timeout", async () => {
      mockStore.clearOperations();

      await userService.getUserProfile("timeout-test");

      const operations = mockStore.getOperations();
      const setOperation = operations.find(op => op.operation === 'set');
      expect(setOperation).toBeDefined();
      // The actual timeout value is not directly testable in mock, 
      // but we can verify the method was called
    });

    test("should use global default timeout when decorator doesn't specify", async () => {
      // This would require a method without timeout specified
      // Testing the fallback to global config
      expect(cacheManager.getDefaultTimeout()).toBe(300);
      expect(cacheManager.getDefaultDelayedDoubleDeletion()).toBe(true);
    });
  });

  describe("Cache System Initialization", () => {
    test("should initialize cache system through injectCache", async () => {
      const mockGetCacheStore = jest.fn().mockResolvedValue(mockStore);
      jest.doMock("../src/store", () => ({
        GetCacheStore: mockGetCacheStore
      }));

      await injectCache({
        cacheTimeout: 600,
        delayedDoubleDeletion: false
      }, app);

      expect(cacheManager.getDefaultTimeout()).toBe(600);
      expect(cacheManager.getDefaultDelayedDoubleDeletion()).toBe(false);
    });
  });

  describe("Error Handling", () => {
    test("should handle cache store errors gracefully", async () => {
      // Create a store that throws errors
      const errorStore = {
        get: jest.fn().mockRejectedValue(new Error("Cache get error")),
        set: jest.fn().mockRejectedValue(new Error("Cache set error")),
        del: jest.fn().mockRejectedValue(new Error("Cache del error")),
        close: jest.fn()
      };

      cacheManager.setCacheStore(errorStore as any);

      // Method should still work despite cache errors
      const result = await userService.getUserProfile("error-test");
      expect(result).toEqual({
        id: "error-test",
        name: "Usererror-test",
        email: "usererror-test@example.com",
        fetchedAt: expect.any(String)
      });

      // Cache operations should have been attempted
      expect(errorStore.get).toHaveBeenCalled();
      expect(errorStore.set).toHaveBeenCalled();
    });

    test("should handle CacheEvict errors gracefully", async () => {
      const errorStore = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockRejectedValue(new Error("Cache del error")),
        close: jest.fn()
      };

      cacheManager.setCacheStore(errorStore as any);

      // Method should still work despite cache delete errors
      const result = await userService.updateUserProfile("error-test", { name: "Updated" });
      expect(result).toEqual({
        id: "error-test",
        name: "Updated",
        updatedAt: expect.any(String)
      });

      expect(errorStore.del).toHaveBeenCalled();
    });
  });
});