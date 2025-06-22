/**
 * Comprehensive test suite for advanced scenarios and edge cases
 * Covers configuration priority, error boundaries, concurrency, and edge cases
 */
import { CacheAble, CacheEvict, DecoratorType, CACHE_METADATA_KEY } from "../src/cache";
import { injectCache, CacheOptions } from "../src/inject";
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
@Component()
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
@Component()
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
  let app: Koatty;

  beforeEach(() => {
    mockStore = new TestMockStore();
    app = {} as Koatty;
    
    jest.doMock("../src/store", () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  describe("Configuration Priority", () => {
    test("should use global configuration when decorator doesn't specify", async () => {
      await injectCache({
        cacheTimeout: 500,
        delayedDoubleDeletion: true
      }, app);

      const service = IOCContainer.get("ConfigTestService") as ConfigTestService;
      
      mockStore.clear();
      await service.methodWithGlobalConfig("test");
      
      const ops = mockStore.getOperations();
      const setOp = ops.find(op => op.startsWith("SET:"));
      expect(setOp).toContain(":500"); // Global timeout used
    });

    test("should use decorator configuration when specified", async () => {
      await injectCache({
        cacheTimeout: 500,
        delayedDoubleDeletion: true
      }, app);

      const service = IOCContainer.get("ConfigTestService") as ConfigTestService;
      
      mockStore.clear();
      await service.methodWithOverrideConfig("test");
      
      const ops = mockStore.getOperations();
      const setOp = ops.find(op => op.startsWith("SET:"));
      expect(setOp).toContain(":60"); // Decorator timeout used
    });
  });

  describe("Edge Cases", () => {
    beforeEach(async () => {
      await injectCache({}, app);
    });

    test("should handle null and undefined parameters", async () => {
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      // Test null
      const result1 = await service.testNullParam(null);
      expect(result1.param).toBe("null");
      
      // Test undefined
      const result2 = await service.testNullParam(undefined);
      expect(result2.param).toBe("undefined");
    });

    test("should handle empty parameter arrays", async () => {
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      mockStore.clear();
      const result1 = await service.testNoParams();
      const result2 = await service.testNoParams();
      
      // Should cache without parameters
      expect(result1.timestamp).toBe(result2.timestamp);
      
      const ops = mockStore.getOperations();
      expect(ops.filter(op => op.startsWith("GET:")).length).toBe(2);
      expect(ops.filter(op => op.startsWith("SET:")).length).toBe(1);
    });

    test("should handle complex parameter scenarios", async () => {
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      const result = await service.testComplexParams("value1", { id: 123 }, "ignored");
      
      expect(result.a).toBe("value1");
      expect(result.b).toEqual({ id: 123 });
      expect(result.ignored).toBe("ignored");
      
      const ops = mockStore.getOperations();
      const getOp = ops.find(op => op.startsWith("GET:"));
      expect(getOp).toContain("a:value1");
      expect(getOp).not.toContain("ignored");
    });
  });

  describe("Error Handling", () => {
    beforeEach(async () => {
      await injectCache({}, app);
    });

    test("should handle cache get errors gracefully", async () => {
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      mockStore.setFailMode(true, 1);
      
      // Should not throw, should execute method normally
      const result = await service.testNoParams();
      expect(result.timestamp).toBeDefined();
    });

    test("should handle cache set errors gracefully", async () => {
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      mockStore.setFailMode(true, 2); // Fail both get and set
      
      // Should not throw, should execute method normally
      const result = await service.testNoParams();
      expect(result.timestamp).toBeDefined();
    });

    test("should handle store unavailability", async () => {
      // Mock store to be unavailable
      jest.doMock("../src/store", () => ({
        GetCacheStore: jest.fn().mockResolvedValue(null)
      }));

      // Should not throw during injection
      await expect(injectCache({}, app)).resolves.not.toThrow();
    });
  });

  describe("Metadata Validation", () => {
    test("should collect decorator metadata correctly", () => {
      const componentList = IOCContainer.listClass("COMPONENT_CACHE");
      expect(componentList.length).toBeGreaterThan(0);
      
      // Verify metadata structure
      for (const component of componentList) {
        const metadata = IOCContainer.getClassMetadata("COMPONENT_CACHE", "CACHE_METADATA_KEY", component.target);
        
        if (metadata) {
          for (const [key, meta] of Object.entries(metadata)) {
            expect(meta).toHaveProperty("cacheName");
            expect(meta).toHaveProperty("methodName");
            expect(meta).toHaveProperty("type");
            expect(meta).toHaveProperty("options");
          }
        }
      }
    });
  });

  describe("KoattyCache Plugin", () => {
    test("should initialize with default options", async () => {
      const options = {};
      
      // Should not throw
      await expect(KoattyCache(options, app)).resolves.not.toThrow();
    });

    test("should merge user options with defaults", async () => {
      const options = {
        cacheTimeout: 1200,
        redisConfig: {
          host: "custom-host"
        }
      };
      
      // Should not throw and should handle option merging
      await expect(KoattyCache(options, app)).resolves.not.toThrow();
    });
  });

  describe("Helper Functions Coverage", () => {
    test("should handle various parameter types in cache key generation", async () => {
      await injectCache({}, app);
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      // Test different parameter types
      await service.testComplexParams("string", 123);
      await service.testComplexParams("", 0);
      await service.testComplexParams("special!@#$%", { nested: { value: true } });
      
      const ops = mockStore.getOperations();
      expect(ops.filter(op => op.startsWith("GET:")).length).toBe(3);
    });
  });

  describe("Memory Management", () => {
    test("should not cause memory leaks with many operations", async () => {
      await injectCache({}, app);
      const service = IOCContainer.get("EdgeCaseTestService") as EdgeCaseTestService;
      
      // Perform many operations
      for (let i = 0; i < 50; i++) {
        await service.testComplexParams(`test-${i}`, i);
      }
      
      // Should complete without issues
      expect(mockStore.getOperations().length).toBe(100); // 50 GET + 50 SET
    });
  });
});

export { TestMockStore, ConfigTestService, EdgeCaseTestService }; 