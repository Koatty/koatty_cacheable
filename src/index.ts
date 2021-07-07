/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2021-07-07 11:11:05
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
 * @returns {*}  
 */
export async function GetCacheStore(app: Application) {
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
 * @param {Application} app
 * @returns {*}  {Promise<CacheStore>}
 */
async function InitCacheStore(app: Application): Promise<CacheStore> {
    return GetCacheStore(app);
}

/**
 * Decorate this method to support caching. Redis server config from db.ts.
 * The cache method returns a value to ensure that the next time the method is executed with the same parameters,
 * the results can be obtained directly from the cache without the need to execute the method again.
 *
 * @export
 * @param {string} cacheName cache name
 * @param {(number | number[])} [paramKey] The index of the arguments.
 * @param {number} [timeout=3600] cache timeout
 * @returns {MethodDecorator}
 */
export function CacheAble(cacheName: string, paramKey?: number | number[], timeout = 3600): MethodDecorator {
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
                    if (helper.isArray(paramKey)) {
                        (<number[]>paramKey).map((it: any) => {
                            if (!helper.isTrueEmpty(props[it])) {
                                if (typeof props[it] === "object") {
                                    key = `${key}${helper.murmurHash(JSON.stringify(props[it]))}`;
                                } else {
                                    key = `${key}${props[it] || ''}`;
                                }
                            }
                        });
                    } else if (helper.isNumber(paramKey)) {
                        if (typeof props[(<number>paramKey)] === "object") {
                            key = helper.murmurHash(JSON.stringify(props[(<number>paramKey)]));
                        } else {
                            key = props[(<number>paramKey)] || "";
                        }
                    } else {
                        key = `${identifier}:${methodName}`;
                    }

                    if (!helper.isTrueEmpty(key)) {
                        res = await store.get(`${cacheName}:${key}`).catch((): any => null);
                    } else {
                        res = await store.get(cacheName).catch((): any => null);
                    }
                    try {
                        res = JSON.parse(res || "");
                    } catch (e) {
                        res = null;
                    }

                    if (helper.isEmpty(res)) {
                        // tslint:disable-next-line: no-invalid-this
                        res = await value.apply(this, props);
                        // prevent cache penetration
                        if (helper.isEmpty(res)) {
                            res = "";
                            timeout = 60;
                        }
                        if (!helper.isTrueEmpty(key)) {
                            store.set(`${cacheName}:${key}`, JSON.stringify(res), timeout).catch((): any => null);
                        } else {
                            store.set(cacheName, JSON.stringify(res), timeout).catch((): any => null);
                        }
                    }
                    return res;
                } else {
                    // tslint:disable-next-line: no-invalid-this
                    return value.apply(this, props);
                }
            }
        };
        // bind app_ready hook event 
        bindSchedulerLockInit();
        return descriptor;
    };
}

/**
 * bind scheduler lock init event
 *
 */
const bindSchedulerLockInit = function () {
    const app = IOCContainer.getApp();
    app && app.once("appStart", async function () {
        await InitCacheStore(app);
    })
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
 * @param {(number | number[])} [paramKey] The index of the arguments.
 * @param {eventTimes} [eventTime="Before"]
 * @returns
 */
export function CacheEvict(cacheName: string, paramKey?: number | number[], eventTime: eventTimes = "Before") {
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
                    let key = "";

                    if (helper.isArray(paramKey)) {
                        (<number[]>paramKey).map((it: any) => {
                            if (!helper.isTrueEmpty(props[it])) {
                                if (typeof props[it] === "object") {
                                    key = `${key}${helper.murmurHash(JSON.stringify(props[it]))}`;
                                } else {
                                    key = `${key}${props[it] || ''}`;
                                }
                            }
                        });
                    } else if (helper.isNumber(paramKey)) {
                        if (typeof props[(<number>paramKey)] === "object") {
                            key = helper.murmurHash(JSON.stringify(props[(<number>paramKey)]));
                        } else {
                            key = props[(<number>paramKey)] || "";
                        }
                    } else {
                        key = `${identifier}:${methodName}`;
                    }

                    if (eventTime === "Before") {
                        if (!helper.isTrueEmpty(key)) {
                            await store.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await store.del(cacheName).catch((): any => null);
                        }
                        // tslint:disable-next-line: no-invalid-this
                        return value.apply(this, props);
                    } else {
                        // tslint:disable-next-line: no-invalid-this
                        const res = await value.apply(this, props);
                        if (!helper.isTrueEmpty(key)) {
                            await store.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await store.del(cacheName).catch((): any => null);
                        }
                        return res;
                    }
                } else {
                    // tslint:disable-next-line: no-invalid-this
                    return value.apply(this, props);
                }
            }
        };
        return descriptor;
    };
}