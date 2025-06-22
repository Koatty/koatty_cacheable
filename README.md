# koatty_cacheable

Cacheable plugin for Koatty.

Koatty框架的 CacheAble, CacheEvict 缓存装饰器插件，提供方法级别的缓存功能。

## 特性

- 🚀 **简单易用**: 通过装饰器轻松添加缓存功能
- 🔄 **自动缓存**: `@CacheAble` 装饰器自动缓存方法返回值
- 🗑️ **智能清除**: `@CacheEvict` 装饰器智能清除相关缓存
- ⚡ **延迟双删**: 支持延迟双删策略，解决缓存一致性问题
- 🔧 **多后端支持**: 支持 Memory 和 Redis 缓存后端
- 🎯 **参数化缓存**: 支持基于方法参数的缓存键生成
- 🛡️ **类型安全**: 完整的 TypeScript 支持
- 📦 **插件化设计**: 遵循 Koatty 插件标准，统一管理

## 安装

```bash
npm install koatty_cacheable
```

## 配置

### 1. Generate Plugin Template

Use Koatty CLI to generate the plugin template:

```bash
kt plugin Cacheable
```

Create `src/plugin/Cacheable.ts`:

```typescript
import { Plugin, IPlugin, App } from "koatty";
import { KoattyCache } from "koatty_cacheable";

@Plugin()
export class Cacheable implements IPlugin {
  run(options: any, app: App) {
    return KoattyCache(options, app);
  }
}
```

### 2. Configure Plugin

Update `src/config/plugin.ts`:

```typescript
export default {
  list: ["Cacheable"], // Plugin loading order
  config: {
    Cacheable: {
      cacheTimeout: 300,        // 默认缓存过期时间（秒）
      delayedDoubleDeletion: true, // 默认启用延迟双删策略
      redisConfig: {
        host: "127.0.0.1",
        port: 6379,
        password: "",
        db: 0,
        keyPrefix: "koatty:cache:"
      }
    }
  }
};
```

## 使用方法

### 基本用法

```typescript
import { CacheAble, CacheEvict, GetCacheStore } from "koatty_cacheable";
import { Component } from "koatty_container";

@Component()
export class UserService {

    // 自动缓存方法返回值
    @CacheAble("userCache", {
        params: ["id"],    // 使用 id 参数作为缓存键的一部分
        timeout: 300       // 缓存过期时间（秒），默认使用插件配置的 cacheTimeout
    })
    async getUserById(id: string): Promise<User> {
        // 数据库查询逻辑
        return await this.userRepository.findById(id);
    }

    // 自动清除相关缓存
    @CacheEvict("userCache", {
        params: ["id"],                    // 使用 id 参数定位要清除的缓存
        delayedDoubleDeletion: true        // 启用延迟双删策略，默认使用插件配置的 delayedDoubleDeletion
    })
    async updateUser(id: string, userData: Partial<User>): Promise<User> {
        // 更新用户数据
        const updatedUser = await this.userRepository.update(id, userData);
        return updatedUser;
    }

    // 手动操作缓存
    async customCacheOperation() {
        const store = await GetCacheStore(this.app);
        
        // 设置缓存
        await store.set("custom:key", "value", 60);
        
        // 获取缓存
        const value = await store.get("custom:key");
        
        // 删除缓存
        await store.del("custom:key");
    }
}
```

### 高级用法

```typescript
import { Component } from "koatty_container";

@Component()
export class ProductService {

    // 无参数缓存
    @CacheAble("productStats")
    async getProductStats(): Promise<ProductStats> {
        return await this.calculateStats();
    }

    // 多参数缓存
    @CacheAble("productSearch", {
        params: ["category", "keyword"],
        timeout: 600  // 覆盖插件配置的默认时间
    })
    async searchProducts(category: string, keyword: string, page: number = 1): Promise<Product[]> {
        return await this.productRepository.search(category, keyword, page);
    }

    // 立即清除缓存（不使用延迟双删）
    @CacheEvict("productSearch", {
        params: ["category"],
        delayedDoubleDeletion: false  // 覆盖插件配置的默认策略
    })
    async updateProductCategory(category: string, updates: any): Promise<void> {
        await this.productRepository.updateCategory(category, updates);
    }
}
```

## API 文档

### @CacheAble(cacheName, options?)

自动缓存装饰器，缓存方法的返回值。

**参数:**
- `cacheName: string` - 缓存名称
- `options?: CacheAbleOpt` - 缓存选项
  - `params?: string[]` - 用作缓存键的参数名数组
  - `timeout?: number` - 缓存过期时间（秒），默认 300

### @CacheEvict(cacheName, options?)

自动清除缓存装饰器，在方法执行后清除相关缓存。

**参数:**
- `cacheName: string` - 要清除的缓存名称
- `options?: CacheEvictOpt` - 清除选项
  - `params?: string[]` - 用于定位缓存的参数名数组
  - `delayedDoubleDeletion?: boolean` - 是否启用延迟双删策略，默认 true

### GetCacheStore(app?)

获取缓存存储实例。

**参数:**
- `app?: Application` - Koatty 应用实例

**返回:** `Promise<CacheStore>`

## 缓存键生成规则

缓存键按以下格式生成：
```
{cacheName}:{paramName1}:{paramValue1}:{paramName2}:{paramValue2}...
```

例如：
- `@CacheAble("user", {params: ["id"]})` + `getUserById("123")` → `user:id:123`
- 当缓存键长度超过 128 字符时，会自动使用 murmur hash 进行压缩

## 延迟双删策略

延迟双删是一种解决缓存一致性问题的策略：

1. 立即删除缓存
2. 执行数据更新操作
3. 延迟 5 秒后再次删除缓存

这样可以避免在并发场景下出现脏数据。

## 配置优先级

配置项的优先级从高到低：

1. **装饰器配置**: 直接在 `@CacheAble` 或 `@CacheEvict` 中指定的选项
2. **插件配置**: 在 `src/config/plugin.ts` 中配置的 `Cacheable` 插件选项
3. **默认值**: 系统内置的默认配置

例如：
```typescript
// 插件配置
Cacheable: {
  cacheTimeout: 300,
  delayedDoubleDeletion: true
}

// 装饰器配置会覆盖插件配置
@CacheAble("user", {
  timeout: 600  // 使用 600 秒而不是插件配置的 300 秒
})
```

## 注意事项

1. 装饰器只能用于使用了 `@Component()` 装饰器的类
2. 被装饰的方法必须是异步方法（返回 Promise）
3. 缓存的数据会自动进行 JSON 序列化/反序列化
4. 如果缓存服务不可用，方法会正常执行，不会抛出错误
5. 插件会在应用启动时自动注入缓存功能到所有使用装饰器的方法

## 许可证

BSD-3-Clause