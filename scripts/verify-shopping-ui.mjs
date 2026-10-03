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
  new URL("../docs/screenshots/shopping/", import.meta.url),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error" && msg.text().includes("cannot be a descendant"))
    errors.push(msg.text());
});
let count = 0;
function check(name, ok) {
  assert.ok(ok, name);
  console.log("PASS " + ++count + ": " + name);
}
let sellerToken, buyerToken, p1, p2;
async function req(path, method = "GET", data, auth) {
  const r = await context.request.fetch(base + "/api" + path, {
    method,
    data,
    headers: auth ? { Authorization: "Bearer " + auth } : {},
  });
  assert.ok(r.ok(), path + " " + r.status() + " " + (await r.text()));
  return r.json();
}
async function user(label) {
  const username = "细购" + label + Date.now().toString(36);
  return {
    ...(await req("/auth/register", "POST", {
      username,
      password: "Shopping123!",
      nickname: label,
    })),
    username,
  };
}
async function shot(name) {
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({
    path: output + name + ".jpg",
    fullPage: page.viewportSize().width > 600,
    quality: 86,
  });
}
async function fits() {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  );
}
try {
  await page.goto(base + "/#mall");
  await page.locator(".product-card").first().waitFor();
  check(
    "商城场景推荐及六类入口",
    (await page.getByLabel("商品分类入口").getByRole("button").count()) === 6,
  );
  await shot("desktop-mall");
  await page
    .getByLabel("商品分类筛选")
    .getByRole("button", { name: "家居香氛", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".product-card-meta")].length > 0 &&
      [...document.querySelectorAll(".product-card-meta")].every((n) =>
        n.textContent.includes("家居香氛"),
      ),
  );
  check("分类点击实际筛选商品", true);
  await page
    .getByLabel("商品分类筛选")
    .getByRole("button", { name: "全部好物", exact: true })
    .click();
  await page.getByLabel("搜索商品").fill("陶瓷");
  await page.waitForFunction(
    () => document.querySelectorAll(".product-card").length === 1,
  );
  await page.locator(".product-card").click();
  await page.getByRole("heading", { name: "商品参数" }).waitFor();
  check(
    "商品详情含材质规格与产地",
    await page
      .locator(".product-spec-table")
      .innerText()
      .then((t) => t.includes("陶瓷") && t.includes("350")),
  );
  await shot("desktop-product");
  const seller = await user("小店主");
  sellerToken = seller.token;
  await req(
    "/shop/register",
    "POST",
    { name: "日常小物 · 详版验收" },
    sellerToken,
  );
  const details = {
    category: "生活日用",
    material: "陶瓷",
    specification: "350毫升",
    origin: "江西",
    shippingFrom: "景德镇",
    detailText: "柔和的奶油色，陪伴放松时光。\n当前为演示商品。",
    images: ["/media/shop-cup.svg", "/media/shop-bag.svg"],
  };
  p1 = await req(
    "/shop/products",
    "POST",
    {
      name: "详版体验杯",
      price: 39.9,
      stock: 20,
      imageUrl: "/media/shop-cup.svg",
      description: "虚拟浏览器验收商品",
      details,
    },
    sellerToken,
  );
  p2 = await req(
    "/shop/products",
    "POST",
    {
      name: "详版体验手帐",
      price: 19.9,
      stock: 20,
      imageUrl: "/media/shop-book.svg",
      description: "虚拟浏览器验收商品",
      details: {
        ...details,
        category: "文具书籍",
        material: "纸质",
        specification: "A5 · 单本装",
        images: ["/media/shop-book.svg"],
      },
    },
    sellerToken,
  );
  const sellerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const sellerPage = await sellerContext.newPage();
  await sellerPage.goto(base + "/#merchant");
  await sellerPage
    .getByRole("button", { name: "登录 / 注册", exact: true })
    .last()
    .click();
  await sellerPage.getByLabel("用户名", { exact: true }).fill(seller.username);
  await sellerPage.getByLabel("密码", { exact: true }).fill("Shopping123!");
  await sellerPage
    .getByRole("button", { name: "登录幕间", exact: true })
    .click();
  await sellerPage
    .getByRole("heading", { name: p1.name, exact: true })
    .waitFor();
  await sellerPage
    .locator(".merchant-product-list article")
    .filter({ hasText: p1.name })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  const productForm = sellerPage.getByRole("dialog", {
    name: "编辑商品",
    exact: true,
  });
  await productForm.getByLabel("商品材质", { exact: true }).fill("釉面陶瓷");
  await productForm
    .getByLabel("规格说明", { exact: true })
    .fill("350毫升 · 单只装");
  await productForm
    .getByLabel("商品相册链接（每行一张，最多6张）", { exact: true })
    .fill("/media/shop-cup.svg\n/media/shop-bag.svg");
  await productForm
    .getByLabel("图文详情", { exact: true })
    .fill("放松时光的日常好物。\n这是一件演示商品，不会实际寄送。");
  await sellerPage.locator(".toast").waitFor({ state: "hidden" });
  await sellerPage.screenshot({
    path: output + "desktop-merchant-details.jpg",
    fullPage: false,
    quality: 86,
  });
  await productForm
    .getByRole("button", { name: "保存商品", exact: true })
    .click();
  await productForm.waitFor({ state: "hidden" });
  const edited = await req("/mall/products/" + p1.id);
  check(
    "商家详情表单保存材质规格",
    edited.material === "釉面陶瓷" && edited.specification.includes("单只装"),
  );
  check("商家相册按换行保存多图", JSON.parse(edited.imagesJson).length === 2);
  await sellerContext.close();
  const buyer = await user("生活体验官");
  buyerToken = buyer.token;
  await page.goto(base + "/#product/" + p1.id);
  await page.getByRole("button", { name: "收藏好物", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill(buyer.username);
  await page.getByLabel("密码", { exact: true }).fill("Shopping123!");
  await page.getByRole("button", { name: "登录幕间", exact: true }).click();
  await page.getByRole("button", { name: "收藏好物", exact: true }).waitFor();
  await page.getByRole("button", { name: "查看商品图片2" }).click();
  check(
    "多图缩略图可切换",
    (await page.locator(".detail-picture img").getAttribute("src")) ===
      "/media/shop-bag.svg",
  );
  await page.getByRole("button", { name: "收藏好物", exact: true }).click();
  await page.getByRole("button", { name: "已收藏", exact: true }).waitFor();
  check("收藏好物实时同步", true);
  await page.getByRole("button", { name: "加入购物车", exact: true }).click();
  await page.locator(".toast").filter({ hasText: "已加入购物车" }).waitFor();
  await page.goto(base + "/#product/" + p2.id);
  await page.getByRole("button", { name: "加入购物车", exact: true }).click();
  await page.locator(".toast").filter({ hasText: "已加入购物车" }).waitFor();
  await page.getByRole("button", { name: "打开购物车", exact: true }).click();
  await page.locator(".cart-line").last().waitFor();
  check(
    "购物车按店铺分组",
    (await page.locator(".cart-shop").count()) === 1 &&
      (await page.locator(".cart-line").count()) === 2,
  );
  await page
    .getByRole("button", { name: "增加详版体验杯", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".cart-checkout-bar")
      ?.textContent?.includes("99.70"),
  );
  check("调整数量刷新金额", true);
  await req("/me/cart/" + p1.id, "PUT", { quantity: 5 }, buyerToken);
  async function setCupStock(stock) {
    const current = await req("/mall/products/" + p1.id);
    await req("/shop/products/" + p1.id, "PATCH", {
      name: current.name, price: current.price, stock, version: current.version,
      imageUrl: current.imageUrl, description: current.description,
    }, sellerToken);
  }
  await setCupStock(2);
  await page.getByRole("button", { name: "刷新购物车", exact: true }).click();
  await page.getByText("库存不足，剩余2件", { exact: true }).waitFor();
  check("库存减少后禁止勾选超量商品", await page.getByLabel("选择详版体验杯", { exact: true }).isDisabled());
  await page.getByRole("button", { name: "减少详版体验杯", exact: true }).click();
  await page.waitForFunction(() => {
    const line = [...document.querySelectorAll(".cart-line")].find(n => n.textContent.includes("详版体验杯"));
    return line?.querySelector(".quantity-stepper span")?.textContent === "2" && !line.querySelector("input").disabled;
  });
  check("库存骤降后可以直接减少至可购买数量", (await req("/me/cart", "GET", undefined, buyerToken)).find(p => p.id === p1.id).quantity === 2);
  await setCupStock(20);
  await page.getByRole("button", { name: "刷新购物车", exact: true }).click();
  await page.getByRole("button", { name: "去结算 (2)", exact: true }).waitFor();
  await shot("desktop-cart");
  await page.getByRole("button", { name: "去结算 (2)", exact: true }).click();
  const checkout = page.getByRole("dialog", { name: "购物车结算" });
  await checkout.getByRole("button", { name: "新增地址", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "新增收货地址" });
  await editor.getByLabel("收货人", { exact: true }).fill("虚拟体验人");
  await editor.getByLabel("联系电话").fill("13800000000");
  await editor.getByLabel("所在地区").fill("浙江省 杭州市 西湖区");
  await editor.getByLabel("详细地址").fill("演示路100号（虚拟地址）");
  await editor
    .getByRole("button", { name: "保存收货地址", exact: true })
    .click();
  await editor.waitFor({ state: "hidden" });
  await checkout
    .getByRole("button", { name: "提交演示订单", exact: true })
    .waitFor();
  check(
    "结算内新增地址不会误提交订单",
    (await req("/me/orders", "GET", undefined, buyerToken)).length === 0,
  );
  await shot("desktop-checkout");
  await checkout
    .getByRole("button", { name: "提交演示订单", exact: true })
    .click();
  await page.getByRole("heading", { name: "我的订单", exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".order-card").length === 2,
  );
  check("多商品结算展示独立订单", true);
  await page
    .locator(".order-card")
    .first()
    .getByRole("button", { name: "模拟支付", exact: true })
    .click();
  await page.locator(".order-state").filter({ hasText: "待发货" }).waitFor();
  await page.locator(".order-detail-trigger").first().click();
  await page.getByRole("dialog", { name: "订单详情" }).waitFor();
  await page.locator(".order-timeline li").last().waitFor();
  check(
    "订单详情时间线显示下单与付款",
    await page
      .locator(".order-timeline")
      .innerText()
      .then((t) => t.includes("订单已提交") && t.includes("模拟支付完成")),
  );
  await shot("desktop-order-detail");
  await page.getByRole("button", { name: "关闭订单详情" }).click();
  await page.goto(base + "/#addresses");
  await page.locator(".address-card").waitFor();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("详细地址").fill("演示路200号（虚拟地址）");
  await page.getByRole("button", { name: "保存收货地址", exact: true }).click();
  await page.locator(".address-card").filter({ hasText: "200号" }).waitFor();
  check("地址编辑保存", true);
  await page.goto(base + "/#product/" + p1.id);
  await page.getByRole("button", { name: "立即购买", exact: true }).click();
  await page.getByLabel("收货地址", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("textarea")].some((n) =>
      n.value.includes("200号"),
    ),
  );
  check("立即购买自动填充默认地址", true);
  await page.getByRole("button", { name: "关闭结算" }).click();
  await page.goto(base + "/#product-favorites");
  await page.locator(".product-card").waitFor();
  check(
    "好物收藏独立于短剧收藏",
    (await page.locator(".product-card").count()) === 1,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route, selector, name] of [
      ["mall", ".product-card", "mall"],
      ["product/" + p1.id, ".product-spec-table", "product"],
      ["addresses", ".address-card", "addresses"],
      ["product-favorites", ".product-card", "favorites"],
      ["orders", ".order-card", "orders"],
    ]) {
      await page.goto(base + "/#" + route);
      await page.locator(selector).first().waitFor();
      check(width + "px " + name + " 无横向溢出", await fits());
      await shot("mobile-" + width + "-" + name);
    }
    await req("/me/cart/" + p1.id, "POST", { quantity: 1 }, buyerToken);
    await page.goto(base + "/#cart");
    await page.locator(".cart-line").waitFor();
    check(width + "px购物车无横向溢出", await fits());
    await shot("mobile-" + width + "-cart");
    await page.getByRole("button", { name: /去结算/ }).click();
    await page.getByRole("dialog", { name: "购物车结算" }).waitFor();
    await page.getByLabel("选择已保存地址").waitFor();
    check(width + "px结算可选地址", await fits());
    await shot("mobile-" + width + "-checkout");
    await page.getByRole("button", { name: "关闭购物车结算" }).click();
  }
  check("浏览器无脚本异常或嵌套表单错误", errors.length === 0);
} finally {
  if (buyerToken) {
    for (const o of await req("/me/orders", "GET", undefined, buyerToken))
      if (o.status === "PENDING")
        await req(
          "/me/orders/" + o.orderNo + "/cancel",
          "POST",
          undefined,
          buyerToken,
        );
  }
  for (const p of [p1, p2])
    if (p?.id)
      await req(
        "/shop/products/" + p.id + "/status",
        "PUT",
        { onSale: false },
        sellerToken,
      );
  await browser.close();
}
console.log("\n" + count + " detailed shopping browser checks passed.");
