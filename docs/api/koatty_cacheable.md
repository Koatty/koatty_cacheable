<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [koatty\_cacheable](./koatty_cacheable.md)

## koatty\_cacheable package

## Functions

|  Function | Description |
|  --- | --- |
|  [CacheAble(cacheName, timeout)](./koatty_cacheable.cacheable.md) | Decorate this method to support caching. Redis server config from db.ts. The cache method returns a value to ensure that the next time the method is executed with the same parameters, the results can be obtained directly from the cache without the need to execute the method again. |
|  [CacheEvict(cacheName, eventTime)](./koatty_cacheable.cacheevict.md) | Decorating the execution of this method will trigger a cache clear operation. Redis server config from db.ts. |
|  [GetCacheStore(app)](./koatty_cacheable.getcachestore.md) | get instances of cacheStore |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [eventTimes](./koatty_cacheable.eventtimes.md) |  |
