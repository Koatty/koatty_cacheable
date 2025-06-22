/**
 * Test runner for demonstrating cache functionality in action
 * Run this file to see cache operations in real-time
 */
import { CacheAble, CacheEvict } from '../src/cache';
import { injectCache } from '../src/inject';
import { CacheManager } from '../src/manager';
import { KoattyCache } from '../src/index';
import { Component } from 'koatty_container';

// Simple cache store with visual logging
class SimpleCacheStore {
  private storage = new Map<string, any>();

  async get(key: string): Promise<any> {
    const value = this.storage.get(key);
    console.log(`[CACHE GET] ${key} -> ${value ? 'HIT' : 'MISS'}`);
    return value || null;
  }

  async set(key: string, value: any, timeout?: number): Promise<void> {
    this.storage.set(key, value);
    console.log(`[CACHE SET] ${key} -> ${typeof value} (timeout: ${timeout}s)`);
  }

  async del(key: string): Promise<void> {
    const deleted = this.storage.delete(key);
    console.log(`[CACHE DEL] ${key} -> ${deleted ? 'DELETED' : 'NOT_FOUND'}`);
  }

  async close(): Promise<void> {
    console.log('[CACHE CLOSE] Closing cache store');
    this.storage.clear();
  }

  // Helper method for testing
  clear(): void {
    this.storage.clear();
    console.log('[CACHE CLEAR] All cache cleared');
  }

  size(): number {
    return this.storage.size;
  }
}

// Demo service with various cache scenarios
@Component("DemoService", "COMPONENT")
class DemoService {
  private counter = 0;

  @CacheAble("demo:simple", {
    params: ["id"],
    timeout: 10 // Short timeout for demo
  })
  async getUser(id: string): Promise<any> {
    this.counter++;
    console.log(`[SERVICE] Fetching user ${id} (call #${this.counter})`);
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      id,
      name: `User${id}`,
      timestamp: new Date().toISOString(),
      callNumber: this.counter
    };
  }

  @CacheAble("demo:complex", {
    params: ["category", "status"],
    timeout: 15
  })
  async getItems(category: string, status: string, limit?: number): Promise<any[]> {
    console.log(`[SERVICE] Fetching items: category=${category}, status=${status}, limit=${limit}`);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const items = [];
    const count = limit || 5;
    for (let i = 1; i <= count; i++) {
      items.push({
        id: `item-${i}`,
        category,
        status,
        name: `${category} Item ${i}`
      });
    }
    
    return items;
  }

  @CacheEvict("demo:simple", {
    params: ["id"],
    delayedDoubleDeletion: true
  })
  async updateUser(id: string, data: any): Promise<any> {
    console.log(`[SERVICE] Updating user ${id}:`, data);
    
    return {
      id,
      ...data,
      updatedAt: new Date().toISOString()
    };
  }

  @CacheEvict("demo:complex", {
    params: ["category"],
    delayedDoubleDeletion: false
  })
  async clearCategoryCache(category: string): Promise<void> {
    console.log(`[SERVICE] Clearing cache for category: ${category}`);
  }

  // Method without cache decorator
  async getSystemInfo(): Promise<any> {
    console.log('[SERVICE] Getting system info (not cached)');
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

// Main test runner
async function runDemo(): Promise<void> {
  console.log('🚀 Starting Cache Demo\n');

  // Initialize cache system
  const cacheStore = new SimpleCacheStore();
  const cacheManager = CacheManager.getInstance();
  cacheManager.setCacheStore(cacheStore as any);
  cacheManager.setDefaultConfig(300, true);

  // Create service instance
  const service = new DemoService();

  console.log('='.repeat(60));
  console.log('DEMO 1: Basic Cache Functionality');
  console.log('='.repeat(60));

  // Test 1: Basic caching
  console.log('\n1. First call to getUser("123"):');
  const user1 = await service.getUser("123");
  console.log(`   Result: ${JSON.stringify(user1, null, 2)}`);

  console.log('\n2. Second call to getUser("123") (should hit cache):');
  const user2 = await service.getUser("123");
  console.log(`   Result: ${JSON.stringify(user2, null, 2)}`);
  console.log(`   Cache hit: ${user1.callNumber === user2.callNumber}`);

  console.log('\n3. Call to getUser("456") (different key):');
  const user3 = await service.getUser("456");
  console.log(`   Result: ${JSON.stringify(user3, null, 2)}`);

  console.log('\n='.repeat(60));
  console.log('DEMO 2: Cache with Multiple Parameters');
  console.log('='.repeat(60));

  console.log('\n1. First call to getItems("electronics", "active"):');
  const items1 = await service.getItems("electronics", "active", 3);
  console.log(`   Result: ${items1.length} items`);

  console.log('\n2. Same call (should hit cache):');
  const items2 = await service.getItems("electronics", "active", 3);
  console.log(`   Cache hit: ${JSON.stringify(items1) === JSON.stringify(items2)}`);

  console.log('\n3. Different parameters (should miss cache):');
  const items3 = await service.getItems("books", "active", 3);
  console.log(`   Result: ${items3.length} items`);

  console.log('\n='.repeat(60));
  console.log('DEMO 3: Cache Eviction');
  console.log('='.repeat(60));

  console.log('\n1. Cache user "789":');
  await service.getUser("789");

  console.log('\n2. Update user "789" (should evict cache):');
  await service.updateUser("789", { name: "Updated User" });

  console.log('\n3. Get user "789" again (should hit service):');
  await service.getUser("789");

  console.log('\n='.repeat(60));
  console.log('DEMO 4: Cache Expiration');
  console.log('='.repeat(60));

  console.log('\n1. Cache user "expire-test":');
  await service.getUser("expire-test");

  console.log('\n2. Wait for cache expiration (10+ seconds)...');
  await new Promise(resolve => setTimeout(resolve, 11000));

  console.log('\n3. Get user "expire-test" again (should have expired):');
  await service.getUser("expire-test");

  console.log('\n='.repeat(60));
  console.log('DEMO 5: Non-cached Method');
  console.log('='.repeat(60));

  console.log('\n1. Call non-cached method twice:');
  await service.getSystemInfo();
  await service.getSystemInfo();
  console.log('   Notice: No cache operations for non-decorated methods');

  console.log('\n='.repeat(60));
  console.log('DEMO 6: Cache Statistics');
  console.log('='.repeat(60));

  console.log(`\nCache size: ${cacheStore.size()}`);
  console.log('Cache demo completed! 🎉');

  // Cleanup
  await cacheStore.close();
}

// Advanced demo with error scenarios
async function runErrorDemo(): Promise<void> {
  console.log('\n🧪 Starting Error Handling Demo\n');

  // Create error-prone cache store
  class ErrorCacheStore extends SimpleCacheStore {
    private failGet = false;
    private failSet = false;

    setFailGet(fail: boolean): void {
      this.failGet = fail;
    }

    setFailSet(fail: boolean): void {
      this.failSet = fail;
    }

    async get(key: string): Promise<any> {
      if (this.failGet) {
        console.log(`[CACHE GET ERROR] ${key} -> Simulated failure`);
        throw new Error('Cache get failure');
      }
      return super.get(key);
    }

    async set(key: string, value: any, timeout?: number): Promise<void> {
      if (this.failSet) {
        console.log(`[CACHE SET ERROR] ${key} -> Simulated failure`);
        throw new Error('Cache set failure');
      }
      return super.set(key, value, timeout);
    }
  }

  const errorStore = new ErrorCacheStore();
  const cacheManager = CacheManager.getInstance();
  cacheManager.setCacheStore(errorStore as any);

  const service = new DemoService();

  console.log('='.repeat(60));
  console.log('ERROR DEMO 1: Cache Get Failure');
  console.log('='.repeat(60));

  errorStore.setFailGet(true);
  console.log('\n1. Call with cache get failure:');
  const result1 = await service.getUser("error-test");
  console.log(`   Service still works: ${!!result1}`);

  console.log('\n='.repeat(60));
  console.log('ERROR DEMO 2: Cache Set Failure');
  console.log('='.repeat(60));

  errorStore.setFailGet(false);
  errorStore.setFailSet(true);
  console.log('\n1. Call with cache set failure:');
  const result2 = await service.getUser("error-test-2");
  console.log(`   Service still works: ${!!result2}`);

  console.log('\nError handling demo completed! ✅');
  await errorStore.close();
}

// Plugin demo
async function runPluginDemo(): Promise<void> {
  console.log('\n🔌 Starting Plugin Demo\n');

  const mockApp = {
    on: (event: string, handler: Function) => {
      console.log(`[APP] Registered ${event} handler`);
      
      // Simulate app stop after 2 seconds
      if (event === 'appStop') {
        setTimeout(async () => {
          console.log('[APP] Stopping application...');
          await handler();
          console.log('[APP] Application stopped');
        }, 2000);
      }
    }
  };

  const plugin = KoattyCache({
    cacheTimeout: 600,
    delayedDoubleDeletion: false
  });

  console.log('Initializing plugin...');
  await plugin(mockApp as any, () => {
    console.log('[PLUGIN] Cache plugin initialized successfully');
  });

  const cacheManager = CacheManager.getInstance();
  console.log(`Configuration applied: timeout=${cacheManager.getDefaultTimeout()}s`);
  console.log(`Delayed double deletion: ${cacheManager.getDefaultDelayedDoubleDeletion()}`);

  // Wait for app stop simulation
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('\nPlugin demo completed! 🔌');
}

// Run all demos
async function main(): Promise<void> {
  try {
    await runDemo();
    await runErrorDemo();
    await runPluginDemo();
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main().then(() => {
    console.log('\n🎯 All demos completed successfully!');
    process.exit(0);
  }).catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}

export { DemoService, SimpleCacheStore, runDemo, runErrorDemo, runPluginDemo }; 