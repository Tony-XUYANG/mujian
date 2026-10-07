// Read-only smoke checks: safe to run against the shared Ubuntu test server.
import assert from "node:assert/strict";

const base = new URL(process.env.APP_URL || "http://127.0.0.1:8080");
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}
async function request(path, options = {}) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, "仅检查目标服务器的同源资源");
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}
async function json(path) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  return response.json();
}

const health = await json("/api/health");
check("应用健康且数据库已连接", health.status === "UP" && health.database === "connected");
const page = await request("/");
const html = await page.text();
check("首页包含中文 App 壳", page.status === 200 && /lang="zh-CN"/.test(html) && html.includes("幕间"));
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
const styles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)].map((match) => match[1]);
assert.ok(scripts.length && styles.length, "首页应包含构建后的 JS/CSS");
for (const path of [...scripts, ...styles]) {
  const response = await request(path);
  const content = await response.text();
  const type = response.headers.get("content-type") || "";
  check(`构建资源可用：${path}`, response.status === 200 && content.length > 100 && (path.endsWith(".css") ? type.includes("text/css") : /javascript/.test(type)));
}
const manifestResponse = await request("/manifest.webmanifest");
const manifest = await manifestResponse.json();
check("App 安装清单可下载", manifestResponse.status === 200 && manifest.name && manifest.display === "standalone" && manifest.icons.length >= 2);
const sw = await request("/sw.js");
check("Service Worker 脚本可下载（HTTP 公网不启用）", sw.status === 200 && /javascript/.test(sw.headers.get("content-type") || ""));
await sw.body?.cancel();

const dramas = await json("/api/dramas");
check("公开短剧目录有真实数据库内容", Array.isArray(dramas) && dramas.length > 0 && dramas.every((drama) => drama.id && drama.title));
const recommendations = await json("/api/recommendations");
check("游客推荐可用", Array.isArray(recommendations) && recommendations.length > 0);
const drama = await json(`/api/dramas/${dramas[0].id}`);
check("短剧详情可用", drama.id === dramas[0].id && Boolean(drama.videoUrl));
const episodes = await json(`/api/dramas/${drama.id}/episodes`);
check("公开选集目录可用", Array.isArray(episodes) && episodes.length > 0);
const image = await request(drama.coverImg);
check("短剧封面同源可用", image.status === 200 && (image.headers.get("content-type") || "").startsWith("image/"));
await image.body?.cancel();
const media = await request(drama.videoUrl, { headers: { Range: "bytes=0-1023" } });
check("视频支持 Range 拖动播放", media.status === 206 && /^bytes 0-1023\//.test(media.headers.get("content-range") || "") && (await media.arrayBuffer()).byteLength === 1024);

const products = await json("/api/mall/products");
check("公开商城目录可用", Array.isArray(products) && products.length > 0);
const product = await json(`/api/mall/products/${products[0].id}`);
check("商品详情来自数据库", product.id === products[0].id && product.shopId && Number(product.price) >= 0);
const variantsProduct = products.find((item) => item.hasVariants);
if (variantsProduct) {
  const variant = await json(`/api/mall/products/${variantsProduct.id}`);
  check("多规格价格、库存及属性组可用", variant.variants.length > 0 && variant.attributeGroups.length > 0 && variant.variants.every((item) => Number(item.price) >= 0 && item.stock >= 0));
}
const shop = await json(`/api/mall/shops/${product.shopId}`);
check("公开店铺可用", Boolean(shop.shop?.name || shop.name));
const review = await request(`/api/mall/products/${product.id}/reviews`);
check("商品评价接口可用", review.status === 200);
await review.body?.cancel();
for (const path of ["/api/auth/me", "/api/admin/stats", "/api/me/orders", "/api/shop/me"]) {
  const response = await request(path);
  const error = await response.json();
  check(`匿名访问受保护接口被拒绝：${path}`, response.status === 401 && /[\u4e00-\u9fff]/u.test(error.message || ""));
}
console.log(`${passed} 项部署只读检查通过：${base.origin}`);
console.log("未注册账号、创建订单或修改库存；不代表已完成登录后的交易验收或并发压测。");
