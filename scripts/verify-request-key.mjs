import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";

// Simulate the actual public HTTP environment: randomUUID is absent.
const source = await readFile(new URL("../frontend/src/requestKey.ts", import.meta.url), "utf8");
const createRequestKey = runInNewContext(
  source.replace("export function", "function") + "\ncreateRequestKey;",
  { crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } },
);
const keys = Array.from({ length: 1000 }, () => createRequestKey());
assert.ok(keys.every((key) => /^[a-f0-9]{32}$/.test(key)), "HTTP环境仍生成服务端接受的128位请求标识");
assert.equal(new Set(keys).size, keys.length, "独立订单不复用请求标识");
console.log("PASS: HTTP环境无randomUUID时，1000次请求标识生成通过格式和重复检查");
