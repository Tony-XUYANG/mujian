import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8080';
const screenshots = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.message));

try {
  const username = 'ui_' + Date.now().toString(36);
  const password = 'UiVerify123!';
  const signup = await context.request.post(base + '/api/auth/register', { data: { username, password, nickname: '界面验收' } });
  assert.equal(signup.status(), 201);
  const { token } = await signup.json();
  const dramas = await (await context.request.get(base + '/api/dramas')).json();
  const drama = dramas.find(item => item.title === '等风，也等你');
  assert.ok(drama, 'demo drama must exist for browser verification');
  await context.request.put(base + `/api/dramas/${drama.id}/progress`, {
    headers: { Authorization: `Bearer ${token}` }, data: { progressSec: 12, durationSec: 52 },
  });
  await page.goto(base);
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录幕间', exact: true }).click();
  await page.waitForFunction(() => sessionStorage.getItem('mujian_token'));
  const sessionToken = await page.evaluate(() => sessionStorage.getItem('mujian_token'));
  await page.getByRole('button', { name: `观看${drama.title}`, exact: true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const shellReady = await page.evaluate(async () => {
    const manifest = await (await fetch('/asset-manifest.json')).json();
    const files = Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css || [])]);
    const cache = await caches.open('mujian-app-v3');
    return (await Promise.all(files.map(file => cache.match('/' + file)))).every(Boolean);
  });
  assert.ok(shellReady, 'first visit precaches JavaScript and CSS for offline reload');
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => [...document.querySelectorAll('.poster img')].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: screenshots + 'desktop-home.jpg', type: 'jpeg', quality: 82, fullPage: true });

  await page.getByRole('button', { name: '继续观看', exact: true }).click();
  await page.getByRole('button', { name: `观看${drama.title}`, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 11);
  assert.match(await page.locator('.resume-note').innerText(), /0:12/);
  await page.screenshot({ path: screenshots + 'desktop-player.jpg', type: 'jpeg', quality: 82 });
  await page.getByRole('button', { name: '离线缓存', exact: true }).click();
  await page.getByRole('button', { name: '已缓存', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await page.getByRole('button', { name: `移除${drama.title}的观看记录`, exact: true }).click();
  await page.getByRole('heading', { name: '还没有观看记录', exact: true }).waitFor();

  const sharedVideo = dramas.find(item => item.id !== drama.id && item.videoUrl === drama.videoUrl);
  if (sharedVideo) {
    await page.goto(base + `/#watch/${sharedVideo.id}`);
    await page.getByRole('button', { name: '离线缓存', exact: true }).click();
    await page.getByRole('button', { name: '已缓存', exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  }
  await page.goto(base + `/#watch/${drama.id}`);
  await page.getByRole('dialog', { name: '短剧播放', exact: true }).waitFor();
  await page.getByRole('dialog', { name: '短剧播放', exact: true }).getByRole('heading', { name: drama.title, exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#home');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.getByRole('button', { name: '打开离线片库', exact: true }).click();
  await page.getByRole('button', { name: `离线播放${drama.title}`, exact: true }).waitFor();
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: screenshots + 'offline-library.jpg', type: 'jpeg', quality: 82, fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: `离线播放${drama.title}`, exact: true }).click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mujian_token')), sessionToken, 'offline reload preserves session');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.evaluate(() => { document.querySelector('video').currentTime = 20; });
  await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 19);
  await page.evaluate(() => document.querySelector('video').play());
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 20.5);
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: screenshots + 'offline-player.jpg', type: 'jpeg', quality: 82 });
  await context.setOffline(false);
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭离线播放', exact: true }).click();
  await page.getByRole('button', { name: `移除${drama.title}的离线缓存`, exact: true }).click();
  if (sharedVideo) {
    await page.getByRole('button', { name: `离线播放${sharedVideo.title}`, exact: true }).waitFor();
    assert.ok(await page.evaluate(async url => Boolean(await (await caches.open('mujian-offline-v1')).match(url)), sharedVideo.videoUrl), 'shared download remains after removing one title');
    await page.getByRole('button', { name: `移除${sharedVideo.title}的离线缓存`, exact: true }).click();
  }
  await page.getByRole('heading', { name: '还没有缓存的视频', exact: true }).waitFor();

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + '/#home');
    await page.getByRole('button', { name: `观看${drama.title}`, exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `mobile ${width}px should not overflow`);
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: screenshots + `mobile-${width}-home.jpg`, type: 'jpeg', quality: 82 });
    await page.getByRole('button', { name: `观看${drama.title}`, exact: true }).click();
    await page.getByRole('button', { name: '离线缓存', exact: true }).waitFor();
    await page.screenshot({ path: screenshots + `mobile-${width}-player.jpg`, type: 'jpeg', quality: 82 });
    await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/#admin');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('Admin123!');
  await page.getByRole('button', { name: '登录幕间', exact: true }).click();
  await page.getByRole('button', { name: '内容管理', exact: true }).click();
  await page.getByRole('button', { name: '新增短剧', exact: true }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: screenshots + 'desktop-admin.jpg', type: 'jpeg', quality: 82, fullPage: true });
  assert.deepEqual(failures, [], 'no browser runtime errors');
  console.log('Browser checks passed: resume, history removal, deep link, offline playback and mobile layout.');
  console.log('Screenshots: ' + screenshots);
} catch (error) {
  console.error('UI verification failed at', page.url());
  console.error('Visible page:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1200));
  console.error('Browser errors:', failures);
  throw error;
} finally {
  await browser.close();
}
