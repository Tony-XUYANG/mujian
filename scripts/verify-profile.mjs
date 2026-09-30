import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8080';
const screenshots = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const avatarFile = fileURLToPath(new URL('../frontend/public/media/sunset.jpg', import.meta.url));
const coverFile = fileURLToPath(new URL('../frontend/public/media/forest.jpg', import.meta.url));
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
function pass(message) { console.log(`PASS ${++checks}: ${message}`); }

try {
  const username = '资料验收_' + Date.now().toString(36);
  const password = 'ProfileVerify123!';
  const signup = await context.request.post(base + '/api/auth/register', { data: { username, password, nickname: '资料验收' } });
  assert.equal(signup.status(), 201);
  const { token, user } = await signup.json();
  const headers = { Authorization: `Bearer ${token}` };
  const me = async () => (await context.request.get(base + '/api/auth/me', { headers })).json();
  const patch = data => context.request.patch(base + '/api/auth/profile', { headers, data });
  assert.equal((await context.request.patch(base + '/api/auth/profile', { data: { nickname: '无权限' } })).status(), 401);
  assert.equal((await context.request.post(base + '/api/auth/profile/avatar', { multipart: { file: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: await readFile(avatarFile) } } })).status(), 401);
  pass('未登录不能修改资料或上传图片');

  for (const nickname of ['', '   ', '名'.repeat(31), '换\n行']) {
    const response = await patch({ nickname });
    assert.equal(response.status(), 400);
    assert.match((await response.json()).message, /昵称/);
  }
  assert.equal((await me()).nickname, '资料验收');
  pass('空昵称、超长昵称和控制字符均被中文校验拦截');

  const changed = await patch({ nickname: '  林间听故事  ', role: 'ADMIN', id: 1, username: '不能改账号' });
  assert.equal(changed.status(), 200);
  const changedUser = await changed.json();
  assert.equal(changedUser.nickname, '林间听故事');
  assert.equal(changedUser.role, 'USER');
  assert.equal(changedUser.id, user.id);
  assert.equal(changedUser.username, username);
  assert.equal((await patch({ nickname: '林间听故事' })).status(), 200, 'unchanged nickname remains valid');
  pass('只修改当前用户昵称，不能借资料接口修改账号、角色或他人');

  const invalid = await context.request.post(base + '/api/auth/profile/avatar', { headers, multipart: { file: { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') } } });
  assert.equal(invalid.status(), 400);
  assert.match((await invalid.json()).message, /图片/);
  const missing = await context.request.post(base + '/api/auth/profile/avatar', { headers, multipart: { note: 'missing file' } });
  assert.equal(missing.status(), 400);
  assert.equal((await missing.json()).message, '请选择要上传的图片');
  const large = await context.request.post(base + '/api/auth/profile/avatar', { headers, multipart: { file: { name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(6_000_000) } } });
  assert.equal(large.status(), 413);
  assert.equal((await large.json()).message, '请选择不超过5MB的图片');
  pass('伪装图片、缺失文件、超限上传返回准确中文错误');

  const dramas = await (await context.request.get(base + '/api/dramas')).json();
  const drama = dramas.find(item => item.title === '等风，也等你');
  assert.ok(drama);
  await context.request.put(base + `/api/dramas/${drama.id}/favorite`, { headers });
  await context.request.put(base + `/api/dramas/${drama.id}/progress`, { headers, data: { progressSec: 12, durationSec: 52 } });
  await page.goto(base + '/#profile');
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).last().click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录幕间', exact: true }).click();
  await page.getByRole('heading', { name: '林间听故事', exact: true }).waitFor();

  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  const details = page.getByRole('dialog', { name: '编辑资料', exact: true });
  await details.getByLabel('昵称', { exact: true }).fill('  ');
  await details.getByRole('button', { name: '保存资料' }).click();
  await details.getByRole('alert').filter({ hasText: '请输入1–30字昵称' }).waitFor();
  await details.getByLabel('昵称', { exact: true }).fill('未保存的昵称');
  await details.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await me()).nickname, '林间听故事');
  pass('资料表单中文提示，取消编辑不修改数据');

  await page.locator('input[aria-label="选择头像图片"]').setInputFiles(avatarFile);
  const crop = page.getByRole('dialog', { name: '调整头像', exact: true });
  await crop.waitFor();
  assert.equal((await me()).avatarUrl, null, 'preview must not upload automatically');
  await crop.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await me()).avatarUrl, null);
  pass('图片先预览，取消裁剪不上传也不修改头像');

  await page.locator('input[aria-label="选择头像图片"]').setInputFiles(avatarFile);
  await crop.getByLabel('图片缩放', { exact: true }).fill('1.5');
  const preview = await crop.locator('.crop-preview').boundingBox();
  assert.ok(preview);
  const positionBeforeDrag = await crop.getByLabel('图片左右位置', { exact: true }).inputValue();
  await page.mouse.move(preview.x + preview.width / 2, preview.y + preview.height / 2);
  await page.mouse.down();
  await page.mouse.move(preview.x + preview.width / 2 + 20, preview.y + preview.height / 2, { steps: 3 });
  await page.mouse.up();
  assert.notEqual(await crop.getByLabel('图片左右位置', { exact: true }).inputValue(), positionBeforeDrag, 'dragging changes crop position');
  await crop.getByRole('button', { name: '重置', exact: true }).click();
  assert.equal(await crop.getByLabel('图片缩放', { exact: true }).inputValue(), '1');
  assert.equal(await crop.getByLabel('图片左右位置', { exact: true }).inputValue(), '50');
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(await crop.evaluate(element => element.scrollWidth > element.clientWidth), false, 'crop dialog fits narrow phones');
  await crop.getByRole('button', { name: '保存图片', exact: true }).click({ trial: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await crop.getByLabel('图片缩放', { exact: true }).fill('1.5');
  await crop.getByLabel('图片左右位置', { exact: true }).fill('35');
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: screenshots + 'mobile-profile-crop.jpg', type: 'jpeg', quality: 85 });
  await page.route('**/api/auth/profile/avatar', route => route.abort('failed'));
  await crop.getByRole('button', { name: '保存图片', exact: true }).click();
  await crop.getByRole('alert').filter({ hasText: '暂时连接不上服务，请稍后重试' }).waitFor();
  assert.equal((await me()).avatarUrl, null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('mujian_token') !== null), true);
  await page.unroute('**/api/auth/profile/avatar');
  await crop.getByRole('button', { name: '保存图片', exact: true }).click();
  await page.getByText('头像已更新', { exact: true }).waitFor();
  await page.locator('input[aria-label="选择背景图片"]').setInputFiles(coverFile);
  await page.getByRole('dialog', { name: '调整主页背景' }).getByRole('button', { name: '保存图片', exact: true }).click();
  await page.getByText('主页背景已更新', { exact: true }).waitFor();
  const profile = await me();
  const dimensions = await page.evaluate(async urls => Promise.all(urls.map(url => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = reject; image.src = url;
  }))), [profile.avatarUrl, profile.backgroundUrl]);
  assert.deepEqual(dimensions, [[512, 512], [1600, 900]]);
  await page.reload();
  await page.getByRole('heading', { name: '林间听故事', exact: true }).waitFor();
  assert.ok((await page.locator('.profile-avatar-xl img').getAttribute('src')).includes(profile.avatarUrl));
  pass('裁剪上传、断网重试、头像512方形/背景16:9输出及刷新持久化');

  await page.getByLabel('搜索当前片单').fill('找不到的短剧');
  await page.getByRole('heading', { name: '没有找到这部短剧' }).waitFor();
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.getByRole('button', { name: `观看${drama.title}`, exact: true }).waitFor();
  await page.getByRole('tab', { name: '观看记录' }).press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: '我的收藏' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: '我的收藏' }).press('Home');
  pass('片单搜索、空结果恢复和键盘切换标签');

  const longName = '晴天看剧好心情'.repeat(4).slice(0, 28);
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await details.getByLabel('昵称', { exact: true }).fill(longName);
  await details.getByRole('button', { name: '保存资料' }).click();
  await page.getByRole('heading', { name: longName, exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: '更换背景', exact: true }).click({ trial: true });
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await details.getByLabel('昵称', { exact: true }).fill('林间听故事');
  await details.getByRole('button', { name: '保存资料' }).click();
  await page.getByRole('heading', { name: '林间听故事', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '林间听故事', exact: true }).waitFor();
  pass('长中文昵称在320px不溢出，资料编辑刷新后保留');

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => [...document.querySelectorAll('.profile-drama-poster img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: screenshots + (width === 1440 ? 'desktop-profile.jpg' : `mobile-${width}-profile.jpg`), type: 'jpeg', quality: 85, fullPage: true });
  }
  pass('桌面、390px和320px布局验收与截图');

  await page.getByRole('button', { name: '管理片单', exact: true }).click();
  await page.getByRole('button', { name: `移除${drama.title}的观看记录`, exact: true }).click();
  const removal = page.getByRole('dialog', { name: '移除观看记录', exact: true });
  await removal.getByRole('button', { name: '保留', exact: true }).click();
  assert.ok((await (await context.request.get(base + '/api/me/history', { headers })).json()).some(item => item.id === drama.id));
  await page.getByRole('button', { name: `移除${drama.title}的观看记录`, exact: true }).click();
  await page.route('**/api/me/history/*', route => route.abort('failed'));
  await removal.getByRole('button', { name: '确认移除', exact: true }).click();
  await removal.getByRole('alert').filter({ hasText: '暂时连接不上服务' }).waitFor();
  await page.unroute('**/api/me/history/*');
  await removal.getByRole('button', { name: '确认移除', exact: true }).click();
  await page.getByRole('heading', { name: '还没有观看记录', exact: true }).waitFor();
  const saved = await (await context.request.get(base + '/api/me/favorites', { headers })).json();
  assert.ok(saved.some(item => item.id === drama.id));
  await page.getByRole('tab', { name: '我的收藏' }).click();
  await page.getByRole('button', { name: '管理片单', exact: true }).click();
  await page.getByRole('button', { name: `取消收藏${drama.title}`, exact: true }).click();
  await page.getByRole('dialog', { name: '取消收藏', exact: true }).getByRole('button', { name: '确认移除', exact: true }).click();
  await page.getByRole('heading', { name: '还没有收藏短剧', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('tab', { name: '我的收藏' }).click();
  await page.getByRole('heading', { name: '还没有收藏短剧', exact: true }).waitFor();
  pass('片单管理支持确认/取消、失败重试、分别移除与空列表持久化');

  assert.deepEqual(errors, []);
  console.log(`Profile checks passed: ${checks}. Temporary user: ${username}`);
} catch (error) {
  console.error('Profile check failed at', page.url());
  console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 2000));
  throw error;
} finally { await browser.close(); }
