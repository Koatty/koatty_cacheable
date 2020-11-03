/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2020-11-02 20:40:27
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as helper from "think_lib";
import logger from "think_logger";
const store = require("think_store");
import { Application, IOCContainer, TAGGED_CLS } from 'koatty_container';

const APP_READY_HOOK = "APP_READY_HOOK";
/**
 * 
 *
 * @interface CacheStoreInterface
 */
interface CacheStoreInterface {
    store: StoreInterface;
}
interface StoreInterface {
    connect?: (options: RedisOptions, connnum?: number) => Promise<any>;
    getConnection?: () => Promise<any>;
    close?: (client: any) => null;
    wrap?: (name: string, data: any[]) => Promise<any>;
    get?: (name: string) => Promise<any>;
    set?: (name: string, value: any, timeout?: number) => Promise<any>;
    ttl?: (name: string) => Promise<any>;
    del?: (name: string) => Promise<any>;
    incr?: (name: string) => Promise<any>;
    decr?: (name: string) => Promise<any>;
    exists?: (name: string) => Promise<any>;
    expire?: (name: string, timeout?: number) => Promise<any>;
}
// 
const cacheStore: CacheStoreInterface = {
    store: {},
};

/**
 * redis server options
 *
 * @interface RedisOptions
 */
interface RedisOptions {
    key_prefix: string;
    host: string;
    port: number;
    password?: string;
    db?: string;
    timeout?: number;
    poolsize?: number;
    conn_timeout?: number;
}

/**
 * initiation redis connection and client.
 *
 * @param {Application} app
 * @returns {*}  {Promise<StoreInterface>}
 */
async function InitRedisConn(app: Application): Promise<StoreInterface> {
    const opt = app.config("Cache", "db") || app.config("redis", "db");
    if (helper.isEmpty(opt)) {
        throw Error("Missing redis server configuration. Please write a configuration item with the key name 'Cache' or 'redis' in the db.ts file.");
    }
    if (!cacheStore.store) {
        const redisStore = store.getInstance(opt);
        if (redisStore && redisStore.connect) {
            cacheStore.store = await redisStore.getConnection(redisStore.options, 3).catch((e: any): any => {
                logger.error(`Redis connection failed. at ScheduleLocker.InitRedisConn. ${e.message}`);
                return null;
            });
        }
    }
    if (!cacheStore.store || !helper.isFunction(cacheStore.store.connect)) {
        throw Error(`Redis connection failed. `);
    }
    // set app.cacheStore
    helper.define(app, "cacheStore", cacheStore, true);
    IOCContainer.setApp(app);

    return cacheStore.store;
}

/**
 * Enable redis cache store.
 * Need configuration item with the key name 'Cache' or 'redis' in the db.ts file
 * @export
 * @returns {*} 
 */
export function EnableCacheStore(): ClassDecorator {
    logger.custom('think', '', 'EnableCacheStore');
    return (target: any) => {
        if (!(target.__proto__.name === "Koatty")) {
            throw new Error(`class does not inherit from Koatty`);
        }
        IOCContainer.attachClassMetadata(TAGGED_CLS, APP_READY_HOOK, InitRedisConn, target);
    };
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
                // tslint:disable-next-line: no-invalid-this
                if (!this.app || !this.app.config) {
                    cacheFlag = false;
                    logger.error("The class must have Koatty.app attributes.");
                }

                // tslint:disable-next-line: one-variable-per-declaration
                let cacheStore: StoreInterface;
                if (cacheFlag) {
                    // tslint:disable-next-line: no-invalid-this
                    cacheStore = this.app.cacheStore;
                    if (!cacheStore || !helper.isFunction(cacheStore.get)) {
                        cacheFlag = false;
                        logger.warn(`Redis connection failed. @CacheAble is not executed. `);
                    }
                }

                if (cacheFlag) {
                    // tslint:disable-next-line: one-variable-per-declaration
                    let key = "", res;
                    if (helper.isNumber(paramKey)) {
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
                        } else {
                            if (typeof props[(<number>paramKey)] === "object") {
                                key = helper.murmurHash(JSON.stringify(props[(<number>paramKey)]));
                            } else {
                                key = props[(<number>paramKey)] || "";
                            }
                        }
                    } else {
                        key = `${identifier}:${methodName}`;
                    }

                    if (!helper.isTrueEmpty(key)) {
                        res = await cacheStore.get(`${cacheName}:${key}`).catch((): any => null);
                    } else {
                        res = await cacheStore.get(cacheName).catch((): any => null);
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
                            cacheStore.set(`${cacheName}:${key}`, JSON.stringify(res), timeout).catch((): any => null);
                        } else {
                            cacheStore.set(cacheName, JSON.stringify(res), timeout).catch((): any => null);
                        }
                    }
                    return res;
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
                // tslint:disable-next-line: no-invalid-this
                if (!this.app || !this.app.config) {
                    cacheFlag = false;
                    logger.error("The class must have Koatty.app attributes.");
                }

                // tslint:disable-next-line: one-variable-per-declaration
                let cacheStore: StoreInterface;
                if (cacheFlag) {
                    // tslint:disable-next-line: no-invalid-this
                    cacheStore = this.app.cacheStore;
                    if (!cacheStore || !helper.isFunction(cacheStore.get)) {
                        cacheFlag = false;
                        logger.warn(`Redis connection failed. @CacheEvict is not executed. `);
                    }
                }

                if (cacheFlag) {
                    let key = "";
                    if (helper.isNumber(paramKey)) {
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
                        } else {
                            if (typeof props[(<number>paramKey)] === "object") {
                                key = helper.murmurHash(JSON.stringify(props[(<number>paramKey)]));
                            } else {
                                key = props[(<number>paramKey)] || "";
                            }
                        }
                    } else {
                        key = `${identifier}:${methodName}`;
                    }

                    if (eventTime === "Before") {
                        if (!helper.isTrueEmpty(key)) {
                            await cacheStore.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await cacheStore.del(cacheName).catch((): any => null);
                        }
                        // tslint:disable-next-line: no-invalid-this
                        return value.apply(this, props);
                    } else {
                        // tslint:disable-next-line: no-invalid-this
                        const res = await value.apply(this, props);
                        if (!helper.isTrueEmpty(key)) {
                            await cacheStore.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await cacheStore.del(cacheName).catch((): any => null);
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