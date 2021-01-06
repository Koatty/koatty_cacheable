/*
 * @Author: richen
 * @Date: 2020-07-06 19:53:43
 * @LastEditTime: 2020-12-01 19:16:17
 * @Description:
 * @Copyright (c) - <richenlin(at)gmail.com>
 */
import * as helper from "koatty_lib";
import { DefaultLogger as logger } from "koatty_logger";
import { RedisStore, Store, StoreOptions } from "koatty_store";
import { Application, IOCContainer, TAGGED_CLS } from 'koatty_container';

const APP_READY_HOOK = "APP_READY_HOOK";
/**
 * 
 *
 * @interface CacheStoreInterface
 */
interface CacheStoreInterface {
    store?: RedisStore;
}

// cacheStore
const cacheStore: CacheStoreInterface = {
    store: null
};

/**
 * initiation redis connection and client.
 *
 * @param {Application} app
 * @returns {*}  {Promise<RedisStore>}
 */
async function InitRedisConn(app: Application): Promise<RedisStore> {
    const opt: StoreOptions = app.config("Cache", "db") || app.config("redis", "db");
    if (helper.isEmpty(opt)) {
        throw Error("Missing redis server configuration. Please write a configuration item with the key name 'Cache' or 'redis' in the db.ts file.");
    }
    if (!cacheStore.store) {
        cacheStore.store = Store.getInstance(opt);
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
    logger.Custom('think', '', 'EnableCacheStore');
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
                    logger.Error("The class must have Koatty.app attributes.");
                }

                // tslint:disable-next-line: one-variable-per-declaration
                if (cacheFlag) {
                    if (!cacheStore.store || !helper.isFunction(cacheStore.store.get)) {
                        cacheFlag = false;
                        logger.Warn(`Please use @EnableCacheStore to enable cache storage in App.ts. `);
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
                        res = await cacheStore.store.get(`${cacheName}:${key}`).catch((): any => null);
                    } else {
                        res = await cacheStore.store.get(cacheName).catch((): any => null);
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
                            cacheStore.store.set(`${cacheName}:${key}`, JSON.stringify(res), timeout).catch((): any => null);
                        } else {
                            cacheStore.store.set(cacheName, JSON.stringify(res), timeout).catch((): any => null);
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
                    logger.Error("The class must have Koatty.app attributes.");
                }

                if (cacheFlag) {
                    if (!cacheStore.store || !helper.isFunction(cacheStore.store.get)) {
                        cacheFlag = false;
                        logger.Warn(`Please use @EnableCacheStore to enable cache storage in App.ts. `);
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
                            await cacheStore.store.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await cacheStore.store.del(cacheName).catch((): any => null);
                        }
                        // tslint:disable-next-line: no-invalid-this
                        return value.apply(this, props);
                    } else {
                        // tslint:disable-next-line: no-invalid-this
                        const res = await value.apply(this, props);
                        if (!helper.isTrueEmpty(key)) {
                            await cacheStore.store.del(`${cacheName}:${key}`).catch((): any => null);
                        } else {
                            await cacheStore.store.del(cacheName).catch((): any => null);
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