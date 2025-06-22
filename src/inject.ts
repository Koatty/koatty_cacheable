/**
 * @Description: Cache injector, unified processing of all cache decorators
 * @Usage: 
 * @Author: richen
 * @Date: 2025-01-10 14:00:00
 * @LastEditTime: 2025-01-10 14:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */
// import { Helper } from 'koatty_lib';
import { Logger } from 'koatty_logger';
import { Koatty } from 'koatty_core';
import { GetCacheStore } from './store';
import { CacheManager } from './manager';

// Create logger instance
const logger = new Logger();

// Redis configuration interface
export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

// Cache configuration interface
export interface CacheOptions {
  cacheTimeout?: number;
  delayedDoubleDeletion?: boolean;
  redisConfig?: RedisConfig;
}

/**
 * Cache injector - initialize global cache manager and store
 * @param options Cache options
 * @param app Koatty application instance
 */
export async function injectCache(options: CacheOptions, app: Koatty) {
  try {
    logger.Debug('Initializing cache system...');
    
    // Get cache store instance
    const store = await GetCacheStore(app);
    if (!store) {
      logger.Warn('Cache store unavailable, cache system disabled');
      return;
    }

    // Initialize global cache manager
    const cacheManager = CacheManager.getInstance();
    cacheManager.setCacheStore(store);
    
    // Set default configuration
    cacheManager.setDefaultConfig(
      options.cacheTimeout || 300,
      options.delayedDoubleDeletion !== undefined ? options.delayedDoubleDeletion : true
    );

    logger.Info(`Cache system initialized successfully with timeout: ${options.cacheTimeout || 300}s`);
  } catch (error) {
    logger.Error('Cache system initialization failed:', error);
  }
}

/**
 * Close cache store connection
 * @param app Koatty application instance
 */
export async function closeCacheStore(_app: Koatty) {
  try {
    logger.Debug('Closing cache store connection...');
    
    // Reset global cache manager
    const cacheManager = CacheManager.getInstance();
    const store = cacheManager.getCacheStore();
    await store?.close();
    cacheManager.setCacheStore(null);
    
    logger.Info('Cache store connection closed');
  } catch (error) {
    logger.Error('Error closing cache store connection:', error);
  }
}

