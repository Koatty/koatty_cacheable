/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2024-11-07 16:00:02
 * @LastEditTime: 2024-11-07 16:00:05
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Application, IOCContainer } from "koatty_container";
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

/**
 * get instances of storeCache
 *
 * @export
 * @param {Application} app
 * @returns {*}  {CacheStore}
 */
export async function GetCacheStore(app?: Application): Promise<CacheStore> {
  if (storeCache.store && storeCache.store.getConnection) {
    return storeCache.store;
  }
  let opt: StoreOptions = {
    type: "memory",
    db: 0,
    timeout: 30
  };
  if (app && Helper.isFunction(app.config)) {
    opt = app.config("CacheStore") || app.config("CacheStore", "db");
    if (Helper.isEmpty(opt)) {
      logger.Warn(`Missing CacheStore server configuration. Please write a configuration item with the key name 'CacheStore' in the db.ts file.`);
    }
  }

  storeCache.store = CacheStore.getInstance(opt);
  if (!Helper.isFunction(storeCache.store.getConnection)) {
    throw Error(`CacheStore connection failed. `);
  }
  await storeCache.store.client.getConnection();
  return storeCache.store;
}

/**
 * initiation CacheStore connection and client.
 *
 */
export async function InitCacheStore() {
  if (storeCache.store) {
    return;
  }

  const app = IOCContainer.getApp();
  app?.once("appReady", async () => {
    await GetCacheStore(app);
  });
}