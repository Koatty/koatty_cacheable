/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2023-01-13 14:16:02
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as helper from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore, Store, StoreOptions } from "koatty_store";
import { Application, IOCContainer } from 'koatty_container';

/**
 * 
 *
 * @interface CacheStoreInterface
 */
interface CacheStoreInterface {
  store?: CacheStore;
}

// cacheStore
const cacheStore: CacheStoreInterface = {
  store: null
};

/**
 * get instances of cacheStore
 *
 * @export
 * @param {Application} app
 * @returns {*}  {CacheStore}
 */
export async function GetCacheStore(app: Application): Promise<CacheStore> {
  if (cacheStore.store && cacheStore.store.getConnection) {
    return cacheStore.store;
  }
  const opt: StoreOptions = app.config("CacheStore", "db") ?? {};
  if (helper.isEmpty(opt)) {
    logger.Warn(`Missing CacheStore server configuration. Please write a configuration item with the key name 'CacheStore' in the db.ts file.`);
  }
  cacheStore.store = Store.getInstance(opt);
  if (!helper.isFunction(cacheStore.store.getConnection)) {
    throw Error(`CacheStore connection failed. `);
  }
  return cacheStore.store;
}

/**
 * initiation CacheStore connection and client.
 *
 */
async function InitCacheStore() {
  const app = IOCContainer.getApp();
  app && app.once("appStart", async function () {
    await GetCacheStore(app);
  })
}

/**
 * Decorate this method to support caching. Redis server config from db.ts.
 * The cache method returns a value to ensure that the next time the method is executed with the same parameters,
 * the results can be obtained directly from the cache without the need to execute the method again.
 *
 * @export
 * @param {string} cacheName cache name
 * @param {number} [timeout=3600] cache timeout
 * @returns {MethodDecorator}
 */
export function CacheAble(cacheName: string, timeout = 3600): MethodDecorator {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }
    let identifier = IOCContainer.getIdentifier(target);
    identifier = identifier || (target.constructor ? (target.constructor.name || "") : "");
    const { value, configurable, enumerable } = descriptor;
    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        let cacheFlag = true;
        const store: CacheStore = await GetCacheStore(this.app).catch(() => {
          cacheFlag = false;
          logger.Error("Get cache store instance failed.");
          return null;
        });
        if (cacheFlag) {
          // tslint:disable-next-line: one-variable-per-declaration
          let key = "", res;
          if (props && props.length > 0) {
            key = `${identifier}:${methodName}:${helper.murmurHash(JSON.stringify(props))}`;
          } else {
            key = `${identifier}:${methodName}`;
          }

          res = await store.hget(cacheName, key).catch((): any => null);
          if (!helper.isEmpty(res)) {
            return JSON.parse(res);
          }
          // tslint:disable-next-line: no-invalid-this
          res = await value.apply(this, props);
          // prevent cache penetration
          if (helper.isEmpty(res)) {
            res = "";
            timeout = 60;
          }
          // async set store
          store.hset(cacheName, key, JSON.stringify(res), timeout).catch((): any => null);
          return res;
        } else {
          // tslint:disable-next-line: no-invalid-this
          return value.apply(this, props);
        }
      }
    };
    // bind app_ready hook event 
    InitCacheStore();
    return descriptor;
  };
}

/**
 * 
 */
export type eventTimes = "Before" | "After";

/**
 * Decorating the execution of this method will trigger a cache clear operation. Redis server config from db.ts.
 *
 * @export
 * @param {string} cacheName cacheName cache name
 * @param {eventTimes} [eventTime="Before"]
 * @returns
 */
export function CacheEvict(cacheName: string, eventTime: eventTimes = "Before") {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }
    const identifier = IOCContainer.getIdentifier(target);
    const { value, configurable, enumerable } = descriptor;
    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        let cacheFlag = true;
        const store: CacheStore = await GetCacheStore(this.app).catch(() => {
          cacheFlag = false;
          logger.Error("Get cache store instance failed.");
          return null;
        });

        if (cacheFlag) {
          if (eventTime === "Before") {
            await store.del(cacheName).catch((): any => null);
            // tslint:disable-next-line: no-invalid-this
            return value.apply(this, props);
          } else {
            // tslint:disable-next-line: no-invalid-this
            const res = await value.apply(this, props);
            store.del(cacheName).catch((): any => null);
            return res;
          }
        } else {
          // tslint:disable-next-line: no-invalid-this
          return value.apply(this, props);
        }
      }
    };
    // bind app_ready hook event 
    InitCacheStore();
    return descriptor;
  };
}

