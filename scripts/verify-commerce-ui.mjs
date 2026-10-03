import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.APP_URL || "http://127.0.0.1:8080";
const output = fileURLToPath(
  new URL("../docs/screenshots/commerce/", import.meta.url),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
});
let passed = 0;
const errors = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  console.log("PASS " + ++passed + ": " + name);
};
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const sellerName = "商城界面" + Date.now().toString(36),
  password = "Commerce123!";
let token, productId, videoId;
async function api(path, method = "GET", data, auth = token) {
  const r = await ctx.request.fetch(base + "/api" + path, {
    method,
    data,
    headers: auth ? { Authorization: "Bearer " + auth } : {},
  });
  assert.ok(r.ok(), path + " " + r.status() + " " + (await r.text()));
  return r.json();
}
async function shot(name) {
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({
    path: output + name + ".jpg",
    fullPage: page.viewportSize().width > 600,
    quality: 85,
  });
}
async function fits() {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  );
}
try {
  const seller = await api(
    "/auth/register",
    "POST",
    { username: sellerName, password, nickname: "拾光小店主" },
    null,
  );
  token = seller.token;
  await page.goto(base + "/#mall");
  await page.getByRole("heading", { name: "幕间商城", exact: false }).waitFor();
  await page.locator(".product-card").first().waitFor();
  check(
    "游客商城展示真实商品",
    (await page.locator(".product-card").count()) >= 4,
  );
  await shot("desktop-mall");
  await page.getByLabel("搜索商品").fill("陶瓷");
  await page.waitForFunction(
    () => document.querySelectorAll(".product-card").length === 1,
  );
  check(
    "商城商品搜索",
    await page
      .locator(".product-card")
      .innerText()
      .then((s) => s.includes("马克杯")),
  );
  await page.locator(".product-card").click();
  await page.getByRole("button", { name: "立即购买", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill(sellerName);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await page.waitForFunction(() => sessionStorage.getItem("mujian_token"));
  await page.getByRole("button", { name: "立即购买", exact: true }).waitFor();
  check("游客购买引导登录", true);
  await page.goto(base + "/#profile");
  await page
    .getByRole("button", { name: "我的店铺 / 开店", exact: true })
    .click();
  await page.getByRole("heading", { name: "在幕间，开一家小店" }).waitFor();
  await shot("desktop-register-shop");
  await page
    .getByLabel("店铺名称", { exact: true })
    .fill("拾光好物 · 界面验收");
  await page
    .getByLabel("店铺简介", { exact: true })
    .fill("把日常过成喜欢的模样。这是自动验收演示店铺。");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "开通演示店铺", exact: true }).click();
  await page.getByRole("button", { name: "添加商品", exact: true }).waitFor();
  check("我的页面开通店铺", true);
  await page.getByRole("button", { name: "添加商品", exact: true }).click();
  await page.getByLabel("商品名称", { exact: true }).fill("拾光陶瓷杯（验收）");
  await page.getByLabel("商品图片链接（选填）").fill("/media/shop-cup.svg");
  await page
    .getByLabel("商品介绍")
    .fill("用于真实浏览器验证商品发布、挂载与购买，验收后自动下架。");
  await page.getByLabel("售价（元）").fill("39.90");
  await page.getByLabel("可售库存").fill("10");
  await page.getByRole("button", { name: "上架商品", exact: true }).click();
  await page
    .getByRole("heading", { name: "拾光陶瓷杯（验收）", exact: true })
    .waitFor();
  productId = (await api("/shop/products"))[0].id;
  check(
    "表单创建商品并展示价格库存",
    await page
      .locator(".merchant-product-list")
      .innerText()
      .then((s) => s.includes("39.90") && s.includes("库存 10")),
  );
  await shot("desktop-merchant");
  await page.getByRole("button", { name: "带货视频", exact: true }).click();
  await page.getByRole("button", { name: "发布视频", exact: true }).click();
  const publish = page.getByRole("dialog", { name: "发布带货视频" });
  await publish
    .getByLabel("视频标题", { exact: true })
    .fill("一杯温热，陪你看剧（验收）");
  await publish.getByLabel("视频简介").fill("演示视频与商品挂载效果。");
  await publish.getByRole("checkbox").check();
  await publish.getByRole("button", { name: "发布视频", exact: true }).click();
  await publish.waitFor({ state: "hidden" });
  videoId = (await api("/shop/videos"))[0].id;
  check("店主发布视频并挂载商品", !!videoId);
  await page.getByRole("button", { name: "查看播放效果" }).click();
  await page.locator(".video-product-card").waitFor();
  await shot("desktop-video-product");
  check(
    "播放器小商品卡显示价格与进店入口",
    await page
      .locator(".video-product-card")
      .innerText()
      .then((s) => s.includes("39.90") && s.includes("进店")),
  );
  await page.getByRole("button", { name: "商品袋", exact: true }).click();
  check("展开商品袋", await page.getByLabel("视频商品袋").isVisible());
  await page.getByRole("button", { name: "进店", exact: true }).click();
  await page.locator(".store-heading").waitFor();
  check(
    "视频进店后可选购",
    (await page.locator(".product-card").count()) === 1,
  );
  await shot("desktop-store");
  const buyer = await api(
    "/auth/register",
    "POST",
    {
      username: "买家界面" + Date.now().toString(36),
      password,
      nickname: "体验买家",
    },
    null,
  );
  const buyerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const bp = await buyerCtx.newPage();
  bp.on("pageerror", (e) => errors.push(e.message));
  await bp.goto(base + "/#product/" + productId);
  await bp.getByRole("button", { name: "立即购买", exact: true }).click();
  await bp.getByLabel("用户名", { exact: true }).fill(buyer.user.username);
  await bp.getByLabel("密码", { exact: true }).fill(password);
  await bp.getByRole("button", { name: "登录幕间", exact: true }).click();
  await bp.waitForFunction(() => sessionStorage.getItem("mujian_token"));
  await bp.getByRole("button", { name: "立即购买", exact: true }).click();
  await bp.getByLabel("收货人", { exact: true }).fill("虚拟体验人");
  await bp.getByLabel("联系电话").fill("13800000000");
  await bp.getByLabel("收货地址").fill("演示市测试街道100号（虚拟地址）");
  await bp.locator(".toast").waitFor({ state: "hidden" });
  await bp.screenshot({
    path: output + "mobile-checkout.jpg",
    fullPage: false,
    quality: 85,
  });
  await bp.getByRole("button", { name: "提交演示订单", exact: true }).click();
  await bp.getByRole("heading", { name: "我的订单", exact: true }).waitFor();
  await bp.getByRole("button", { name: "模拟支付", exact: true }).waitFor();
  check("手机结算创建待付款订单", true);
  await bp.getByRole("button", { name: "模拟支付", exact: true }).click();
  await bp.locator(".order-state").filter({ hasText: "待发货" }).waitFor();
  check("用户明确模拟支付", true);
  await page.goto(base + "/#merchant");
  await page.getByRole("button", { name: "店铺订单", exact: true }).click();
  await page.getByRole("button", { name: "演示发货", exact: true }).click();
  await page.locator(".order-state").filter({ hasText: "待收货" }).waitFor();
  check("卖家在店铺订单发货", true);
  await shot("desktop-shop-orders");
  await bp.getByRole("button", { name: "刷新", exact: true }).click();
  await bp.getByRole("button", { name: "确认收货", exact: true }).click();
  await bp.locator(".order-state").filter({ hasText: "已完成" }).waitFor();
  await bp.locator(".toast").waitFor({ state: "hidden" });
  await bp.screenshot({
    path: output + "mobile-order.jpg",
    fullPage: false,
    quality: 85,
  });
  check("买家确认收货闭环", true);
  await buyerCtx.close();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + "/#mall");
    await page.locator(".product-card").first().waitFor();
    check(width + "px商城无横向溢出", await fits());
    check(
      width + "px底部五个主入口",
      (await page.locator(".sidebar .nav-item:visible").count()) === 5,
    );
    await shot("mobile-" + width + "-mall");
    await page.goto(base + "/#watch/" + videoId);
    await page.locator(".video-product-card").waitFor();
    check(width + "px商品卡无横向溢出", await fits());
    await shot("mobile-" + width + "-video");
    await page.getByRole("button", { name: "关闭播放器", exact: true }).click();
    await page.goto(base + "/#profile");
    await page
      .getByRole("button", { name: "我的店铺 / 开店", exact: true })
      .waitFor();
    check(width + "px我的页面无横向溢出", await fits());
    await shot("mobile-" + width + "-profile");
    await page
      .getByRole("button", { name: "我的店铺 / 开店", exact: true })
      .click();
    await page.getByRole("button", { name: "添加商品", exact: true }).waitFor();
    check(width + "px店主管理无横向溢出", await fits());
    await shot("mobile-" + width + "-merchant");
  }
  check("浏览器无未处理脚本异常", errors.length === 0);
} finally {
  if (videoId) await api("/shop/videos/" + videoId, "DELETE");
  if (productId)
    await api("/shop/products/" + productId + "/status", "PUT", {
      onSale: false,
    });
  await browser.close();
}
console.log("\n" + passed + " browser checks passed.");
