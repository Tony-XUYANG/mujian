// Local integration verification: creates virtual accounts, orders and products.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.APP_URL || "http://127.0.0.1:8080";
const output = fileURLToPath(new URL("../docs/screenshots/reviews/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let count = 0, seller, buyer, product;
const pending = new Set();
function check(name, ok) { assert.ok(ok, name); console.log("PASS " + ++count + ": " + name); }
async function req(path, method = "GET", data, token) {
  const response = await context.request.fetch(base + "/api" + path, {
    method, data, headers: token ? { Authorization: "Bearer " + token } : {},
  });
  assert.ok(response.ok(), path + " " + response.status() + " " + await response.text());
  return response.json();
}
async function user(nickname) {
  const username = "评测" + nickname + Date.now().toString(36);
  return { username, ...await req("/auth/register", "POST", { username, nickname, password: "Shopping123!" }) };
}
async function buy() {
  const order = await req("/products/" + product.id + "/buy", "POST", {
    quantity: 1, recipient: "虚拟体验人", phone: "13800000000", address: "演示路100号（虚拟地址）",
    requestKey: randomUUID(), expectedPrice: 39.9,
  }, buyer.token);
  pending.add(order.orderNo);
  return order;
}
async function ship(order) {
  await req("/me/orders/" + order.orderNo + "/demo-pay", "POST", undefined, buyer.token);
  await req("/shop/orders/" + order.orderNo + "/ship", "POST", undefined, seller.token);
}
async function shot(name, target) {
  await page.locator(".toast").waitFor({ state: "hidden" });
  await target.screenshot({ path: output + name + ".jpg", type: "jpeg", quality: 86 });
}
async function fits() { return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
try {
  seller = await user("小店主"); buyer = await user("体验官");
  await req("/shop/register", "POST", { name: "暖日生活 · 评价验收" }, seller.token);
  product = await req("/shop/products", "POST", {
    name: "暖日陶瓷杯 · 评价体验", price: 39.9, stock: 10, imageUrl: "/media/shop-cup.svg",
    description: "一杯温暖，陪伴每个追剧的夜晚。虚拟验收商品。",
  }, seller.token);
  const url = base + "/#product/" + product.id;
  const publicPath = "**/api/mall/products/" + product.id + "/reviews";
  const eligiblePath = "**/api/me/products/" + product.id + "/reviewable-orders";
  const publishPath = "**/api/me/products/" + product.id + "/reviews";
  await page.goto(url);
  await page.getByText("还没有评价，成为第一个分享体验的人吧。", { exact: true }).waitFor();
  check("游客可读评价且空评分显示横线", (await page.locator(".review-score strong").innerText()) === "—");
  await page.getByRole("button", { name: "登录后评价，分享你的使用感受" }).click();
  await page.getByLabel("用户名", { exact: true }).fill(buyer.username);
  await page.getByLabel("密码", { exact: true }).fill("Shopping123!");
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await page.getByText("暂无待评价订单。确认收货后可评价，已评价的订单无需重复提交。", { exact: true }).waitFor();
  check("没有已完成订单时不显示发布表单", await page.locator(".review-editor").count() === 0);
  const first = await buy();
  await page.reload();
  await page.getByText("暂无待评价订单。确认收货后可评价，已评价的订单无需重复提交。", { exact: true }).waitFor();
  check("待付款订单不可提前评价", await page.locator(".review-editor").count() === 0);
  await ship(first);
  await page.goto(base + "/#orders");
  await page.getByRole("button", { name: "确认收货", exact: true }).click();
  await page.getByRole("button", { name: "评价商品", exact: true }).waitFor();
  pending.delete(first.orderNo);
  await page.getByRole("button", { name: "评价商品", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "商品评价", exact: true });
  await modal.getByRole("textbox", { name: "评价内容", exact: true }).waitFor();
  check("收货后从订单直接打开评价", await modal.isVisible());
  check("未选择评分时不允许发布", await modal.getByRole("button", { name: "发布评价" }).isDisabled());
  await modal.getByRole("radio", { name: "4星", exact: true }).check();
  await modal.getByRole("radio", { name: "4星", exact: true }).press("ArrowLeft");
  check("评分支持键盘选择", await modal.getByRole("radio", { name: "3星", exact: true }).isChecked());
  await modal.getByRole("radio", { name: "4星", exact: true }).check();
  await modal.getByLabel("评价内容", { exact: true }).fill("   ");
  check("纯空格评价不可提交", await modal.getByRole("button", { name: "发布评价" }).isDisabled());
  const content = "杯子手感舒适，容量适合日常喝茶。颜色比预想稍深，整体满意。";
  await modal.getByLabel("评价内容", { exact: true }).fill(content);
  await shot("desktop-order-review", modal);
  await page.route(publishPath, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "评价暂时提交失败，请重试" }) }));
  await modal.getByRole("button", { name: "发布评价", exact: true }).click();
  await modal.getByRole("alert").filter({ hasText: "评价暂时提交失败，请重试" }).waitFor();
  check("提交失败保留评分和正文", await modal.getByLabel("评价内容").inputValue() === content && await modal.getByRole("radio", { name: "4星", exact: true }).isChecked());
  await page.unroute(publishPath);
  await shot("desktop-review-retry", modal);
  await modal.getByRole("button", { name: "发布评价", exact: true }).click();
  await modal.locator(".review-item").filter({ hasText: content }).waitFor();
  check("发布成功展示真实内容和评分", await modal.locator(".review-score strong").innerText() === "4.0");
  await page.getByRole("button", { name: "关闭商品评价" }).click();
  await page.getByRole("button", { name: "查看评价", exact: true }).waitFor();
  check("订单按钮更新为查看评价", true);
  await page.goto(url);
  await page.locator(".review-item").filter({ hasText: content }).waitFor();
  check("详情页刷新后评价持久化", await page.locator(".review-item").count() === 1);
  await shot("desktop-product-reviews", page.locator(".product-reviews"));
  await page.route(eligiblePath, (route) => route.abort());
  await page.reload();
  await page.locator(".product-reviews").getByRole("alert").waitFor();
  check("待评价读取失败明确报错", await page.locator(".product-reviews").getByRole("alert").innerText() === "暂时连接不上服务，请稍后重试");
  await page.unroute(eligiblePath);
  await page.locator(".product-reviews").getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText("暂无待评价订单。确认收货后可评价，已评价的订单无需重复提交。", { exact: true }).waitFor();
  check("待评价失败可重试恢复", true);
  await page.route(publicPath, (route) => route.abort());
  await page.reload();
  await page.locator(".product-reviews").getByRole("alert").waitFor();
  await page.unroute(publicPath);
  await page.locator(".product-reviews").getByRole("button", { name: "重试", exact: true }).click();
  await page.locator(".review-item").waitFor();
  check("评价列表请求失败可重试", true);
  const second = await buy(); const third = await buy();
  for (const order of [second, third]) {
    await ship(order);
    await req("/me/orders/" + order.orderNo + "/complete", "POST", undefined, buyer.token);
    pending.delete(order.orderNo);
  }
  await page.reload();
  await page.getByLabel("评价订单", { exact: true }).waitFor();
  check("复购可选择两笔不同待评价订单", await page.getByLabel("评价订单", { exact: true }).locator("option").count() === 2 &&
    (await page.getByLabel("评价订单", { exact: true }).innerText()).includes("尾号") &&
    !(await page.getByLabel("评价订单", { exact: true }).innerText()).includes(second.orderNo));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByLabel("评价订单", { exact: true }).selectOption(second.orderNo);
    await page.getByRole("radio", { name: "5星", exact: true }).check();
    await page.getByLabel("评价内容", { exact: true }).fill("再次购买，分享新的使用感受。");
    await page.locator(".product-reviews").scrollIntoViewIfNeeded();
    check(width + "px评分和订单选择无横向溢出", await fits());
    await shot("mobile-" + width + "-reviews", page.locator(".product-reviews"));
  }
  await req("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller.token);
  await page.goto(base + "/#orders");
  await page.locator(".order-card").filter({ hasText: second.orderNo }).getByRole("button", { name: "评价商品", exact: true }).click();
  await modal.getByLabel("评价订单", { exact: true }).waitFor();
  check("订单入口预选对应订单且下架不影响评价", await modal.getByLabel("评价订单", { exact: true }).inputValue() === second.orderNo);
  await modal.getByRole("radio", { name: "5星", exact: true }).check();
  await modal.getByLabel("评价内容").fill("再次购买，包装完整。下架后仍可补充本次购物体验。");
  check("320px订单评价弹窗无溢出", await fits());
  await shot("mobile-320-order-review", modal);
  await modal.getByRole("button", { name: "发布评价" }).click();
  await modal.locator(".review-score strong").filter({ hasText: "4.5" }).waitFor();
  check("复购评价正确汇总平均分", true);
  await page.getByRole("button", { name: "关闭商品评价" }).click();
  await req("/shop/products/" + product.id + "/status", "PUT", { onSale: true }, seller.token);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.goto(url);
  await page.locator(".review-item").nth(1).waitFor();
  check("退出登录后仍可查看评价且不能直接发布", await page.locator(".review-score strong").innerText() === "4.5" && await page.locator(".review-editor").count() === 0);
  check("页面无未捕获脚本异常", errors.length === 0);
} catch (error) {
  await page.screenshot({ path: output + "failure.png", fullPage: true });
  console.error((await page.locator(".product-reviews").innerText().catch(() => "评价面板未加载")).slice(0, 1800));
  throw error;
} finally {
  for (const no of pending) await req("/me/orders/" + no + "/cancel", "POST", undefined, buyer.token);
  if (product) await req("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller.token);
  await browser.close();
}
console.log("\n" + count + " product review browser checks passed.");
