/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 16:00:02
 * @LastEditTime: 2024-11-07 16:00:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore, StoreOptions } from "koatty_store";

/**
 * 
 *
 * @interface CacheStoreInterface
 */
interface CacheStoreInterface {
  store?: CacheStore;
}

// storeCache
const storeCache: CacheStoreInterface = {
  store: null
};

// Promise to track initialization in progress
let initPromise: Promise<CacheStore> | null = null;

/**
 * get instances of storeCache
 *
 * @export
 * @param {StoreOptions} options
 * @returns {*}  {CacheStore}
 */
export async function GetCacheStore(options?: StoreOptions): Promise<CacheStore> {
  // Return existing store if available
  if (storeCache.store && storeCache.store.getConnection) {
    return storeCache.store;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  if (Helper.isEmpty(options)) {
    if (!storeCache.store) {
      logger.Warn(`CacheStore not initialized. Please call KoattyCached() first with proper options in your application startup.`);
    }
    return storeCache.store || null;
  }

  // Start initialization and track it
  initPromise = (async () => {
    try {
      storeCache.store = CacheStore.getInstance(options);
      if (!Helper.isFunction(storeCache.store.getConnection)) {
        throw Error(`CacheStore connection failed. `);
      }
      await storeCache.store.client.getConnection();
      return storeCache.store;
    } finally {
      // Clear init promise after completion
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Close cache store connection for cleanup (mainly for testing)
 */
export async function CloseCacheStore(): Promise<void> {
  if (storeCache.store) {
    try {
      if (storeCache.store.client) {
        const client = storeCache.store.client as any;
        if (typeof client.quit === 'function') {
          await client.quit();
        } else if (typeof client.close === 'function') {
          await client.close();
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  
  // Clear the CacheStore singleton instance
  try {
    await CacheStore.clearAllInstances();
  } catch {
    // Ignore cleanup errors
  }
  
  // Always clear the cache
  storeCache.store = null;
  initPromise = null;
}