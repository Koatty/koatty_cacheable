import { CacheAble, CacheEvict } from '../src/index';
/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 13:57:33
 * @LastEditTime: 2024-11-07 15:18:06
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

export class TestClass {

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

  @CacheEvict("delayed", {
    params: ["id"],
    delayedDoubleDeletion: true,
    delayTime: 2000
  })
  runDelayed(id: string) {
    return "delayed";
  }

  @CacheAble("concurrent", {
    params: ["id"]
  })
  async runConcurrent(id: string) {
    // 模拟异步操作
    await new Promise(resolve => setTimeout(resolve, 100));
    return `result-${id}`;
  }

  @CacheAble("edge", {
    params: ["key"]
  })
  runEdgeCase(key: string) {
    return `edge-${key}`;
  }

  @CacheAble("noparams")
  runNoParams() {
    return "no-params";
  }

  @CacheAble("invalid", {
    params: ["nonExistentParam"]
  })
  runWithInvalidParam(realParam: string) {
    return `invalid-${realParam}`;
  }
}