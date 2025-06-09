# koatty_cacheable

Cacheable for koatty.

Koatty框架的 CacheAble, CacheEvict 缓存装饰器支持库，提供方法级别的缓存功能。

## 特性

- 🚀 **简单易用**: 通过装饰器轻松添加缓存功能
- 🔄 **自动缓存**: `@CacheAble` 装饰器自动缓存方法返回值
- 🗑️ **智能清除**: `@CacheEvict` 装饰器智能清除相关缓存
- ⚡ **延迟双删**: 支持延迟双删策略，解决缓存一致性问题
- 🔧 **多后端支持**: 支持 Memory 和 Redis 缓存后端
- 🎯 **参数化缓存**: 支持基于方法参数的缓存键生成
- 🛡️ **类型安全**: 完整的 TypeScript 支持

## 安装

```bash
npm install koatty_cacheable
```

## 配置

在 koatty 项目的 `db.ts` 配置文件中添加缓存配置：

```typescript
export default {
    // ... 其他配置

    "CacheStore": {
        type: "memory", // 缓存类型: "redis" 或 "memory"，默认为 "memory"
        // Redis 配置 (当 type 为 "redis" 时)
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

    // ... 其他配置
};
```

## 使用方法

### 基本用法

```typescript
import { CacheAble, CacheEvict, GetCacheStore } from "koatty_cacheable";

export class UserService {

    // 自动缓存方法返回值
    @CacheAble("userCache", {
        params: ["id"],    // 使用 id 参数作为缓存键的一部分
        timeout: 300       // 缓存过期时间（秒），默认 300 秒
    })
    async getUserById(id: string): Promise<User> {
        // 数据库查询逻辑
        return await this.userRepository.findById(id);
    }

    // 自动清除相关缓存
    @CacheEvict("userCache", {
        params: ["id"],                    // 使用 id 参数定位要清除的缓存
        delayedDoubleDeletion: true        // 启用延迟双删策略，默认 true
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
export class ProductService {

    // 无参数缓存
    @CacheAble("productStats")
    async getProductStats(): Promise<ProductStats> {
        return await this.calculateStats();
    }

    // 多参数缓存
    @CacheAble("productSearch", {
        params: ["category", "keyword"],
        timeout: 600
    })
    async searchProducts(category: string, keyword: string, page: number = 1): Promise<Product[]> {
        return await this.productRepository.search(category, keyword, page);
    }

    // 立即清除缓存（不使用延迟双删）
    @CacheEvict("productSearch", {
        params: ["category"],
        delayedDoubleDeletion: false
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

## 注意事项

1. 装饰器只能用于 `SERVICE` 和 `COMPONENT` 类型的类
2. 被装饰的方法必须是异步方法（返回 Promise）
3. 缓存的数据会自动进行 JSON 序列化/反序列化
4. 如果缓存服务不可用，方法会正常执行，不会抛出错误

## 许可证

BSD-3-Clause