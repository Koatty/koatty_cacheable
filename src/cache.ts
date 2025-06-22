/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2024-11-07 15:53:46
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import { IOCContainer } from 'koatty_container';

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
}

/**
 * @description: CacheEvict decorator options
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

    // Save class to IOC container
    IOCContainer.saveClass(DecoratorType.CACHE_ABLE, target, COMPONENT_CACHE);
    
    // Save decorator metadata
    const mergedOpt = { ...{ params: [], timeout: 300 }, ...opt };
    IOCContainer.attachClassMetadata(COMPONENT_CACHE, CACHE_METADATA_KEY, {
      cacheName,
      methodName,
      options: mergedOpt,
      type: DecoratorType.CACHE_ABLE
    }, target);

    // Return original descriptor without modifying method implementation
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

    // Save class to IOC container
    IOCContainer.saveClass(DecoratorType.CACHE_EVICT, target, COMPONENT_CACHE);
    
    // Save decorator metadata
    const mergedOpt = { ...{ delayedDoubleDeletion: true }, ...opt };
    IOCContainer.attachClassMetadata(COMPONENT_CACHE, CACHE_METADATA_KEY, {
      cacheName,
      methodName,
      options: mergedOpt,
      type: DecoratorType.CACHE_EVICT
    }, target);

    // Return original descriptor without modifying method implementation
    return descriptor;
  };
}
