/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2025-06-23 15:53:46
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */

import { CacheStore } from 'koatty_store';

export class CacheManager {
  private static instance: CacheManager;
  private cacheStore: CacheStore | null = null;
  private defaultTimeout: number = 300;
  private defaultDelayedDoubleDeletion: boolean = true;

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  setCacheStore(store: CacheStore): void {
    this.cacheStore = store;
  }

  getCacheStore(): CacheStore | null {
    return this.cacheStore;
  }

  setDefaultConfig(timeout?: number, delayedDoubleDeletion?: boolean): void {
    if (timeout !== undefined) this.defaultTimeout = timeout;
    if (delayedDoubleDeletion !== undefined) this.defaultDelayedDoubleDeletion = delayedDoubleDeletion;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  getDefaultDelayedDoubleDeletion(): boolean {
    return this.defaultDelayedDoubleDeletion;
  }
}