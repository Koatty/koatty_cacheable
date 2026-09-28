import { CacheAble } from '../../src/cache';
import { GetCacheStore, CloseCacheStore } from '../../src/store';
import { generateCacheKey } from '../../src/utils';

afterAll(CloseCacheStore);
test('single flight and hit values preserve primitive and structured types', async () => {
  await GetCacheStore({ type: 'memory', timeout: 30 });
  let calls = 0;
  class Service {
    @CacheAble('cor13', { params: ['id'] })
    async load(id: string, value: any) { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return value; }
  }
  const service = new Service();
  for (const [index, value] of ['123', 'hello', '', 123, false, null, [1, '2'], { n: 1 }].entries()) {
    const results = await Promise.all(Array.from({ length: 10 }, () => service.load(String(index), value)));
    expect(results).toEqual(Array(10).fill(value));
    expect(await service.load(String(index), 'wrong')).toEqual(value);
  }
  expect(calls).toBe(8);
});
test('failed flights are evicted and independent keys are independent', async () => {
  let calls = 0;
  class Service {
    @CacheAble('cor13fail', { params: ['id'] })
    async load(id: string) { calls++; if (calls === 1) throw new Error('source'); return id; }
  }
  const service = new Service();
  await expect(service.load('a')).rejects.toThrow('source');
  expect(await service.load('a')).toBe('a');
  expect(await service.load('b')).toBe('b');
  expect(calls).toBe(3);
});
test('long keys retain namespace and use a 160-bit digest', () => {
  const key = generateCacheKey('namespace', [0], ['id'], ['x'.repeat(300)]);
  expect(key).toMatch(/^namespace:sha1:[a-f0-9]{40}$/);
  expect(generateCacheKey('other', [0], ['id'], ['x'.repeat(300)])).not.toBe(key);
});
