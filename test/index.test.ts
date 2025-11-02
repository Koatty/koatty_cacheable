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

const clazz = new TestClass();

describe("Cache", () => {
  beforeAll(async () => {
    // 初始化缓存存储
    await GetCacheStore({
      type: "memory",
      db: 0,
      timeout: 30
    });
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
    const res = await clazz.run2("tom", 11);
    assert.equal(res, "234");
    assert.equal(await cs.get("run:name:tom"), null);
  });

  test("JSON parse failure handling", async () => {
    const cs = await GetCacheStore();
    // 设置无效的 JSON 字符串到缓存
    await cs.set("run:name:invalid", "invalid json {");
    
    // 调用方法，应该能正常执行而不抛出异常
    const res = await clazz.run("invalid", 11);
    
    // 验证方法返回了正确的结果（而不是损坏的缓存）
    assert.equal(res, "123");
    
    // 验证损坏的缓存已被删除或重新设置为有效值
    const cachedValue = await cs.get("run:name:invalid");
    // 由于缓存了方法返回值，缓存应该是字符串 "123" 或被删除后重新设置
    assert.ok(cachedValue === "123" || cachedValue === null);
  });

  test("Cache store unavailable", async () => {
    // 清理现有缓存连接，模拟缓存不可用场景
    await CloseCacheStore();
    
    // 创建新的测试类实例（避免使用已初始化的实例）
    const testClazz = new TestClass();
    
    // 调用方法，应该能正常执行而不抛出异常（降级处理）
    const res = await testClazz.run("unavailable", 11);
    
    // 验证方法正常执行并返回正确结果
    assert.equal(res, "123");
  });
});

describe("Cache Delayed Deletion", () => {
  beforeAll(async () => {
    // 为延迟双删测试单独初始化缓存
    await GetCacheStore({
      type: "memory",
      db: 0,
      timeout: 30
    });
  });

  afterAll(async () => {
    // 清理缓存连接
    await CloseCacheStore();
  });

  test("Delayed double deletion", async () => {
    const cs = await GetCacheStore();
    
    // 设置一个缓存值
    await cs.set("delayed:id:test1", "initial");
    
    // 验证缓存存在
    assert.equal(await cs.get("delayed:id:test1"), "initial");
    
    // 调用 CacheEvict 方法（启用延迟双删，延迟时间 2000ms）
    const testClazz = new TestClass();
    const res = await testClazz.runDelayed("test1");
    assert.equal(res, "delayed");
    
    // 立即验证缓存被删除（第一次删除）
    assert.equal(await cs.get("delayed:id:test1"), null);
    
    // 重新设置缓存（模拟并发写入场景）
    await cs.set("delayed:id:test1", "concurrent");
    assert.equal(await cs.get("delayed:id:test1"), "concurrent");
    
    // 等待 2.5 秒，超过延迟时间
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // 验证缓存再次被删除（第二次删除生效）
    assert.equal(await cs.get("delayed:id:test1"), null);
  }, 10000); // 设置超时时间为 10 秒

  test("Concurrent cache access", async () => {
    const testClazz = new TestClass();
    
    // 并发调用同一个方法（相同参数）10 次
    const promises = Array(10).fill(0).map(() => testClazz.runConcurrent("test2"));
    
    // 等待所有调用完成
    const results = await Promise.all(promises);
    
    // 验证所有调用返回相同的结果
    const expectedResult = "result-test2";
    results.forEach(result => {
      assert.equal(result, expectedResult);
    });
    
    // 验证缓存被正确设置
    const cs = await GetCacheStore();
    const cachedValue = await cs.get("concurrent:id:test2");
    assert.ok(cachedValue === expectedResult || cachedValue === `"${expectedResult}"`);
  });

  test("Concurrent cache initialization", async () => {
    // 清理现有缓存以测试并发初始化
    await CloseCacheStore();
    
    // 并发调用 GetCacheStore 10 次
    const options = {
      type: "memory" as const,
      db: 0,
      timeout: 30
    };
    
    const promises = Array(10).fill(0).map(() => GetCacheStore(options));
    
    // 等待所有调用完成
    const stores = await Promise.all(promises);
    
    // 验证所有调用返回有效的 store
    stores.forEach(store => {
      assert.ok(store !== null, "Store should not be null");
      assert.ok(store.client !== undefined, "Store should have client");
    });
    
    // 验证所有 store 是同一个实例
    const firstStore = stores[0];
    stores.forEach(store => {
      assert.equal(store, firstStore, "All stores should be the same instance");
    });
  });

  test("Cache key generation edge cases", async () => {
    const cs = await GetCacheStore();
    const testClazz = new TestClass();
    
    // 测试长键（超过 128 字符）
    const longValue = "a".repeat(150);
    const res1 = await testClazz.runEdgeCase(longValue);
    assert.equal(res1, `edge-${longValue}`);
    
    // 验证缓存键被 hash（因为超过 128 字符）
    const longKey = `edge:key:${longValue}`;
    // 由于键太长，应该被 hash，直接查询原始键应该找不到
    const directValue = await cs.get(longKey);
    assert.equal(directValue, null);
    
    // 但再次调用方法应该能从缓存获取
    const res1Cached = await testClazz.runEdgeCase(longValue);
    assert.equal(res1Cached, res1);
    
    // 测试特殊字符
    const specialChars = "test:with/special chars";
    const res2 = await testClazz.runEdgeCase(specialChars);
    assert.equal(res2, `edge-${specialChars}`);
    
    // 验证缓存能正常工作
    const res2Cached = await testClazz.runEdgeCase(specialChars);
    assert.equal(res2Cached, res2);
    
    // 测试空字符串
    const res3 = await testClazz.runEdgeCase("");
    assert.equal(res3, "edge-");
    
    // 测试无参数缓存
    const res4 = await testClazz.runNoParams();
    assert.equal(res4, "no-params");
    
    // 验证无参数缓存键格式
    const noParamsValue = await cs.get("noparams");
    assert.ok(noParamsValue === "no-params" || noParamsValue === '"no-params"');
  });
})