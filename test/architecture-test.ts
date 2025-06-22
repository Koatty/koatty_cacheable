/**
 * Architecture refactoring test example
 * Demonstrates how decorators integrate with IOC container
 */
import { CacheAble, CacheEvict } from "../src/cache";
import { KoattyCache } from "../src/index";
import { IOCContainer, Component } from "koatty_container";
import { Koatty } from "koatty_core";

// Example service class
@Component()
class UserService {
  
  // Use CacheAble decorator - now only collects metadata
  @CacheAble("user:profile", {
    params: ["userId"],
    timeout: 600
  })
  async getUserProfile(userId: string): Promise<any> {
    console.log(`Getting user ${userId} profile from database`);
    return {
      id: userId,
      name: `User${userId}`,
      email: `user${userId}@example.com`,
      createdAt: new Date()
    };
  }

  // Use CacheEvict decorator - now only collects metadata
  @CacheEvict("user:profile", {
    params: ["userId"],
    delayedDoubleDeletion: true
  })
  async updateUserProfile(userId: string, data: any): Promise<any> {
    console.log(`Updating user ${userId} profile`, data);
    return {
      id: userId,
      ...data,
      updatedAt: new Date()
    };
  }

  // Regular method without cache decorator
  async deleteUser(userId: string): Promise<void> {
    console.log(`Deleting user ${userId}`);
  }
}

// Example component class
@Component()
class ProductService {
  
  @CacheAble("product:list", {
    params: ["category", "page"],
    timeout: 300
  })
  async getProductList(category: string, page: number = 1): Promise<any> {
    console.log(`Getting product list for category ${category} page ${page}`);
    return {
      category,
      page,
      products: [
        { id: 1, name: "Product1", price: 100 },
        { id: 2, name: "Product2", price: 200 }
      ]
    };
  }

  @CacheEvict("product:list", {
    params: ["category"],
    delayedDoubleDeletion: false
  })
  async addProduct(category: string, product: any): Promise<any> {
    console.log(`Adding product to category ${category}`, product);
    return { id: Date.now(), ...product };
  }
}

/**
 * Simulate application startup process
 */
async function simulateAppStart() {
  console.log("=== Simulating Application Startup Process ===");
  
  // Create mock Koatty application instance
  const app = {} as Koatty;
  
  // Configure cache options
  const cacheOptions = {
    cacheTimeout: 300,
    delayedDoubleDeletion: true,
    redisConfig: {
      host: "localhost",
      port: 6379,
      db: 0,
      keyPrefix: "test:"
    }
  };

  console.log("1. Decorators have collected metadata to IOC container");
  
  // Call KoattyCache for cache injection
  console.log("2. Starting cache injection...");
  await KoattyCache(cacheOptions, app);
  
  console.log("3. Cache injection completed, testing cache functionality");
  
  // Get injected service instances for testing
  const userService = IOCContainer.get("UserService") as UserService;
  const productService = IOCContainer.get("ProductService") as ProductService;
  
  if (userService && productService) {
    console.log("\n=== Testing User Service Cache ===");
    
    // First call - should execute original method and cache result
    await userService.getUserProfile("123");
    
    // Second call - should get from cache
    await userService.getUserProfile("123");
    
    // Update user profile - should clear cache
    await userService.updateUserProfile("123", { name: "New Name" });
    
    console.log("\n=== Testing Product Service Cache ===");
    
    // First call - should execute original method and cache result
    await productService.getProductList("electronics", 1);
    
    // Second call - should get from cache
    await productService.getProductList("electronics", 1);
    
    // Add product - should clear related cache
    await productService.addProduct("electronics", { name: "New Product", price: 150 });
    
    console.log("\n=== Architecture refactoring test completed ===");
  } else {
    console.error("Cannot get service instances, possible IOC container configuration issue");
  }
}

// Export test functions
export { simulateAppStart, UserService, ProductService };

// If running this file directly, execute test
if (require.main === module) {
  simulateAppStart().catch(console.error);
} 