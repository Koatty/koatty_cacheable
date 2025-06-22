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
import { CacheOptions, injectCache } from "./inject";

export * from "./cache";

/** 
 * defaultOptions
 */
const defaultOptions: CacheOptions = {
  cacheTimeout: 300,
  delayedDoubleDeletion: true,
  redisConfig: {
    host: "localhost",
    port: 6379,
    password: "",
    db: 0,
    keyPrefix: "redlock:"
  }
}

/**
 * @param options - The options for the scheduled job
 * @param app - The Koatty application instance
 */
export async function KoattyCache(options: CacheOptions, app: Koatty) {
  options = { ...defaultOptions, ...options };
  // inject cache decorator
  await injectCache(options, app);
}