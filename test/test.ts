/**
 * Simple test to verify basic functionality
 */
import { CacheAble, CacheEvict } from '../src/cache';
import { CacheManager } from '../src/manager';
import { Component } from 'koatty_container';
/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 13:57:33
 * @LastEditTime: 2024-11-07 15:18:06
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

// Simple mock store
class MockStore {
  private data = new Map<string, any>();

  async get(key: string): Promise<any> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

@Component("TestClass", "COMPONENT")
class TestClass {
  @CacheAble("test", { params: ["id"] })
  async test(id: string): Promise<string> {
    return `result-${id}`;
  }

  @CacheAble("run", {
    params: ['name']
  })
  run(name: string, age: number) {
    return "123";
  }

  @CacheEvict("run", {
    params: ["name"]
  })
  run2(name: string, age: number) {
    return "234";
  }
}

// Basic test
async function runTest() {
  console.log('Running basic cache test...');
  
  // Setup cache manager
  const store = new MockStore();
  const manager = CacheManager.getInstance();
  manager.setCacheStore(store as any);
  
  // Test the functionality
  const instance = new TestClass();
  
  const result1 = await instance.test('123');
  const result2 = await instance.test('123');
  
  console.log('Result 1:', result1);
  console.log('Result 2:', result2);
  console.log('Cache working:', result1 === result2);
  
  await store.close();
  manager.setCacheStore(null);
}

if (require.main === module) {
  runTest().catch(console.error);
}

export { TestClass, MockStore, runTest };