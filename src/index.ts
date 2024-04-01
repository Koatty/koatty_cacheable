/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2024-04-01 15:44:15
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore, StoreOptions } from "koatty_store";
import { Application, IOCContainer } from 'koatty_container';

const longKey = 128;
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
export async function GetCacheStore(app: Application): Promise<CacheStore> {
  if (storeCache.store && storeCache.store.getConnection) {
    return storeCache.store;
  }
  const opt: StoreOptions = app.config("CacheStore") ?? app.config("CacheStore", "db") ?? {};
  if (Helper.isEmpty(opt)) {
    logger.Warn(`Missing CacheStore server configuration. Please write a configuration item with the key name 'CacheStore' in the db.ts file.`);
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
async function InitCacheStore() {
  if (storeCache.store !== null) {
    return;
  }
  const app = IOCContainer.getApp();
  app && app.once("appReady", async function () {
    await GetCacheStore(app);
  })
}

/**
 * @description: 
 * @return {*}
 */
export interface CacheAbleOpt {
  params?: string[];
  timeout?: number;
}

/**
 * Decorate this method to support caching. 
 * The cache method returns a value to ensure that the next time 
 * the method is executed with the same parameters, the results can be obtained
 * directly from the cache without the need to execute the method again.
 * CacheStore server config defined in db.ts.
 * 
 * @export
 * @param {string} cacheName cache name
 * @param {CacheAbleOpt} [opt] cache options
 * e.g: 
 * {
 *  params: ["id"],
 *  timeout: 30
 * }
 * Use the 'id' parameters of the method as cache subkeys, the cache expiration time 30s
 * @returns {MethodDecorator}
 */
export function CacheAble(cacheName: string, opt: CacheAbleOpt = {
  params: [],
  timeout: 300,
}): MethodDecorator {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }

    const { value, configurable, enumerable } = descriptor;
    opt = {
      ...{
        params: [],
        timeout: 300,
      }, ...opt
    }
    // 获取定义的参数位置
    const paramIndexes = getParamIndex(opt.params);
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
          let key = cacheName;
          if (props && props.length > 0) {
            for (const item of paramIndexes) {
              if (props[item] !== undefined) {
                const value = Helper.toString(props[item]);
                key += `:${opt.params[item]}:${value}`;
              }
            }
            // 防止key超长
            if (key.length > longKey) {
              key = Helper.murmurHash(key);
            }
          }

          let res = await store.get(key).catch((): any => null);
          if (!Helper.isEmpty(res)) {
            return JSON.parse(res);
          }
          // tslint:disable-next-line: no-invalid-this
          res = await value.apply(this, props);
          // prevent cache penetration
          if (Helper.isTrueEmpty(res)) {
            res = "";
          }
          // async set store
          store.set(key, JSON.stringify(res), opt.timeout).catch((): any => null);
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
 * @description: 
 * @return {*}
 */
export interface CacheEvictOpt {
  params?: string[];
  delayedDoubleDeletion?: boolean;
}

/**
 * Decorating the execution of this method will trigger a cache clear operation. 
 * CacheStore server config defined in db.ts.
 *
 * @export
 * @param {string} cacheName cacheName cache name
 * @param {CacheEvictOpt} [opt] cache options
 * e.g: 
 * {
 *  params: ["id"],
 *  delayedDoubleDeletion: true
 * }
 * Use the 'id' parameters of the method as cache subkeys,
 *  and clear the cache after the method executed
 * @returns
 */
export function CacheEvict(cacheName: string, opt: CacheEvictOpt = {
  delayedDoubleDeletion: true,
}) {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (componentType !== "SERVICE" && componentType !== "COMPONENT") {
      throw Error("This decorator only used in the service、component class.");
    }
    const { value, configurable, enumerable } = descriptor;
    // 获取定义的参数位置
    opt = {
      ...{
        eventTime: "Before",
      }, ...opt
    }
    const paramIndexes = getParamIndex(opt.params);
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
          let key = cacheName;
          if (props && props.length > 0) {
            for (const item of paramIndexes) {
              if (props[item] !== undefined) {
                const value = Helper.toString(props[item]);
                key += `:${opt.params[item]}:${value}`;
              }
            }
            // 防止key超长
            if (key.length > longKey) {
              key = Helper.murmurHash(key);
            }
          }

          // tslint:disable-next-line: no-invalid-this
          const res = await value.apply(this, props);
          store.del(key).catch((): any => null);
          if (opt.delayedDoubleDeletion) {
            asyncDelayedExecution(2000, () => {
              store.del(key).catch((): any => null);
            });
          }
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
 * @description: 
 * @param {*} func
 * @return {*}
 */
function getArgs(func: Function) {
  // 首先匹配函数括弧里的参数
  const args = func.toString().match(/.*?\(([^)]*)\)/);
  if (args.length > 1) {
    // 分解参数成数组
    return args[1].split(",").map(function (a) {
      // 去空格和内联注释
      return a.replace(/\/\*.*\*\//, "").trim();
    }).filter(function (ae) {
      // 确保没有undefineds
      return ae;
    });
  }
  return [];
}

/**
 * @description: 
 * @param {string[]} params
 * @return {*}
 */
function getParamIndex(params: string[]): number[] {
  const res = [];
  for (let i = 0; i < params.length; i++) {
    if (params.includes(params[i])) {
      res.push(i);
    }
  }
  return res;
}

/**
 * 
 * @param ms 
 * @returns 
 */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * async delayed execution func
 * @param ms 
 * @param fn 
 * @returns 
 */
async function asyncDelayedExecution(ms: number, fn: Function) {
  await delay(ms); // delay ms second
  return fn();
}