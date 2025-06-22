/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2024-11-07 15:53:46
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IOCContainer } from 'koatty_container';
import { Helper } from 'koatty_lib';
import { Logger } from 'koatty_logger';

// Create logger instance
const logger = new Logger();
import { getArgs, getParamIndex, generateCacheKey, asyncDelayedExecution } from './utils';
import { CacheManager } from './manager';

// Define cache decorator types
export enum DecoratorType {
  CACHE_EVICT = "CACHE_EVICT",
  CACHE_ABLE = "CACHE_ABLE",
}

// IOC container key constant
const COMPONENT_CACHE = "COMPONENT_CACHE";
export const CACHE_METADATA_KEY = "CACHE_METADATA_KEY";

/**
 * @description: CacheAble decorator options
 */
export interface CacheAbleOpt {
  // parameter name array
  params?: string[];
  // cache validity period, seconds
  timeout?: number;
  // cache name (optional, auto-generated if not provided)
  cacheName?: string;
}

/**
 * @description: CacheEvict decorator options
 */
export interface CacheEvictOpt {
  // parameter name array
  params?: string[];
  // enable the delayed double deletion strategy
  delayedDoubleDeletion?: boolean;
  // cache name (optional, auto-generated if not provided)
  cacheName?: string;
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
export function CacheAble(cacheNameOrOpt?: string | CacheAbleOpt, opt: CacheAbleOpt = {}): MethodDecorator {
  // Handle overloaded parameters
  let cacheName: string | undefined;
  let options: CacheAbleOpt;
  
  if (typeof cacheNameOrOpt === 'string') {
    cacheName = cacheNameOrOpt;
    options = opt;
  } else {
    options = cacheNameOrOpt || {};
    cacheName = options.cacheName;
  }

  return (target: any, methodName: string | symbol, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (!["SERVICE", "COMPONENT"].includes(componentType)) {
      throw Error("This decorator only used in the service、component class.");
    }
    
    // Generate cache name if not provided
    const finalCacheName = cacheName || `${target.constructor.name}:${String(methodName)}`;
    
    // Get original method
    const originalMethod = descriptor.value;
    if (!Helper.isFunction(originalMethod)) {
      throw new Error(`CacheAble decorator can only be applied to methods`);
    }

    // Create wrapped method
    descriptor.value = function (...args: any[]) {
      const cacheManager = CacheManager.getInstance();
      const store = cacheManager.getCacheStore();
      
      // If cache store is not available, execute original method directly
      if (!store) {
        logger.Debug(`Cache store not available for ${finalCacheName}, executing original method`);
        return originalMethod.apply(this, args);
      }

      // Get method parameter list
      const funcParams = getArgs(originalMethod);
      // Get cache parameter positions
      const paramIndexes = getParamIndex(funcParams, options.params || []);

      return (async () => {
        try {
          // Generate cache key
          const key = generateCacheKey(finalCacheName, paramIndexes, options.params || [], args);
          
          // Try to get data from cache 
          const cached = await store.get(key).catch((e): any => {
            logger.Debug("Cache get error:" + e.message);
            return null;
          });

          if (!Helper.isEmpty(cached)) {
            logger.Debug(`Cache hit for key: ${key}`);
            try {
              return JSON.parse(cached);
            } catch {
              // If parse fails, return as string (for simple values)
              return cached;
            }
          }

          logger.Debug(`Cache miss for key: ${key}`);
          // Execute original method
          const result = await originalMethod.apply(this, args);
          
          // Use decorator timeout if specified, otherwise use global default
          const timeout = options.timeout || cacheManager.getDefaultTimeout();
          
          // Asynchronously set cache
          store.set(
            key, 
            Helper.isJSONObj(result) ? JSON.stringify(result) : result,
            timeout
          ).catch((e): any => {
            logger.Debug("Cache set error:" + e.message);
          });

          return result;
        } catch (error) {
          logger.Debug(`CacheAble wrapper error: ${error.message}`);
          // If cache operation fails, execute original method directly
          return originalMethod.apply(this, args);
        }
      })();
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
export function CacheEvict(cacheNameOrOpt?: string | CacheEvictOpt, opt: CacheEvictOpt = {}): MethodDecorator {
  // Handle overloaded parameters
  let cacheName: string | undefined;
  let options: CacheEvictOpt;
  
  if (typeof cacheNameOrOpt === 'string') {
    cacheName = cacheNameOrOpt;
    options = opt;
  } else {
    options = cacheNameOrOpt || {};
    cacheName = options.cacheName;
  }

  return (target: any, methodName: string | symbol, descriptor: PropertyDescriptor) => {
    const componentType = IOCContainer.getType(target);
    if (!["SERVICE", "COMPONENT"].includes(componentType)) {
      throw Error("This decorator only used in the service、component class.");
    }

    // Save class to IOC container for tracking
    IOCContainer.saveClass("COMPONENT", target, COMPONENT_CACHE);
    
    // Generate cache name if not provided
    const finalCacheName = cacheName || `${target.constructor.name}:${String(methodName)}`;
    
    // Get original method
    const originalMethod = descriptor.value;
    if (!Helper.isFunction(originalMethod)) {
      throw new Error(`CacheEvict decorator can only be applied to methods`);
    }

    // Create wrapped method
    descriptor.value = function (...args: any[]) {
      const cacheManager = CacheManager.getInstance();
      const store = cacheManager.getCacheStore();
      
      // If cache store is not available, execute original method directly
      if (!store) {
        logger.Debug(`Cache store not available for ${finalCacheName}, executing original method`);
        return originalMethod.apply(this, args);
      }

      // Get method parameter list
      const funcParams = getArgs(originalMethod);
      // Get cache parameter positions
      const paramIndexes = getParamIndex(funcParams, options.params || []);

      return (async () => {
        try {
          // Generate cache key
          const key = generateCacheKey(finalCacheName, paramIndexes, options.params || [], args);
          
          // Execute original method
          const result = await originalMethod.apply(this, args);
          
          // Immediately clear cache
          store.del(key).catch((e): any => {
            logger.Debug("Cache delete error:" + e.message);
          });

          // Use decorator setting if specified, otherwise use global default
          const enableDelayedDeletion = options.delayedDoubleDeletion !== undefined 
            ? options.delayedDoubleDeletion 
            : cacheManager.getDefaultDelayedDoubleDeletion();

          // Delayed double deletion strategy
          if (enableDelayedDeletion !== false) {
            const delayTime = 5000;
            asyncDelayedExecution(() => {
              store.del(key).catch((e): any => {
                logger.Debug("Cache double delete error:" + e.message);
              });
            }, delayTime);
          }

          return result;
        } catch (error) {
          logger.Debug(`CacheEvict wrapper error: ${error.message}`);
          // If cache operation fails, execute original method directly
          return originalMethod.apply(this, args);
        }
      })();
    };

    return descriptor;
  };
}