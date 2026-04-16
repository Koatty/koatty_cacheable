import { getArgs, generateCacheKey } from "../src/utils";

describe("getArgs", () => {
  test("regular function", () => {
    function fn(a: any, b: any) { return a + b; }
    expect(getArgs(fn)).toEqual(["a", "b"]);
  });

  test("arrow function", () => {
    const fn = (id: any, name: any) => id;
    expect(getArgs(fn)).toEqual(["id", "name"]);
  });

  test("async function", () => {
    async function fn(id: any) { return id; }
    expect(getArgs(fn)).toEqual(["id"]);
  });

  test("method with default values", () => {
    const obj = {
      method(a: any, b = 1) { return a + b; },
    };
    expect(getArgs(obj.method)).toEqual(["a", "b"]);
  });

  test("single parameter", () => {
    const fn = (x: any) => x;
    expect(getArgs(fn)).toEqual(["x"]);
  });

  test("no parameters", () => {
    const fn = () => 42;
    expect(getArgs(fn)).toEqual([]);
  });

  test("parameter with type annotation", () => {
    const fn = (id: string, count: number) => id;
    expect(getArgs(fn)).toEqual(["id", "count"]);
  });

  test("multiline parameters", () => {
    function fn(
      id: any,
      name: any,
    ) { return id; }
    expect(getArgs(fn)).toEqual(["id", "name"]);
  });

  test("parameters with block comments", () => {
    function fn(a /* first */, b /* second */) { return a + b; }
    expect(getArgs(fn)).toEqual(["a", "b"]);
  });

  test("parameters with inline comments", () => {
    function fn(a: any, // first param
      b: any // second param
    ) { return a; }
    expect(getArgs(fn)).toEqual(["a", "b"]);
  });

  test("parameter with default value and type", () => {
    const fn = (id: string = "default") => id;
    expect(getArgs(fn)).toEqual(["id"]);
  });

  test("bare underscore parameter is filtered", () => {
    const fn = (_: any, id: any) => id;
    expect(getArgs(fn)).toEqual(["id"]);
  });

  test("async arrow function with parentheses", () => {
    const fn = async (id: any) => id;
    expect(getArgs(fn)).toEqual(["id"]);
  });

  test("class method", () => {
    class Foo {
      bar(id: any, name: any) { return id; }
    }
    expect(getArgs(Foo.prototype.bar)).toEqual(["id", "name"]);
  });

  test("function with destructured param (extracts opening brace token)", () => {
    const fn = ({ id, name }: any) => id;
    const result = getArgs(fn);
    expect(result.length).toBeGreaterThan(0);
  });

  test("destructured param does not prevent other params from being parsed", () => {
    function fn({ id }: any, page: number) { return page; }
    const result = getArgs(fn);
    expect(result).toContain("page");
  });
});

describe("generateCacheKey", () => {
  test("normal case with valid param indexes", () => {
    const key = generateCacheKey("cache", [0, 1], ["id", "name"], [42, "test"]);
    expect(key).toBe("cache:id:42:name:test");
  });

  test("falls back to JSON when paramIndex is -1", () => {
    const key1 = generateCacheKey("cache", [-1], ["id"], [{ id: 1 }]);
    const key2 = generateCacheKey("cache", [-1], ["id"], [{ id: 2 }]);
    expect(key1).not.toBe(key2);
    expect(key1).toContain("cache:");
    expect(key2).toContain("cache:");
  });

  test("falls back to JSON for all unresolved params", () => {
    const key = generateCacheKey("cache", [-1, -1], ["a", "b"], [1, 2]);
    expect(key).toBe('cache:[1,2]');
  });

  test("normal case when all indexes are valid", () => {
    const key = generateCacheKey("cache", [0], ["id"], [123]);
    expect(key).toBe("cache:id:123");
  });

  test("mixed valid and invalid indexes triggers full JSON fallback", () => {
    const key = generateCacheKey("cache", [0, -1], ["id", "name"], [1, "test"]);
    expect(key).toContain("cache:");
    expect(key).toContain(JSON.stringify([1, "test"]));
  });
});
