/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 16:00:02
 * @LastEditTime: 2024-11-07 16:00:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Koatty } from "koatty_core";
import { StoreOptions } from "koatty_store";
import { CloseCacheStore, GetCacheStore } from "./store";

export * from "./cache";
export * from "./store";

/** 
 * defaultOptions
 */

const defaultOptions: StoreOptions = {
  type: "memory",
  db: 0,
  timeout: 30
}

/**
 * @param options - The options for the cached options
 * @param app - The Koatty application instance
 */
export async function KoattyCached(options: StoreOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };

  app.once("appReady", async function () {
    // 初始化缓存存储
    await GetCacheStore(options);
  });

  app.on("appStop", async function () {
    // 关闭缓存存储
    await CloseCacheStore();
  });
}