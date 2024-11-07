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
import { GetCacheStore } from "../src/utils";
import { TestClass } from "./test";

const clazz = new TestClass();

describe("Cache", () => {
  beforeAll(async () => {
    await clazz.run("tom", 11);
  })
  test("CacheAble", async () => {
    const cs = await GetCacheStore();
    await cs.set("run:name:tom", "222")
    assert.equal(await cs.get("run:name:tom"), "222")
  })

  test("CacheEvict", async () => {
    const cs = await GetCacheStore();
    const res = await clazz.run2("tom", 11);
    assert.equal(res, "234")
    assert.equal(await cs.get("run:name:tom"), null)
  })

})