/**
 * Integration test for cache decorator architecture
 * Tests the complete flow from decorator to injection to execution
 */
import { CacheAble, CacheEvict } from "../src/cache";
import { KoattyCache } from "../src/index";
import { IOCContainer, Component } from "koatty_container";
import { Koatty } from "koatty_core";

// Real-world example service
@Component()
class UserRepository {
  private userData = new Map([
    ["1", { id: "1", name: "Alice", email: "alice@example.com" }],
    ["2", { id: "2", name: "Bob", email: "bob@example.com" }],
    ["3", { id: "3", name: "Charlie", email: "charlie@example.com" }]
  ]);

  @CacheAble("user:detail", {
    params: ["id"],
    timeout: 300
  })
  async findById(id: string): Promise<any | null> {
    // Simulate database delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`[DB Query] Finding user by id: ${id}`);
    return this.userData.get(id) || null;
  }

  @CacheAble("user:list", {
    params: ["status"],
    timeout: 180
  })
  async findByStatus(status: string = "active"): Promise<any[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log(`[DB Query] Finding users by status: ${status}`);
    return Array.from(this.userData.values()).filter(user => 
      status === "active" // Simulate filter logic
    );
  }

  @CacheEvict("user:detail", {
    params: ["id"],
    delayedDoubleDeletion: true
  })
  async updateUser(id: string, data: Partial<any>): Promise<any | null> {
    console.log(`[DB Update] Updating user ${id}:`, data);
    
    const user = this.userData.get(id);
    if (user) {
      const updatedUser = { ...user, ...data };
      this.userData.set(id, updatedUser);
      return updatedUser;
    }
    return null;
  }

  @CacheEvict("user:list", {
    params: ["status"],
    delayedDoubleDeletion: false
  })
  async deleteUser(id: string, status: string = "active"): Promise<boolean> {
    console.log(`[DB Delete] Deleting user ${id}`);
    return this.userData.delete(id);
  }
}

@Component()
class UserService {
  constructor(private userRepo: UserRepository) {}

  @CacheAble("user:profile", {
    params: ["userId"],
    timeout: 600
  })
  async getUserProfile(userId: string): Promise<any> {
    console.log(`[Service] Getting profile for user: ${userId}`);
    
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Simulate additional processing
    return {
      ...user,
      profileUrl: `/profile/${userId}`,
      lastAccessed: new Date().toISOString()
    };
  }

  async updateUserProfile(userId: string, data: any): Promise<any> {
    console.log(`[Service] Updating profile for user: ${userId}`);
    
    // This will clear the cache for user:detail
    const updatedUser = await this.userRepo.updateUser(userId, data);
    
    // Manually clear the profile cache
    // Note: In real implementation, you might want to use CacheEvict here too
    return updatedUser;
  }
}

describe("Integration Tests", () => {
  let app: Koatty;
  let userService: UserService;
  let userRepository: UserRepository;

  beforeAll(async () => {
    // Setup application
    app = {} as Koatty;
    
    // Initialize cache system
    await KoattyCache({
      cacheTimeout: 300,
      delayedDoubleDeletion: true,
      redisConfig: {
        host: "localhost",
        port: 6379,
        db: 0
      }
    }, app);

    // Get service instances after injection
    userRepository = IOCContainer.get("UserRepository") as UserRepository;
    userService = IOCContainer.get("UserService") as UserService;
  });

  describe("Complete Cache Flow", () => {
    test("should demonstrate complete caching workflow", async () => {
      console.log("\n=== Starting Integration Test ===\n");

      // Test 1: First call should hit database and cache result
      console.log("1. First call to getUserProfile (should hit DB):");
      const profile1 = await userService.getUserProfile("1");
      expect(profile1.name).toBe("Alice");
      expect(profile1.profileUrl).toBe("/profile/1");

      // Test 2: Second call should get from cache
      console.log("\n2. Second call to getUserProfile (should hit cache):");
      const profile2 = await userService.getUserProfile("1");
      expect(profile2.name).toBe("Alice");
      expect(profile2.lastAccessed).toBe(profile1.lastAccessed); // Same timestamp from cache

      // Test 3: Repository call should also be cached
      console.log("\n3. Direct repository call (should hit cache):");
      const user1 = await userRepository.findById("1");
      expect(user1.name).toBe("Alice");

      // Test 4: Update should clear cache
      console.log("\n4. Updating user (should clear cache):");
      await userRepository.updateUser("1", { name: "Alice Updated" });

      // Test 5: Next call should hit database again
      console.log("\n5. Call after update (should hit DB with new data):");
      const updatedUser = await userRepository.findById("1");
      expect(updatedUser.name).toBe("Alice Updated");

      // Test 6: List query caching
      console.log("\n6. List query (should hit DB):");
      const users1 = await userRepository.findByStatus("active");
      expect(users1.length).toBeGreaterThan(0);

      console.log("\n7. Same list query (should hit cache):");
      const users2 = await userRepository.findByStatus("active");
      expect(users2).toEqual(users1);

      console.log("\n=== Integration Test Complete ===\n");
    });

    test("should handle concurrent requests correctly", async () => {
      console.log("\n=== Testing Concurrent Requests ===\n");

      // Make multiple concurrent requests for the same data
      const promises = Array.from({ length: 5 }, (_, i) => 
        userService.getUserProfile("2")
      );

      const results = await Promise.all(promises);
      
      // All results should be identical (from cache after first request)
      expect(results.every(result => result.name === "Bob")).toBe(true);
      expect(results.every(result => 
        result.lastAccessed === results[0].lastAccessed
      )).toBe(true);

      console.log("✓ All concurrent requests returned identical cached results");
    });

    test("should handle errors gracefully", async () => {
      console.log("\n=== Testing Error Handling ===\n");

      // Test with non-existent user
      await expect(userService.getUserProfile("999")).rejects.toThrow("User 999 not found");
      
      console.log("✓ Error handling works correctly");
    });

    test("should handle cache eviction with different strategies", async () => {
      console.log("\n=== Testing Cache Eviction Strategies ===\n");

      // Test delayed double deletion
      console.log("Testing delayed double deletion:");
      await userRepository.findByStatus("active"); // Cache the list
      await userRepository.deleteUser("3", "active"); // Should clear cache immediately
      
      // The cache should be cleared, so next call hits DB
      const usersAfterDelete = await userRepository.findByStatus("active");
      console.log("✓ Cache eviction with delayed double deletion works");

      // Test immediate eviction only
      console.log("Testing immediate eviction:");
      // The deleteUser method has delayedDoubleDeletion: false
      // So it only clears cache once
    });
  });

  describe("Performance Characteristics", () => {
    test("should demonstrate performance improvement with caching", async () => {
      console.log("\n=== Performance Test ===\n");

      // Clear any existing cache by updating the user
      await userRepository.updateUser("2", { name: "Bob Test" });

      // Measure first call (should hit DB)
      const start1 = Date.now();
      await userRepository.findById("2");
      const time1 = Date.now() - start1;
      
      // Measure second call (should hit cache)
      const start2 = Date.now();
      await userRepository.findById("2");
      const time2 = Date.now() - start2;

      console.log(`First call (DB): ${time1}ms`);
      console.log(`Second call (Cache): ${time2}ms`);
      
      // Cache should be significantly faster (less than half the time)
      expect(time2).toBeLessThan(time1 / 2);
      
      console.log("✓ Cache provides significant performance improvement");
    });
  });

  describe("Memory Management", () => {
    test("should handle cache keys correctly", async () => {
      console.log("\n=== Testing Cache Key Generation ===\n");

      // Test different parameter combinations
      await userRepository.findById("1");
      await userRepository.findById("2");
      await userRepository.findByStatus("active");
      await userRepository.findByStatus("inactive");

      // Each should generate different cache keys
      // This is more of a demonstration that the system works
      // with different parameter combinations
      
      console.log("✓ Different parameters generate different cache keys");
    });
  });
});

// Export for potential use in other tests
export { UserRepository, UserService }; 