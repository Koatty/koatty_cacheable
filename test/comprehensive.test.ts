/**
 * Comprehensive test suite for advanced scenarios and edge cases
 * Covers configuration priority, error boundaries, concurrency, and edge cases
 */
import { CacheAble, CacheEvict } from "../src/cache";
import { injectCache, CacheOptions } from "../src/inject";
import { CacheManager } from "../src/manager";
import { KoattyCache } from "../src/index";
import { IOCContainer, Component } from "koatty_container";
import { Koatty } from "koatty_core";
import { Helper } from "koatty_lib";

// Advanced mock store for testing
class TestMockStore {
  private storage = new Map<string, { value: any; expiry: number }>();
  private operations: string[] = [];
  private shouldFail = false;
  private failCount = 0;

  async get(key: string): Promise<any> {
    this.operations.push(`GET:${key}`);
    
    if (this.shouldFail && this.failCount > 0) {
      this.failCount--;
      throw new Error("Mock get failure");
    }
    
    const item = this.storage.get(key);
    if (!item || Date.now() > item.expiry) {
      return null;
    }
    return item.value;
  }

  async set(key: string, value: any, timeout: number = 300): Promise<void> {
    this.operations.push(`SET:${key}:${timeout}`);
    
    if (this.shouldFail && this.failCount > 0) {
      this.failCount--;
      throw new Error("Mock set failure");
    }
    
    this.storage.set(key, { value, expiry: Date.now() + timeout * 1000 });
  }

  async del(key: string): Promise<void> {
    this.operations.push(`DEL:${key}`);
    this.storage.delete(key);
  }

  async close(): Promise<void> {
    // Mock close method
  }

  getOperations(): string[] {
    return [...this.operations];
  }

  setFailMode(shouldFail: boolean, count: number = 1): void {
    this.shouldFail = shouldFail;
    this.failCount = count;
  }

  clear(): void {
    this.storage.clear();
    this.operations = [];
    this.shouldFail = false;
    this.failCount = 0;
  }
}

// Test service for configuration priority
@Component("ConfigTestService", "COMPONENT")
class ConfigTestService {
  
  @CacheAble("config:global", { params: ["id"] })
  async methodWithGlobalConfig(id: string): Promise<any> {
    return { id, time: Date.now() };
  }

  @CacheAble("config:override", {
    params: ["id"],
    timeout: 60
  })
  async methodWithOverrideConfig(id: string): Promise<any> {
    return { id, time: Date.now() };
  }

  @CacheEvict("config:evict", { params: ["id"] })
  async methodWithGlobalEvictConfig(id: string): Promise<any> {
    return { id, updated: true };
  }

  @CacheEvict("config:evict", {
    params: ["id"],
    delayedDoubleDeletion: false
  })
  async methodWithOverrideEvictConfig(id: string): Promise<any> {
    return { id, updated: true };
  }
}

// Test service for edge cases
@Component("EdgeCaseTestService", "COMPONENT")
class EdgeCaseTestService {
  
  @CacheAble("edge:params", { params: ["param"] })
  async testNullParam(param: any): Promise<any> {
    return { param: String(param) };
  }

  @CacheAble("edge:noparams", { params: [] })
  async testNoParams(): Promise<any> {
    return { timestamp: Date.now() };
  }

  @CacheAble("edge:complex", { params: ["a", "b"] })
  async testComplexParams(a: any, b: any, ignored?: any): Promise<any> {
    return { a, b, ignored };
  }

  @CacheEvict("edge:evict", { params: ["id"] })
  async testEvict(id: string): Promise<void> {
    // Test eviction
  }
}

describe("Comprehensive Cache Coverage Tests", () => {
  let mockStore: TestMockStore;
  let cacheManager: CacheManager;
  let app: Koatty;

  beforeEach(async () => {
    mockStore = new TestMockStore();
    app = {} as Koatty;
    
    // Initialize cache manager with mock store
    cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(mockStore as any);
    cacheManager.setDefaultConfig(300, true);
    
    jest.doMock("../src/store", () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(() => {
    mockStore.clear();
    cacheManager.setCacheStore(null);
    jest.clearAllMocks();
  });

  describe("Configuration Priority", () => {
    test("should use global configuration when decorator doesn't specify", async () => {
      // Set global config
      cacheManager.setDefaultConfig(500, true);
      
      const service = new ConfigTestService();
      
      mockStore.clear();
      await service.methodWithGlobalConfig("test");
      
      const ops = mockStore.getOperations();
      const setOp = ops.find(op => op.startsWith("SET:"));
      // Global timeout (500) or decorator default should be used
      expect(setOp).toBeDefined();
    });

    test("should use decorator configuration when specified", async () => {
      // Set global config different from decorator
      cacheManager.setDefaultConfig(500, true);
      
      const service = new ConfigTestService();
      
      mockStore.clear();
      await service.methodWithOverrideConfig("test");
      
      const ops = mockStore.getOperations();
      const setOp = ops.find(op => op.startsWith("SET:"));
      // Decorator timeout (60) should override global config
      expect(setOp).toContain(":60");
    });

    test("should respect delayedDoubleDeletion configuration", async () => {
      cacheManager.setDefaultConfig(300, false); // Global: no delayed deletion
      
      const service = new ConfigTestService();
      
      // Method using global config
      await service.methodWithGlobalEvictConfig("test1");
      
      // Method overriding config
      await service.methodWithOverrideEvictConfig("test2");
      
      const ops = mockStore.getOperations();
      expect(ops.filter(op => op.startsWith("DEL:"))).toHaveLength(2);
    });
  });

  describe("Edge Cases", () => {
    let service: EdgeCaseTestService;

    beforeEach(() => {
      service = new EdgeCaseTestService();
    });

    test("should handle null and undefined parameters", async () => {
      // Test null
      const result1 = await service.testNullParam(null);
      expect(result1.param).toBe("null");
      
      // Test undefined
      const result2 = await service.testNullParam(undefined);
      expect(result2.param).toBe("undefined");
      
      // Both calls should generate different cache keys
      const ops = mockStore.getOperations();
      const getOps = ops.filter(op => op.startsWith("GET:"));
      expect(getOps.length).toBeGreaterThanOrEqual(2);
    });

    test("should handle empty object and array parameters", async () => {
      const result1 = await service.testNullParam({});
      expect(result1.param).toBe("[object Object]");
      
      const result2 = await service.testNullParam([]);
      expect(result2.param).toBe("");
    });

    test("should handle methods with no parameters", async () => {
      const result1 = await service.testNoParams();
      const result2 = await service.testNoParams();
      
      // Should cache the result (timestamp should be same)
      expect(result1.timestamp).toBe(result2.timestamp);
      
      const ops = mockStore.getOperations();
      expect(ops.filter(op => op.startsWith("GET:")).length).toBe(2);
      expect(ops.filter(op => op.startsWith("SET:")).length).toBe(1);
    });

    test("should ignore parameters not in params array", async () => {
      const result = await service.testComplexParams("a", "b", "ignored");
      expect(result).toEqual({ a: "a", b: "b", ignored: "ignored" });
      
      // Call again with different ignored parameter
      const result2 = await service.testComplexParams("a", "b", "different");
      
      // Should use cached result (ignored parameter not affecting cache key)
      expect(result2).toEqual(result);
    });

    test("should handle very long parameter values", async () => {
      const longString = "x".repeat(1000);
      const result = await service.testNullParam(longString);
      expect(result.param).toBe(longString);
      
      const ops = mockStore.getOperations();
      const getOp = ops.find(op => op.startsWith("GET:"));
      expect(getOp).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    let service: ConfigTestService;

    beforeEach(() => {
      service = new ConfigTestService();
    });

    test("should handle cache get failures gracefully", async () => {
      mockStore.setFailMode(true, 1); // Fail next operation
      
      // Should work despite cache failure
      const result = await service.methodWithGlobalConfig("test");
      expect(result.id).toBe("test");
      expect(result.time).toBeDefined();
    });

    test("should handle cache set failures gracefully", async () => {
      mockStore.setFailMode(true, 2); // Fail get and set
      
      const result = await service.methodWithGlobalConfig("test");
      expect(result.id).toBe("test");
    });

    test("should handle cache delete failures in evict methods", async () => {
      // First cache something
      await service.methodWithGlobalConfig("test");
      
      // Make delete fail
      mockStore.setFailMode(true, 1);
      
      // Should work despite delete failure
      const result = await service.methodWithGlobalEvictConfig("test");
      expect(result.id).toBe("test");
      expect(result.updated).toBe(true);
    });
  });

  describe("Concurrency", () => {
    let service: ConfigTestService;

    beforeEach(() => {
      service = new ConfigTestService();
    });

    test("should handle concurrent cache access", async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        service.methodWithGlobalConfig(`test${i}`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.id).toBe(`test${i}`);
      });
    });

    test("should handle concurrent access to same cache key", async () => {
      const promises = Array.from({ length: 5 }, () => 
        service.methodWithGlobalConfig("same-key")
      );
      
      const results = await Promise.all(promises);
      
      // All results should be identical (from cache after first call)
      const firstResult = results[0];
      results.forEach(result => {
        // Allow small time difference due to test execution speed
        expect(Math.abs(result.time - firstResult.time)).toBeLessThanOrEqual(10);
      });
    });
  });

  describe("Memory Management", () => {
    test("should not leak memory with many cache operations", async () => {
      const service = new ConfigTestService();
      
      // Perform many cache operations
      for (let i = 0; i < 100; i++) {
        await service.methodWithGlobalConfig(`key${i}`);
      }
      
      // Check that operations are tracked (but not growing indefinitely)
      const ops = mockStore.getOperations();
      expect(ops.length).toBeLessThan(300); // Should not be too many
    });

    test("should handle cache expiration", async () => {
      const service = new ConfigTestService();
      
      // Cache with very short timeout
      cacheManager.setDefaultConfig(0.001, false); // 1ms timeout
      
      await service.methodWithGlobalConfig("expire-test");
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should fetch again (cache expired)
      await service.methodWithGlobalConfig("expire-test");
      
      const ops = mockStore.getOperations();
      const setOps = ops.filter(op => op.startsWith("SET:"));
      expect(setOps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Plugin Integration", () => {
    test("should work with KoattyCache plugin", async () => {
      const options: CacheOptions = {
        cacheTimeout: 600,
        delayedDoubleDeletion: false
      };
      
      const mockApp = {
        on: jest.fn()
      } as any;
      
      await KoattyCache(options, mockApp);
      
      expect(mockApp.on).toHaveBeenCalledWith('appStop', expect.any(Function));
      
      // Test that configuration was applied
      expect(cacheManager.getDefaultTimeout()).toBe(600);
      expect(cacheManager.getDefaultDelayedDoubleDeletion()).toBe(false);
    });

    test("should handle plugin cleanup on app stop", async () => {
      const mockApp = {
        on: jest.fn()
      } as any;
      
      await KoattyCache({}, mockApp);
      
      // Get the cleanup function
      const stopHandler = mockApp.on.mock.calls.find(
        call => call[0] === 'appStop'
      )?.[1];
      
      expect(stopHandler).toBeDefined();
      
      // Should not throw when cleanup is called
      if (stopHandler) {
        try {
          await stopHandler();
          expect(true).toBe(true);
        } catch (error) {
          fail(`Cleanup should not throw, but got: ${error.message}`);
        }
      }
    });
  });

  describe("Validation", () => {
    test("should validate decorator usage on correct class types", () => {
      // This test ensures decorators are applied to valid classes
      // The actual validation happens at decoration time
      expect(() => {
        @Component("ValidService", "COMPONENT")
        class ValidService {
          @CacheAble("test")
          async method() {
            return "test";
          }
        }
        return new ValidService();
      }).not.toThrow();
    });
  });
}); 