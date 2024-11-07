/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2024-11-07 15:53:46
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IOCContainer } from 'koatty_container';
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore } from "koatty_store";
import { asyncDelayedExecution, getArgs, GetCacheStore, getParamIndex, InitCacheStore } from './utils';

const longKey = 128;

/**
 * @description: 
 * @return {*}
 */
export interface CacheAbleOpt {
  // parameter name array
  params?: string[];
  // cache validity period, seconds
  timeout?: number;
}

/**
 * @description: 
 * @return {*}
 */
export interface CacheEvictOpt {
  // parameter name array
  params?: string[];
  // enable the delayed double deletion strategy
  delayedDoubleDeletion?: boolean;
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
    if (!["SERVICE", "COMPONENT"].includes(componentType)) {
      throw Error("This decorator only used in the service、component class.");
    }

    const { value, configurable, enumerable } = descriptor;
    const mergedOpt = { ...{ params: [], timeout: 300 }, ...opt };

    // Get the parameter list of the method
    const funcParams = getArgs((<any>target)[methodName]);
    // Get the defined parameter location
    const paramIndexes = getParamIndex(funcParams, opt.params);
    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        const store: CacheStore = await GetCacheStore(this.app).catch((e): any => {
          logger.Error("Get cache store instance failed." + e.message);
          return null;
        });
        if (store) {
          let key = cacheName;
          for (const item of paramIndexes) {
            if (props[item] !== undefined) {
              key += `:${mergedOpt.params[item]}:${Helper.toString(props[item])}`;
            }
          }
          key = key.length > longKey ? Helper.murmurHash(key) : key;
          const res = await store.get(key).catch((e): any => {
            logger.error("Cache get error:" + e.message)
          });
          if (!Helper.isEmpty(res)) {
            return JSON.parse(res);
          }
          const result = await value.apply(this, props);
          // async refresh store
          store.set(key, Helper.isJSONObj(result) ? JSON.stringify(result) : result,
            mergedOpt.timeout).catch((e): any => {
              logger.error("Cache set error:" + e.message)
            });
          return result;
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
    if (!["SERVICE", "COMPONENT"].includes(componentType)) {
      throw Error("This decorator only used in the service、component class.");
    }
    const { value, configurable, enumerable } = descriptor;
    opt = { ...{ delayedDoubleDeletion: true, }, ...opt }
    // Get the parameter list of the method
    const funcParams = getArgs((<any>target)[methodName]);
    // Get the defined parameter location
    const paramIndexes = getParamIndex(funcParams, opt.params);

    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        const store: CacheStore = await GetCacheStore(this.app).catch((e): any => {
          logger.Error("Get cache store instance failed." + e.message);
          return null;
        });

        if (store) {
          let key = cacheName;
          for (const item of paramIndexes) {
            if (props[item] !== undefined) {
              key += `:${opt.params[item]}:${Helper.toString(props[item])}`;
            }
          }
          key = key.length > longKey ? Helper.murmurHash(key) : key;

          const result = await value.apply(this, props);
          store.del(key).catch((e): any => {
            logger.Error("Cache delete error:" + e.message);
          });

          if (opt.delayedDoubleDeletion) {
            asyncDelayedExecution(() => {
              store.del(key).catch((e): any => {
                logger.error("Cache double delete error:" + e.message);
              });
            }, 5000);
            return result;
          } else {
            // tslint:disable-next-line: no-invalid-this
            return value.apply(this, props);
          }
        }
      }
    };
    // bind app_ready hook event 
    InitCacheStore();
    return descriptor;
  }
}
