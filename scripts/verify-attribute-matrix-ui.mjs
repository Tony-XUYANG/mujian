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
  await modal.getByLabel("组合售价2", { exact: true }).fill("32.9");
  await modal.getByLabel("组合售价3", { exact: true }).fill("31.9");
  await modal.getByRole("button", { name: "生成组合", exact: true }).click();
  check("重复生成保留交叉组合各自的价格和库存",
    await modal.getByLabel("组合售价2", { exact: true }).inputValue() === "32.9" &&
    await modal.getByLabel("组合售价3", { exact: true }).inputValue() === "31.9" &&
    await modal.getByLabel("组合库存2", { exact: true }).inputValue() === "2" &&
    await modal.getByLabel("组合库存3", { exact: true }).inputValue() === "4");
  await page.screenshot({ path: output + "desktop-merchant-attribute-matrix.jpg", type: "jpeg", quality: 86, fullPage: true });
  await modal.getByRole("button", { name: "保存属性组合", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  check("商家保存属性组合后弹窗关闭", true);
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
  // Keep only white/350 and blue/500 purchasable to exercise switching
  // between combinations that share no attributes. Black is always sold out.
  const matrix = await api("/shop/products/" + product.id + "/attributes", "GET", undefined, seller.token);
  await api("/shop/products/" + product.id + "/attributes", "PUT", {
    version: matrix.version,
    groups: matrix.groups.map((g, i) => i === 0 ? { ...g, values: [...g.values, { value: "曜石黑" }] } : g),
    variants: [...matrix.variants.map((v, i) => ({ ...v, stock: i === 2 ? 0 : v.stock, onSale: i !== 1 })),
      { valueIds: [-3, matrix.groups[1].values[0].id], price: 39.9, stock: 0, onSale: true }],
  }, seller.token);
  await page.reload();
  await picker.getByRole("button", { name: "奶油白", exact: true }).click();
  await picker.getByRole("button", { name: "350毫升", exact: true }).click();
  check("稀疏组合下其他有货颜色仍可切换", await picker.getByRole("button", { name: "雾蓝", exact: true }).isEnabled());
  await picker.getByRole("button", { name: "雾蓝", exact: true }).click();
  check("换色清除冲突容量并要求重新选完整款式",
    (await page.locator(".selected-variant").innerText()).includes("请选择剩余属性") &&
    await picker.getByRole("button", { name: "350毫升", exact: true }).getAttribute("aria-pressed") === "false" &&
    await page.getByRole("button", { name: "加入购物车", exact: true }).isDisabled());
  await picker.getByRole("button", { name: "500毫升", exact: true }).click();
  check("可完成另一稀疏组合选款", (await page.locator(".selected-variant").innerText()).includes("雾蓝 / 500毫升"));
  await picker.getByRole("button", { name: "350毫升", exact: true }).click();
  check("换容量同样清除冲突颜色", await picker.getByRole("button", { name: "雾蓝", exact: true }).getAttribute("aria-pressed") === "false");
  await picker.getByRole("button", { name: "奶油白", exact: true }).click();
  check("可切回原款且完全售罄属性不可选", (await page.locator(".selected-variant").innerText()).includes("奶油白 / 350毫升") && await picker.getByRole("button", { name: "曜石黑", exact: true }).isDisabled());
  await page.screenshot({ path: output + "mobile-320-sparse-switching.jpg", type: "jpeg", quality: 86, fullPage: true });
  const beforeExtension = await api("/shop/products/" + product.id + "/attributes", "GET", undefined, seller.token);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.goto(base + "/#merchant");
  await page.getByRole("button", { name: "登录 / 注册", exact: true }).last().click();
  await page.getByLabel("用户名", { exact: true }).fill(seller.username);
  await page.getByLabel("密码", { exact: true }).fill("Matrix123!");
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await page.getByRole("button", { name: "属性组合", exact: true }).click();
  await modal.getByRole("button", { name: "添加属性组", exact: true }).click();
  await modal.getByLabel("属性组名称3", { exact: true }).fill("包装");
  await modal.getByLabel("包装属性值1", { exact: true }).fill("标准包装");
  await modal.getByRole("button", { name: "生成组合", exact: true }).click();
  await modal.getByRole("button", { name: "生成组合", exact: true }).click();
  check("新增属性组可重新生成完整组合", await modal.locator(".attribute-combination-row").count() === 6);
  await modal.getByRole("button", { name: "保存属性组合", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  const afterExtension = await api("/shop/products/" + product.id + "/attributes", "GET", undefined, seller.token);
  check("新增属性组保留原规格编号价格库存及停售状态", afterExtension.groups.length === 3 &&
    beforeExtension.variants.every(old => afterExtension.variants.some(v => v.id === old.id && v.valueIds.length === 3 && v.stock === old.stock && v.price === old.price && Boolean(v.onSale) === Boolean(old.onSale))) &&
    afterExtension.variants.reduce((sum, v) => sum + v.stock, 0) === beforeExtension.variants.reduce((sum, v) => sum + v.stock, 0));
  check("浏览器无脚本异常", errors.length === 0);
  const orders = await api("/me/orders", "GET", undefined, buyer.token);
  for (const order of orders) if (order.status === "PENDING") await api("/me/orders/" + order.orderNo + "/cancel", "POST", undefined, buyer.token);
  await api("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller.token);
} finally { await browser.close(); }
console.log("\n" + count + " attribute matrix browser checks passed.");
