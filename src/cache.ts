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
import { asyncDelayedExecution, generateCacheKey, getArgs, getParamIndex } from './utils';
import { GetCacheStore } from './store';

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
  // delay time for double deletion in milliseconds, default 5000
  delayTime?: number;
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
    const paramIndexes = getParamIndex(funcParams, mergedOpt.params || []);
    
    // Validate parameters
    const invalidParams: string[] = [];
    (mergedOpt.params || []).forEach((param, index) => {
      if (paramIndexes[index] === -1) {
        invalidParams.push(param);
      }
    });
    if (invalidParams.length > 0) {
      logger.Warn(`CacheAble: Parameter(s) [${invalidParams.join(", ")}] not found in method ${String(methodName)}. These parameters will be ignored.`);
    }
    
    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
          logger.error("Get cache store instance failed." + e.message);
          return null;
        });
        if (store) {
          const key = generateCacheKey(cacheName, paramIndexes, mergedOpt.params, props);
          const res = await store.get(key).catch((e: Error): undefined => {
            logger.error("Cache get error:" + e.message)
          });
          if (!Helper.isEmpty(res)) {
            try {
              return JSON.parse(res);
            } catch (e) {
              const error = e as Error;
              logger.error("Cache JSON parse error:" + error.message);
              // 如果解析失败，删除损坏的缓存，重新执行方法
              store.del(key).catch((err: Error): undefined => {
                logger.error("Cache del error after parse failure:" + err.message);
              });
            }
          }
          const result = await value.apply(this, props);
          // async refresh store
          store.set(key, Helper.isJSONObj(result) ? JSON.stringify(result) : result,
            mergedOpt.timeout).catch((e: Error): undefined => {
              logger.error("Cache set error:" + e.message)
            });
          return result;
        } else {
          // tslint:disable-next-line: no-invalid-this
          return value.apply(this, props);
        }
      }
    };
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
    const paramIndexes = getParamIndex(funcParams, opt.params || []);
    
    // Validate parameters
    const invalidParams: string[] = [];
    (opt.params || []).forEach((param, index) => {
      if (paramIndexes[index] === -1) {
        invalidParams.push(param);
      }
    });
    if (invalidParams.length > 0) {
      logger.Warn(`CacheEvict: Parameter(s) [${invalidParams.join(", ")}] not found in method ${String(methodName)}. These parameters will be ignored.`);
    }

    descriptor = {
      configurable,
      enumerable,
      writable: true,
      async value(...props: any[]) {
        const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
          logger.error("Get cache store instance failed." + e.message);
          return null;
        });

        if (store) {
          const key = generateCacheKey(cacheName, paramIndexes, opt.params || [], props);

          const result = await value.apply(this, props);
          store.del(key).catch((e: Error): undefined => {
            logger.error("Cache delete error:" + e.message);
          });

          if (opt.delayedDoubleDeletion) {
            const delayTime = opt.delayTime || 5000;
            asyncDelayedExecution(() => {
              store.del(key).catch((e: Error): undefined => {
                logger.error("Cache double delete error:" + e.message);
              });
            }, delayTime);
          }
          return result;
        } else {
          // If store is not available, execute method directly
          return value.apply(this, props);
        }
      }
    };
    return descriptor;
  }
}
