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
}