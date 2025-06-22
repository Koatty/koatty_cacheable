/**
 * @Description: Cache injector, unified processing of all cache decorators
 * @Usage: 
 * @Author: richen
 * @Date: 2025-01-10 14:00:00
 * @LastEditTime: 2025-01-10 14:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
import { Koatty } from "koatty_core";
import { IOCContainer } from "koatty_container";
import { Helper } from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { CacheStore } from "koatty_store";
import { GetCacheStore } from "./store";
import { CACHE_METADATA_KEY, DecoratorType } from "./cache";
import { asyncDelayedExecution, generateCacheKey, getArgs, getParamIndex } from './utils';

/**
 * Cache options
 */
export interface CacheOptions {
  cacheTimeout?: number;
  delayedDoubleDeletion?: boolean;
  redisConfig?: RedisConfig;
}

/**
 * Redis configuration
 */
export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

// IOC container key constant
const COMPONENT_CACHE = "COMPONENT_CACHE";

/**
 * Cache injector - unified processing of all cache decorators at application startup
 * @param options Cache options
 * @param app Koatty application instance
 */
export async function injectCache(options: CacheOptions, app: Koatty) {
  try {
    logger.Info('Starting cache decorator injection...');
    
    // Get cache store instance
    const store: CacheStore = await GetCacheStore(app);
    if (!store) {
      logger.Warn('Cache store unavailable, skipping cache injection');
      return;
    }

    // Get all registered cache component classes
    const componentList = IOCContainer.listClass(COMPONENT_CACHE);
    let processedCount = 0;

    for (const component of componentList) {
      try {
        // Get all cache-related metadata for the class
        const classMetadata = IOCContainer.getClassMetadata(COMPONENT_CACHE, CACHE_METADATA_KEY, component.target);
        if (!classMetadata) {
          continue;
        }

        // Get class instance
        const instance: any = IOCContainer.get(component.target.name);
        if (!instance) {
          logger.Debug(`Cannot get class instance: ${component.target.name}`);
          continue;
        }

        // Process cache decorators for each method
        for (const [, metadata] of Object.entries(classMetadata)) {
          if (typeof metadata !== 'object' || !(metadata as any).type) {
            continue;
          }

          const cacheMetadata = metadata as {
            cacheName: string;
            methodName: string;
            options: any;
            type: DecoratorType;
          };

          const originalMethod = instance[cacheMetadata.methodName];
          if (!Helper.isFunction(originalMethod)) {
            logger.Debug(`Method ${cacheMetadata.methodName} is not a function, skipping`);
            continue;
          }

          // Wrap method based on decorator type
          if (cacheMetadata.type === DecoratorType.CACHE_ABLE) {
            instance[cacheMetadata.methodName] = createCacheAbleWrapper(
              originalMethod,
              cacheMetadata.cacheName,
              cacheMetadata.options,
              store,
              app
            );
          } else if (cacheMetadata.type === DecoratorType.CACHE_EVICT) {
            instance[cacheMetadata.methodName] = createCacheEvictWrapper(
              originalMethod,
              cacheMetadata.cacheName,
              cacheMetadata.options,
              store,
              app
            );
          }

          processedCount++;
          logger.Debug(`Processed cache method: ${component.target.name}.${cacheMetadata.methodName}`);
        }
      } catch (error) {
        logger.Error(`Error processing class ${component.target.name}:`, error);
      }
    }

    logger.Info(`Cache decorator injection completed, processed ${processedCount} methods`);
  } catch (error) {
    logger.Error('Cache injection failed:', error);
  }
}

/**
 * Create CacheAble wrapper
 */
function createCacheAbleWrapper(
  originalMethod: (...args: any[]) => any,
  cacheName: string,
  options: any,
  store: CacheStore,
  _app: Koatty
) {
  // Get method parameter list
  const funcParams = getArgs(originalMethod);
  // Get cache parameter positions
  const paramIndexes = getParamIndex(funcParams, options.params || []);

  return async function (...props: any[]) {
    try {
      // Generate cache key
      const key = generateCacheKey(cacheName, paramIndexes, options.params || [], props);
      
      // Try to get data from cache
      const cached = await store.get(key).catch((e): any => {
        logger.Debug("Cache get error:" + e.message);
        return null;
      });

      if (!Helper.isEmpty(cached)) {
        return JSON.parse(cached);
      }

      // Execute original method
      const result = await originalMethod.apply(this, props);
      
      // Asynchronously set cache
      store.set(
        key, 
        Helper.isJSONObj(result) ? JSON.stringify(result) : result,
        options.timeout || 300
      ).catch((e): any => {
        logger.Debug("Cache set error:" + e.message);
      });

      return result;
    } catch (error) {
      logger.Error(`CacheAble wrapper error: ${error.message}`);
      // If cache operation fails, execute original method directly
      return originalMethod.apply(this, props);
    }
  };
}

/**
 * Create CacheEvict wrapper
 */
function createCacheEvictWrapper(
  originalMethod: (...args: any[]) => any,
  cacheName: string,
  options: any,
  store: CacheStore,
  _app: Koatty
) {
  // Get method parameter list
  const funcParams = getArgs(originalMethod);
  // Get cache parameter positions
  const paramIndexes = getParamIndex(funcParams, options.params || []);

  return async function (...props: any[]) {
    try {
      // Generate cache key
      const key = generateCacheKey(cacheName, paramIndexes, options.params || [], props);
      
      // Execute original method
      const result = await originalMethod.apply(this, props);
      
      // Immediately clear cache
      store.del(key).catch((e): any => {
        logger.Debug("Cache delete error:" + e.message);
      });

      // Delayed double deletion strategy
      if (options.delayedDoubleDeletion !== false) {
        const delayTime = 5000;
        asyncDelayedExecution(() => {
          store.del(key).catch((e): any => {
            logger.Debug("Cache double delete error:" + e.message);
          });
        }, delayTime);
      }

      return result;
    } catch (error) {
      logger.Error(`CacheEvict wrapper error: ${error.message}`);
      // If cache operation fails, execute original method directly
      return originalMethod.apply(this, props);
    }
  };
}