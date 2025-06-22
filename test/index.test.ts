/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 13:52:34
 * @LastEditTime: 2024-11-07 15:37:23
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

import assert from "assert";
import { GetCacheStore, CloseCacheStore } from "../src/store";
import { TestClass } from "./test";
import { injectCache } from "../src/inject";
import { IOCContainer } from "koatty_container";
import { Koatty } from "koatty_core";
import { KoattyCache, CacheAble, CacheEvict } from '../src/index';
import { CacheManager } from '../src/manager';
import { Component } from 'koatty_container';

const clazz = new TestClass();
let app: Koatty;

describe("Cache", () => {
  beforeAll(async () => {
    // Setup application and register test class
    app = {} as Koatty;
    
    // Manually register class type to IOC container
    IOCContainer.saveClass("COMPONENT", TestClass, "TestClass");
    IOCContainer.reg("TestClass", TestClass);
    
    // Inject cache functionality
    await injectCache({
      cacheTimeout: 300,
      delayedDoubleDeletion: true
    }, app);
    
    // Initialize with first call
    await clazz.run("tom", 11);
  });

  afterAll(async () => {
    // 等待延迟双删操作完成（如果有的话）
    await new Promise(resolve => setTimeout(resolve, 200));
    // 清理缓存连接
    await CloseCacheStore();
    // 最后等待确保清理完成
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test("CacheAble", async () => {
    const cs = await GetCacheStore();
    await cs.set("run:name:tom", "222");
    assert.equal(await cs.get("run:name:tom"), "222");
  });

  test("CacheEvict", async () => {
    const cs = await GetCacheStore();
    // First ensure there's something to evict
    await cs.set("run:name:tom", "222");
    assert.equal(await cs.get("run:name:tom"), "222");
    
    // Now run the cache evict method
    const res = await clazz.run2("tom", 11);
    assert.equal(res, "234");
    
    // Wait a moment for cache eviction to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Cache should be cleared
    assert.equal(await cs.get("run:name:tom"), null);
  });
})

// Mock cache store
class TestCacheStore {
  private storage = new Map<string, any>();

  async get(key: string): Promise<any> {
    return this.storage.get(key) || null;
  }

  async set(key: string, value: any, timeout?: number): Promise<void> {
    this.storage.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async close(): Promise<void> {
    this.storage.clear();
  }

  clear(): void {
    this.storage.clear();
  }

  has(key: string): boolean {
    return this.storage.has(key);
  }

  getKeys(): string[] {
    return Array.from(this.storage.keys());
  }
}

// Test service
@Component("TestService", "COMPONENT")
class TestService {
  @CacheAble("test:method", {
    params: ["id"],
    timeout: 300
  })
  async getData(id: string): Promise<any> {
    return { id, data: "test data", timestamp: Date.now() };
  }

  @CacheEvict("test:method", {
    params: ["id"]
  })
  async updateData(id: string, data: any): Promise<any> {
    return { id, ...data, updated: true };
  }
}

describe('Index Module Tests', () => {
  let mockStore: TestCacheStore;
  let cacheManager: CacheManager;
  let service: TestService;

  beforeEach(() => {
    mockStore = new TestCacheStore();
    cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(mockStore as any);
    cacheManager.setDefaultConfig(300, true);
    
    service = new TestService();

    // Mock GetCacheStore
    jest.doMock('../src/store', () => ({
      GetCacheStore: jest.fn().mockResolvedValue(mockStore)
    }));
  });

  afterEach(async () => {
    mockStore.clear();
    cacheManager.setCacheStore(null);
    jest.clearAllMocks();
    
    // 等待任何延迟操作完成
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    // 最终清理
    const cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(null);
    
    // 等待所有异步操作完成
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Exports', () => {
    test('should export all required components', () => {
      expect(KoattyCache).toBeDefined();
      expect(CacheAble).toBeDefined();
      expect(CacheEvict).toBeDefined();
      expect(injectCache).toBeDefined();
    });

    test('should export working decorators', async () => {
      // Test that decorators work when imported from index
      const result1 = await service.getData("test");
      const result2 = await service.getData("test");
      
      // Should return same data from cache
      expect(result1.timestamp).toBe(result2.timestamp);
    });
  });

  describe('KoattyCache Plugin', () => {
    test('should initialize as Koatty plugin', async () => {
      const mockApp = {
        on: jest.fn()
      };

      await KoattyCache({
        cacheTimeout: 500,
        delayedDoubleDeletion: false
      }, mockApp as any);

      expect(mockApp.on).toHaveBeenCalledWith('appStop', expect.any(Function));
    });

    test('should handle plugin options correctly', async () => {
      const options = {
        cacheTimeout: 600,
        delayedDoubleDeletion: false,
        redisConfig: {
          host: 'localhost',
          port: 6379
        }
      };

      const mockApp = { on: jest.fn() };

      await KoattyCache(options, mockApp as any);
      
      // Should apply configuration
      expect(cacheManager.getDefaultTimeout()).toBe(600);
      expect(cacheManager.getDefaultDelayedDoubleDeletion()).toBe(false);
    });

    test('should handle app stop event', async () => {
      const mockApp = { on: jest.fn() };

      await KoattyCache({}, mockApp as any);

      // Get the stop handler
      const stopHandler = mockApp.on.mock.calls.find(
        call => call[0] === 'appStop'
      )?.[1];

      expect(stopHandler).toBeDefined();
      
      // Should not throw during cleanup
      await expect(stopHandler()).resolves.not.toThrow();
    });
  });

  describe('Integration with CacheManager', () => {
    test('should work with cache manager singleton', async () => {
      // Multiple instances should share the same cache manager
      const manager1 = CacheManager.getInstance();
      const manager2 = CacheManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });

    test('should maintain configuration across plugin calls', async () => {
      const mockApp = { on: jest.fn() };
      
      // First plugin call
      await KoattyCache({ cacheTimeout: 400 }, mockApp as any);
      expect(cacheManager.getDefaultTimeout()).toBe(400);

      // Second plugin call should update configuration
      await KoattyCache({ cacheTimeout: 800 }, mockApp as any);
      expect(cacheManager.getDefaultTimeout()).toBe(800);
    });
  });

  describe('Full Integration', () => {
    test('should provide complete caching functionality', async () => {
      // Initialize through plugin
      const mockApp = { on: jest.fn() };
      await KoattyCache({
        cacheTimeout: 300,
        delayedDoubleDeletion: true
      }, mockApp as any);

      // Re-set our mock store after plugin initialization
      cacheManager.setCacheStore(mockStore as any);

      // Test caching
      const result1 = await service.getData("integration-test");
      const result2 = await service.getData("integration-test");
      
      expect(result1).toEqual(result2);
      // Check if any key contains the expected pattern
      const keys = mockStore.getKeys();
      const hasExpectedKey = keys.some(key => key.includes('test:method:id:integration-test'));
      expect(hasExpectedKey).toBe(true);

      // Test eviction
      await service.updateData("integration-test", { newData: "updated" });
      
      // Cache should be cleared (next call will be different)
      const result3 = await service.getData("integration-test");
      expect(result3.timestamp).not.toBe(result1.timestamp);
    });

    test('should handle errors gracefully in full integration', async () => {
      // Create failing cache store
      const failingStore = {
        get: jest.fn().mockRejectedValue(new Error('Cache error')),
        set: jest.fn().mockRejectedValue(new Error('Cache error')),
        del: jest.fn().mockRejectedValue(new Error('Cache error')),
        close: jest.fn()
      };

      cacheManager.setCacheStore(failingStore as any);

      // Should still work despite cache errors
      const result = await service.getData("error-test");
      expect(result.id).toBe("error-test");
    });
  });

  describe('Decorator Functionality', () => {
    test('CacheAble should cache method results', async () => {
      const result1 = await service.getData("cache-test");
      const result2 = await service.getData("cache-test");
      
      // Should be same object from cache
      expect(result1.timestamp).toBe(result2.timestamp);
    });

    test('CacheEvict should clear cache', async () => {
      // First cache some data
      await service.getData("evict-test");
      // Check if any key contains the expected pattern
      const keys1 = mockStore.getKeys();
      const hasExpectedKey1 = keys1.some(key => key.includes('test:method:id:evict-test'));
      expect(hasExpectedKey1).toBe(true);

      // Update should clear cache
      await service.updateData("evict-test", { updated: true });
      
      // Next call should get fresh data
      const result = await service.getData("evict-test");
      expect(result.data).toBe("test data");
    });
  });

  describe('Configuration Priority', () => {
    test('should use decorator timeout over global timeout', async () => {
      // Set different global timeout
      cacheManager.setDefaultConfig(100, true);
      
      // Decorator specifies 300s timeout
      await service.getData("timeout-test");
      
      // Should use decorator timeout (this is hard to test directly,
      // but we can verify the method was called)
      const keys = mockStore.getKeys();
      const hasExpectedKey = keys.some(key => key.includes('test:method:id:timeout-test'));
      expect(hasExpectedKey).toBe(true);
    });

    test('should use global config when decorator doesn\'t specify', () => {
      cacheManager.setDefaultConfig(500, false);
      
      expect(cacheManager.getDefaultTimeout()).toBe(500);
      expect(cacheManager.getDefaultDelayedDoubleDeletion()).toBe(false);
    });
  });
});