# koatty_cacheable
Cacheable for koatty.

Koatty框架的 CacheAble, Cacheable, CacheEvict 支持库


# Usage

db.ts in koatty project:

```js
export default {
    ...

    "CacheStore": {
        type: "memory", // redis or memory, memory is default
        // key_prefix: "koatty",
        // host: '127.0.0.1',
        // port: 6379,
        // name: "",
        // username: "",
        // password: "",
        // db: 0,
        // timeout: 30,
        // pool_size: 10,
        // conn_timeout: 30
    },

    ...
};

```

used in service: 

```js
import { CacheAble, CacheEvict, GetCacheStore } from "koatty_cacheable";

export class TestService {

    @CacheAble("testCache") // auto cached
    getTest(){
        //todo
    }

    @CacheEvict("testCache") // auto clear cache
    setTest(){
        //todo
    }

    test(){
        const store = GetCacheStore(this.app);
        store.set(key, value);
    }
}

```