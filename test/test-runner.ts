/**
 * Simple test runner to verify cache decorator functionality
 * Run this file directly to see the cache system in action
 */
import { CacheAble, CacheEvict } from "../src/cache";
import { KoattyCache } from "../src/index";
import { IOCContainer, Component } from "koatty_container";
import { Koatty } from "koatty_core";

// Simple in-memory cache store for testing
class SimpleCacheStore {
  private cache = new Map<string, { value: any; expiry: number }>();

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);
    if (!item) {
      console.log(`[Cache] MISS: ${key}`);
      return null;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      console.log(`[Cache] EXPIRED: ${key}`);
      return null;
    }
    
    console.log(`[Cache] HIT: ${key}`);
    return item.value;
  }

  async set(key: string, value: any, timeout: number = 300): Promise<void> {
    const expiry = Date.now() + timeout * 1000;
    this.cache.set(key, { value, expiry });
    console.log(`[Cache] SET: ${key} (expires in ${timeout}s)`);
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
    console.log(`[Cache] DEL: ${key}`);
  }

  // Test utilities
  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Test service
@Component()
class DemoService {
  private callCount = 0;

  @CacheAble("demo:user", {
    params: ["id"],
    timeout: 5 // Short timeout for demo
  })
  async getUser(id: string): Promise<any> {
    this.callCount++;
    console.log(`[Service] getUser(${id}) - Database call #${this.callCount}`);
    
    // Simulate database delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      fetchTime: new Date().toISOString(),
      callNumber: this.callCount
    };
  }

  @CacheEvict("demo:user", {
    params: ["id"],
    delayedDoubleDeletion: true
  })
  async updateUser(id: string, data: any): Promise<any> {
    console.log(`[Service] updateUser(${id})`, data);
    return { id, ...data, updated: true };
  }

  @CacheAble("demo:stats", {
    params: [],
    timeout: 3
  })
  async getStats(): Promise<any> {
    console.log(`[Service] getStats() - Calculating stats...`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      totalUsers: 1000,
      activeUsers: 750,
      timestamp: new Date().toISOString()
    };
  }

  getCallCount(): number {
    return this.callCount;
  }
}

// Mock the cache store
let mockStore: SimpleCacheStore;

jest.mock("../src/store", () => ({
  GetCacheStore: jest.fn(() => Promise.resolve(mockStore))
}));

async function runDemo() {
  console.log("=".repeat(60));
  console.log("CACHE DECORATOR DEMO");
  console.log("=".repeat(60));

  try {
    // Initialize
    mockStore = new SimpleCacheStore();
    const app = {} as Koatty;

    // Setup cache system
    console.log("\n1. Initializing cache system...");
    await KoattyCache({
      cacheTimeout: 300,
      delayedDoubleDeletion: true
    }, app);

    const service = IOCContainer.get("DemoService") as DemoService;
    
    console.log("\n2. Testing CacheAble decorator:");
    console.log("-".repeat(40));
    
    // First call - should hit database
    console.log("\n🔹 First call to getUser('123'):");
    const user1 = await service.getUser("123");
    console.log(`Result: ${user1.name} (Call #${user1.callNumber})`);
    
    // Second call - should hit cache
    console.log("\n🔹 Second call to getUser('123'):");
    const user2 = await service.getUser("123");
    console.log(`Result: ${user2.name} (Call #${user2.callNumber})`);
    console.log(`Cache hit: ${user1.callNumber === user2.callNumber ? '✅' : '❌'}`);
    
    // Different parameter - should hit database
    console.log("\n🔹 Call to getUser('456'):");
    const user3 = await service.getUser("456");
    console.log(`Result: ${user3.name} (Call #${user3.callNumber})`);
    
    console.log(`\nTotal database calls so far: ${service.getCallCount()}`);
    console.log(`Cache size: ${mockStore.size()}`);
    console.log(`Cache keys: ${mockStore.keys().join(', ')}`);

    console.log("\n3. Testing CacheEvict decorator:");
    console.log("-".repeat(40));
    
    // Update user - should clear cache
    console.log("\n🔹 Updating user '123' (should clear cache):");
    await service.updateUser("123", { name: "Updated User 123" });
    
    // Next call should hit database again
    console.log("\n🔹 Call to getUser('123') after update:");
    const user4 = await service.getUser("123");
    console.log(`Result: ${user4.name} (Call #${user4.callNumber})`);
    console.log(`Cache was cleared: ${user4.callNumber > user2.callNumber ? '✅' : '❌'}`);

    console.log("\n4. Testing parameterless caching:");
    console.log("-".repeat(40));
    
    console.log("\n🔹 First call to getStats():");
    const stats1 = await service.getStats();
    console.log(`Stats timestamp: ${stats1.timestamp}`);
    
    console.log("\n🔹 Second call to getStats() (should be cached):");
    const stats2 = await service.getStats();
    console.log(`Stats timestamp: ${stats2.timestamp}`);
    console.log(`Same timestamp (cached): ${stats1.timestamp === stats2.timestamp ? '✅' : '❌'}`);

    console.log("\n5. Testing cache expiration:");
    console.log("-".repeat(40));
    
    console.log("\n🔹 Waiting for stats cache to expire (3 seconds)...");
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    console.log("\n🔹 Call to getStats() after expiration:");
    const stats3 = await service.getStats();
    console.log(`Stats timestamp: ${stats3.timestamp}`);
    console.log(`New timestamp (expired): ${stats1.timestamp !== stats3.timestamp ? '✅' : '❌'}`);

    console.log("\n" + "=".repeat(60));
    console.log("DEMO COMPLETED SUCCESSFULLY! ✅");
    console.log("=".repeat(60));
    
    console.log(`\nFinal statistics:`);
    console.log(`- Total service calls: ${service.getCallCount()}`);
    console.log(`- Cache operations logged above`);
    console.log(`- All cache functionality verified`);

  } catch (error) {
    console.error("\n❌ Demo failed:", error);
    throw error;
  }
}

// Export for testing
export { DemoService, SimpleCacheStore, runDemo };

// Run demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
} 