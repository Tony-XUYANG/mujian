import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.APP_URL || "http://127.0.0.1:8080";
const output = fileURLToPath(new URL("../docs/screenshots/attribute-matrix/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
let count = 0;
const check = (name, ok) => { assert.ok(ok, name); console.log("PASS " + ++count + ": " + name); };
async function api(path, method = "GET", data, token) {
  const r = await context.request.fetch(base + "/api" + path, { method, data, headers: token ? { Authorization: "Bearer " + token } : {} });
  assert.ok(r.ok(), path + " " + r.status() + " " + await r.text());
  return r.json();
}
async function user(label) {
  const username = "矩阵界面" + label + Date.now().toString(36);
  return { username, ...(await api("/auth/register", "POST", { username, password: "Matrix123!", nickname: label })) };
}
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
try {
  const seller = await user("店主");
  const buyer = await user("买家");
  await api("/shop/register", "POST", { name: "属性组合界面验收店" }, seller.token);
  const product = await api("/shop/products", "POST", { name: "矩阵随行杯", price: 29.9, stock: 8, imageUrl: "/media/shop-cup.svg", description: "属性矩阵浏览器验收商品" }, seller.token);
  await page.goto(base + "/#merchant");
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).last().click();
  await page.getByLabel("用户名", { exact: true }).fill(seller.username);
  await page.getByLabel("密码", { exact: true }).fill("Matrix123!");
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await page.getByRole("button", { name: "属性组合", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "属性组合", exact: true });
  await modal.getByLabel("属性组名称1", { exact: true }).waitFor();
  await modal.getByLabel("颜色属性值1", { exact: true }).fill("奶油白");
  await modal.getByRole("button", { name: "添加属性值", exact: true }).click();
  await modal.getByLabel("颜色属性值2", { exact: true }).fill("雾蓝");
  await modal.getByRole("button", { name: "添加属性组", exact: true }).click();
  await modal.getByLabel("属性组名称2", { exact: true }).fill("容量");
  await modal.getByLabel("容量属性值1", { exact: true }).fill("350毫升");
  await modal.getByRole("button", { name: "添加属性值", exact: true }).last().click();
  await modal.getByLabel("容量属性值2", { exact: true }).fill("500毫升");
  await modal.getByRole("button", { name: "生成组合", exact: true }).click();
  await modal.getByLabel("组合售价1", { exact: true }).waitFor();
  check("商家可生成颜色与容量组合", await modal.locator(".attribute-combination-row").count() === 4);
  await modal.getByLabel("组合库存1", { exact: true }).fill("3");
  await modal.getByLabel("组合库存2", { exact: true }).fill("2");
  await modal.getByLabel("组合库存3", { exact: true }).fill("4");
  await modal.getByLabel("组合库存4", { exact: true }).fill("1");
  await modal.getByRole("button", { name: "保存属性组合", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  check("商家保存属性组合后弹窗关闭", true);
  await page.screenshot({ path: output + "desktop-merchant-attribute-matrix.jpg", type: "jpeg", quality: 86, fullPage: true });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.goto(base + "/#product/" + product.id);
  const picker = page.getByRole("region", { name: "商品属性" });
  await picker.getByRole("button", { name: "奶油白", exact: true }).waitFor();
  await picker.getByRole("button", { name: "奶油白", exact: true }).click();
  await picker.getByRole("button", { name: "500毫升", exact: true }).click();
  check("买家可按颜色和容量选择具体组合", (await page.locator(".selected-variant").innerText()).includes("奶油白 / 500毫升"));
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).last().click();
  await page.getByLabel("用户名", { exact: true }).fill(buyer.username);
  await page.getByLabel("密码", { exact: true }).fill("Matrix123!");
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await picker.getByRole("button", { name: "奶油白", exact: true }).click();
  await picker.getByRole("button", { name: "500毫升", exact: true }).click();
  await page.getByRole("button", { name: "加入购物车", exact: true }).click();
  await page.locator(".toast").filter({ hasText: "已加入购物车" }).waitFor();
  check("买家按属性选择后可以加入购物车", true);
  await page.screenshot({ path: output + "desktop-buyer-attribute-picker.jpg", type: "jpeg", quality: 86, fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + "/#product/" + product.id);
    await page.getByRole("region", { name: "商品属性" }).waitFor();
    check(width + "px属性选择无横向溢出", await fits());
    await page.screenshot({ path: output + "mobile-" + width + "-attribute-picker.jpg", type: "jpeg", quality: 86, fullPage: true });
  }
  check("浏览器无脚本异常", errors.length === 0);
  const orders = await api("/me/orders", "GET", undefined, buyer.token);
  for (const order of orders) if (order.status === "PENDING") await api("/me/orders/" + order.orderNo + "/cancel", "POST", undefined, buyer.token);
  await api("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller.token);
} finally { await browser.close(); }
console.log("\n" + count + " attribute matrix browser checks passed.");
