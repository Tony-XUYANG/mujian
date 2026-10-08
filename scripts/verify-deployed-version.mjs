// Compare immutable frontend build files; health alone cannot identify a release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = new URL(process.env.APP_URL || 'http://127.0.0.1:8080');
assert.ok(['http:', 'https:'].includes(base.protocol), 'APP_URL必须为HTTP或HTTPS');
const root = resolve(process.env.EXPECTED_FRONTEND_DIR || fileURLToPath(new URL('../frontend/dist/', import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function remote(path) {
  const url = new URL('/' + path, base);
  assert.equal(url.origin, base.origin, '仅核对同源文件');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
  assert.equal(response.status, 200, `文件不可用：${path}`);
  return Buffer.from(await response.arrayBuffer());
}
function assetPaths(manifest) {
  assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest), '无效构建清单');
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    assert.ok(entry && typeof entry === 'object' && typeof entry.file === 'string', '无效资源条目');
    assert.ok(entry.css === undefined || Array.isArray(entry.css), '无效CSS清单');
    for (const path of [entry.file, ...(entry.css || [])]) {
      assert.ok(typeof path === 'string' && /^assets\/[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').includes('..'), '资源路径不合法');
      files.add(path);
    }
  }
  assert.ok(files.size > 0, '构建清单为空');
  return [...files].sort();
}

try {
  const expected = JSON.parse(await readFile(resolve(root, 'asset-manifest.json'), 'utf8'));
  const deployed = JSON.parse((await remote('asset-manifest.json')).toString('utf8'));
  const paths = assetPaths(expected), actual = assetPaths(deployed);
  assert.deepEqual(actual, paths, '服务器构建资源与选定候选版不同，升级尚未验证通过');
  let checked = 0;
  for (const path of ['index.html', 'asset-manifest.json', 'sw.js', 'manifest.webmanifest', ...paths]) {
    const local = resolve(root, path);
    assert.ok(local.startsWith(root + sep), '资源必须位于预期构建目录');
    assert.equal(hash(await remote(path)), hash(await readFile(local)), `文件内容与候选版不同：${path}`);
    console.log(`PASS ${++checked}: ${path} SHA256一致`);
  }
  console.log(`${checked} 项版本文件核对通过：${base.origin}`);
  console.log('仅证明前端构建一致；完整JAR、服务器备份、登录交易与真机安装仍需分别验收。');
} catch (error) {
  console.error('版本核对失败：' + error.message);
  process.exitCode = 1;
}
