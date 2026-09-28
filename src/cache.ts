/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2024-11-07 15:53:46
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IOCContainer } from 'koatty_container';
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore } from "koatty_store";
import { asyncDelayedExecution, generateCacheKey, getArgs, getParamIndex } from './utils';
import { GetCacheStore } from './store';

// Single flight is scoped to the store and final key, shared by both decorator modes.
const flights = new WeakMap<object, Map<string, Promise<any>>>();
async function cached(store: CacheStore, key: string, timeout: number, load: () => Promise<any>) {
  let active = flights.get(store);
  if (!active) { active = new Map(); flights.set(store, active); }
  if (active.has(key)) return active.get(key);
  const pending = (async () => {
    const raw = await store.get(key).catch((): undefined => undefined);
    if (typeof raw === 'string') {
      try {
        const envelope = JSON.parse(raw);
        if (envelope?.__koattyCache === 1 && Object.prototype.hasOwnProperty.call(envelope, 'value')) return envelope.value;
      } catch { /* Old/untyped entries are misses: their original type cannot be recovered. */ }
    }
    const value = await load();
    // Cache JSON-compatible values only. Unsupported objects retain their live return type.
    const supported = (v: any): boolean => v === null || typeof v === 'string' || typeof v === 'boolean'
      || (typeof v === 'number' && Number.isFinite(v))
      || (Array.isArray(v) && v.every(supported))
      || (v && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(supported));
    try {
      if (supported(value)) await store.set(key, JSON.stringify({ __koattyCache: 1, value }), timeout);
    } catch (error) { logger.error('Cache set error:' + (error as Error).message); }
    return value;
  })();
  active.set(key, pending);
  try { return await pending; } finally { active.delete(key); }
}

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
}) {
  return IOCContainer.createDecorator(({ target, methodName, descriptor, method, context }) => {
    const mergedOpt = { ...{ params: [], timeout: 300 }, ...opt };

    if (context) {
      // TC39 path
      // Component type check via addInitializer
      context.addInitializer?.(function (this: any) {
        const componentType = IOCContainer.getType(this.constructor);
        if (!["SERVICE", "COMPONENT"].includes(componentType)) {
          throw Error("This decorator only used in the service、component class.");
        }
      });

      // Get the parameter list of the method
      const originalMethod = method!;
      const funcParams = getArgs(originalMethod as (...args: any[]) => any);
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

      return async function (this: any, ...props: any[]) {
        const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
          logger.error("Get cache store instance failed." + e.message);
          return null;
        });
        if (store) {
          const key = generateCacheKey(cacheName, paramIndexes, mergedOpt.params, props);
          return cached(store, key, mergedOpt.timeout, () => originalMethod.apply(this, props));
        } else {
          return originalMethod.apply(this, props);
        }
      };
    } else {
      // Legacy path
      const componentType = IOCContainer.getType(target);
      if (!["SERVICE", "COMPONENT"].includes(componentType)) {
        throw Error("This decorator only used in the service、component class.");
      }

      const { value, configurable, enumerable } = descriptor!;

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

      return {
        configurable,
        enumerable,
        writable: true,
        async value(this: any, ...props: any[]) {
          const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
            logger.error("Get cache store instance failed." + e.message);
            return null;
          });
          if (store) {
            const key = generateCacheKey(cacheName, paramIndexes, mergedOpt.params, props);
            return cached(store, key, mergedOpt.timeout, () => value.apply(this, props));
          } else {
            // tslint:disable-next-line: no-invalid-this
            return value.apply(this, props);
          }
        }
      };
    }
  }, 'method');
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
  return IOCContainer.createDecorator(({ target, methodName, descriptor, method, context }) => {
    const mergedOpt = { ...{ delayedDoubleDeletion: true, }, ...opt };

    if (context) {
      // TC39 path
      // Component type check via addInitializer
      context.addInitializer?.(function (this: any) {
        const componentType = IOCContainer.getType(this.constructor);
        if (!["SERVICE", "COMPONENT"].includes(componentType)) {
          throw Error("This decorator only used in the service、component class.");
        }
      });

      const originalMethod = method!;
      // Get the parameter list of the method
      const funcParams = getArgs(originalMethod as (...args: any[]) => any);
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
        logger.Warn(`CacheEvict: Parameter(s) [${invalidParams.join(", ")}] not found in method ${String(methodName)}. These parameters will be ignored.`);
      }

      return async function (this: any, ...props: any[]) {
        const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
          logger.error("Get cache store instance failed." + e.message);
          return null;
        });

        if (store) {
          const key = generateCacheKey(cacheName, paramIndexes, mergedOpt.params || [], props);

          const result = await originalMethod.apply(this, props);
          store.del(key).catch((e: Error) => {
            logger.error("Cache delete error:" + e.message);
          });

          if (mergedOpt.delayedDoubleDeletion) {
            const delayTime = mergedOpt.delayTime || 5000;
            asyncDelayedExecution(() => {
              store.del(key).catch((e: Error) => {
                logger.error("Cache double delete error:" + e.message);
              });
            }, delayTime);
          }
          return result;
        } else {
          // If store is not available, execute method directly
          return originalMethod.apply(this, props);
        }
      };
    } else {
      // Legacy path
      const componentType = IOCContainer.getType(target);
      if (!["SERVICE", "COMPONENT"].includes(componentType)) {
        throw Error("This decorator only used in the service、component class.");
      }
      const { value, configurable, enumerable } = descriptor!;
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
        logger.Warn(`CacheEvict: Parameter(s) [${invalidParams.join(", ")}] not found in method ${String(methodName)}. These parameters will be ignored.`);
      }

      return {
        configurable,
        enumerable,
        writable: true,
        async value(this: any, ...props: any[]) {
          const store: CacheStore = await GetCacheStore().catch((e: Error): null => {
            logger.error("Get cache store instance failed." + e.message);
            return null;
          });

          if (store) {
            const key = generateCacheKey(cacheName, paramIndexes, mergedOpt.params || [], props);

            const result = await value.apply(this, props);
            store.del(key).catch((e: Error) => {
              logger.error("Cache delete error:" + e.message);
            });

            if (mergedOpt.delayedDoubleDeletion) {
              const delayTime = mergedOpt.delayTime || 5000;
              asyncDelayedExecution(() => {
                store.del(key).catch((e: Error) => {
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
    }
  }, 'method');
}
