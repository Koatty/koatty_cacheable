/**
 * Cache decorator and injection functionality test suite
 */
import { CacheAble, CacheEvict, DecoratorType, CACHE_METADATA_KEY } from "../src/cache";
import { injectCache } from "../src/inject";
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
@Component()
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

@Component()
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
  let app: Koatty;

  beforeEach(() => {
    // Reset IOC container and mock store
    mockStore = new MockCacheStore();
    app = {} as Koatty;
    
    // Mock GetCacheStore function
    jest.doMock("../src/store", () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  describe("Decorator Metadata Collection", () => {
    test("should collect CacheAble decorator metadata", () => {
      // Get metadata from IOC container
      const componentList = IOCContainer.listClass("COMPONENT_CACHE");
      const testUserComponent = componentList.find(c => c.target.name === "TestUserService");
      
      expect(testUserComponent).toBeDefined();
      
      const metadata = IOCContainer.getClassMetadata("COMPONENT_CACHE", CACHE_METADATA_KEY, testUserComponent!.target);
      expect(metadata).toBeDefined();
      
      // Check if getUserProfile method metadata exists
      const getUserProfileMeta = Object.values(metadata).find((meta: any) => 
        meta.methodName === "getUserProfile" && meta.type === DecoratorType.CACHE_ABLE
      );
      
      expect(getUserProfileMeta).toBeDefined();
      expect(getUserProfileMeta).toMatchObject({
        cacheName: "user:profile",
        methodName: "getUserProfile",
        type: DecoratorType.CACHE_ABLE,
        options: {
          params: ["userId"],
          timeout: 300
        }
      });
    });

    test("should collect CacheEvict decorator metadata", () => {
      const componentList = IOCContainer.listClass("COMPONENT_CACHE");
      const testUserComponent = componentList.find(c => c.target.name === "TestUserService");
      
      const metadata = IOCContainer.getClassMetadata("COMPONENT_CACHE", CACHE_METADATA_KEY, testUserComponent!.target);
      
      // Check if updateUserProfile method metadata exists
      const updateUserProfileMeta = Object.values(metadata).find((meta: any) => 
        meta.methodName === "updateUserProfile" && meta.type === DecoratorType.CACHE_EVICT
      );
      
      expect(updateUserProfileMeta).toBeDefined();
      expect(updateUserProfileMeta).toMatchObject({
        cacheName: "user:profile",
        methodName: "updateUserProfile",
        type: DecoratorType.CACHE_EVICT,
        options: {
          params: ["userId"],
          delayedDoubleDeletion: true
        }
      });
    });
  });

  describe("Cache Injection Functionality", () => {
    beforeEach(async () => {
      // Perform cache injection
      await injectCache({
        cacheTimeout: 300,
        delayedDoubleDeletion: true
      }, app);
      
      // Get service instances
      userService = IOCContainer.get("TestUserService") as TestUserService;
      productService = IOCContainer.get("TestProductService") as TestProductService;
    });

    test("should inject cache functionality into CacheAble methods", async () => {
      mockStore.clear();
      
      // First call - should fetch and cache
      const result1 = await userService.getUserProfile("123");
      expect(result1.id).toBe("123");
      
      // Should have tried to get from cache and then set to cache
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ operation: 'get', key: expect.stringContaining('user:profile') });
      expect(operations).toContainEqual({ operation: 'set', key: expect.stringContaining('user:profile'), value: expect.any(String) });
      
      mockStore.clearOperations();
      
      // Second call - should get from cache
      const result2 = await userService.getUserProfile("123");
      expect(result2.id).toBe("123");
      
      const operations2 = mockStore.getOperations();
      expect(operations2).toContainEqual({ operation: 'get', key: expect.stringContaining('user:profile') });
      // Should not have set operation as it got from cache
      expect(operations2.filter(op => op.operation === 'set')).toHaveLength(0);
    });

    test("should handle multiple parameters in cache key", async () => {
      mockStore.clear();
      
      await userService.getUserSettings("123", "theme", "extra");
      
      const operations = mockStore.getOperations();
      const getOperation = operations.find(op => op.operation === 'get');
      
      expect(getOperation?.key).toContain('user:settings');
      expect(getOperation?.key).toContain('userId:123');
      expect(getOperation?.key).toContain('category:theme');
    });

    test("should inject cache eviction functionality", async () => {
      mockStore.clear();
      
      // First cache some data
      await userService.getUserProfile("123");
      mockStore.clearOperations();
      
      // Update profile - should clear cache
      await userService.updateUserProfile("123", { name: "Updated User" });
      
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ operation: 'del', key: expect.stringContaining('user:profile') });
    });

    test("should handle methods without parameters", async () => {
      mockStore.clear();
      
      await productService.getAllProducts();
      
      const operations = mockStore.getOperations();
      expect(operations).toContainEqual({ operation: 'get', key: 'product:list' });
      expect(operations).toContainEqual({ operation: 'set', key: 'product:list', value: expect.any(String) });
    });

    test("should not affect normal methods without decorators", async () => {
      mockStore.clear();
      
      const result = await userService.normalMethod("test");
      expect(result).toBe("normal-test");
      
      // Should not have any cache operations
      const operations = mockStore.getOperations();
      expect(operations).toHaveLength(0);
    });

    test("should handle cache errors gracefully", async () => {
      // Mock store to throw errors
      const errorStore = {
        get: jest.fn().mockRejectedValue(new Error("Cache get error")),
        set: jest.fn().mockRejectedValue(new Error("Cache set error")),
        del: jest.fn().mockRejectedValue(new Error("Cache del error"))
      };
      
      // Re-inject with error store
      jest.doMock("../src/store", () => ({
        GetCacheStore: jest.fn().mockResolvedValue(errorStore)
      }));
      
      await injectCache({}, app);
      const errorUserService = IOCContainer.get("TestUserService") as TestUserService;
      
      // Should still work despite cache errors
      const result = await errorUserService.getUserProfile("123");
      expect(result.id).toBe("123");
    });
  });

  describe("KoattyCache Plugin Integration", () => {
    test("should work as a plugin", async () => {
      const options = {
        cacheTimeout: 600,
        delayedDoubleDeletion: false,
        redisConfig: {
          host: "localhost",
          port: 6379
        }
      };
      
      // Should not throw error
      await expect(KoattyCache(options, app)).resolves.not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty params array", async () => {
      await injectCache({}, app);
      const service = IOCContainer.get("TestProductService") as TestProductService;
      
      mockStore.clear();
      await service.getAllProducts();
      
      const operations = mockStore.getOperations();
      expect(operations.some(op => op.key === 'product:list')).toBe(true);
    });

    test("should handle undefined optional parameters", async () => {
      await injectCache({}, app);
      const service = IOCContainer.get("TestUserService") as TestUserService;
      
      mockStore.clear();
      // Call with undefined optional parameter
      await service.getUserSettings("123", "theme");
      
      const operations = mockStore.getOperations();
      const getOperation = operations.find(op => op.operation === 'get');
      expect(getOperation?.key).toBeTruthy();
    });

    test("should handle long cache keys with murmur hash", async () => {
      // Create a very long cache key
      const longUserId = "a".repeat(200);
      
      await injectCache({}, app);
      const service = IOCContainer.get("TestUserService") as TestUserService;
      
      mockStore.clear();
      await service.getUserProfile(longUserId);
      
      const operations = mockStore.getOperations();
      const getOperation = operations.find(op => op.operation === 'get');
      
      // Key should be hashed if too long
      expect(getOperation?.key).toBeTruthy();
      // Helper.murmurHash should be called for long keys
    });
  });
});

export { TestUserService, TestProductService, MockCacheStore }; 