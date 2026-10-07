// Writes disposable virtual data. Run only against the explicitly selected test server.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

assert.ok(process.argv.includes("--test-environment") && process.env.APP_URL,
  "指定APP_URL并传入--test-environment；本脚本会创建2个账号、1件商品、虚拟地址和演示订单");
const base = new URL(process.env.APP_URL);
let passed = 0;
const pending = new Set();
let seller, buyer, product, address;
const suffix = randomBytes(5).toString("hex");
const check = (name, ok) => { assert.ok(ok, name); console.log(`PASS ${++passed}: ${name}`); };
async function req(path, method = "GET", data, token) {
  const response = await fetch(new URL("/api" + path, base), {
    method, signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}
async function account(label) {
  const input = { username: "云验" + label + suffix, nickname: "虚拟验收" + label, password: randomBytes(24).toString("hex") };
  const created = await req("/auth/register", "POST", input);
  check(label + "中文用户名注册成功", created.status === 201 && created.data.user.role === "USER");
  const wrong = await req("/auth/login", "POST", { username: input.username, password: "incorrect-test-password" });
  check(label + "错误密码返回中文提示", wrong.status === 401 && /用户名或密码错误/.test(wrong.data.message));
  const logged = await req("/auth/login", "POST", input);
  check(label + "重新登录成功", logged.status === 200 && logged.data.user.id === created.data.user.id);
  const duplicate = await req("/auth/register", "POST", input);
  check(label + "重复注册返回中文提示", duplicate.status === 409 && /用户名/.test(duplicate.data.message));
  return logged.data;
}
try {
  seller = await account("店主");
  buyer = await account("买家");
  check("普通用户不能访问管理后台", (await req("/admin/stats", "GET", undefined, buyer.token)).status === 403);
  const store = await req("/shop/register", "POST", { name: "云端虚拟验收店" + suffix }, seller.token);
  check("个人开店成功", store.status === 201 && store.data.id);
  check("同账号不能重复开店", (await req("/shop/register", "POST", { name: "重复店铺" }, seller.token)).status === 409);
  const created = await req("/shop/products", "POST", {
    name: "云端验收专用商品" + suffix, price: 0.01, stock: 5,
    imageUrl: "/media/shop-cup.svg", description: "全为虚拟测试，测试结束下架，无真实商品或交易。",
  }, seller.token);
  product = created.data;
  check("店主创建独立测试商品", created.status === 201 && product.stock === 5);
  check("买家只能看到自己的空订单", (await req("/me/orders", "GET", undefined, buyer.token)).data.length === 0);
  const invalid = await req("/products/" + product.id + "/buy", "POST", { quantity: 1 }, buyer.token);
  check("缺少收货信息被中文校验拒绝", invalid.status === 400 && /[\u4e00-\u9fff]/.test(invalid.data.message));
  const payload = {
    quantity: 2, recipient: "虚拟验收人", phone: "00000000000", address: "虚拟测试省测试市测试街道（不可配送）",
    expectedPrice: 0.01, requestKey: randomBytes(16).toString("hex"),
  };
  const purchased = await req("/products/" + product.id + "/buy", "POST", payload, buyer.token);
  if (purchased.data.orderNo) pending.add(purchased.data.orderNo);
  check("32位请求标识可创建立即购买订单", purchased.status === 201 && purchased.data.status === "PENDING" && Number(purchased.data.totalAmount) === 0.02);
  const repeated = await req("/products/" + product.id + "/buy", "POST", payload, buyer.token);
  check("重试不重复下单扣库存", repeated.data.orderNo === purchased.data.orderNo && (await req("/mall/products/" + product.id)).data.stock === 3);
  check("其他账号不能读取买家订单", (await req("/me/orders/" + purchased.data.orderNo, "GET", undefined, seller.token)).status === 404);
  const cancelled = await req("/me/orders/" + purchased.data.orderNo + "/cancel", "POST", undefined, buyer.token);
  check("取消订单准确返还库存", cancelled.data.status === "CANCELLED" && (await req("/mall/products/" + product.id)).data.stock === 5);
  pending.delete(purchased.data.orderNo);
  await req("/me/orders/" + purchased.data.orderNo + "/cancel", "POST", undefined, buyer.token);
  check("重复取消不多返库存", (await req("/mall/products/" + product.id)).data.stock === 5);
  const addressResult = await req("/me/addresses", "POST", {
    recipient: payload.recipient, phone: payload.phone, region: "虚拟测试省测试市", detail: "测试街道（不可配送）", label: "其他", isDefault: true,
  }, buyer.token);
  address = addressResult.data;
  check("虚拟地址可保存且仅本人可见", addressResult.status === 201 && (await req("/me/addresses", "GET", undefined, seller.token)).data.length === 0);
  check("加入购物车成功", (await req("/me/cart/" + product.id, "POST", { quantity: 1 }, buyer.token)).status === 200);
  const checkoutPayload = { addressId: address.id, items: [{ productId: product.id, quantity: 1, expectedPrice: 0.01 }], requestKey: randomBytes(16).toString("hex") };
  const checkout = await req("/me/cart/checkout", "POST", checkoutPayload, buyer.token);
  for (const order of checkout.data.orders || []) pending.add(order.orderNo);
  check("32位请求标识可完成购物车结算", checkout.status === 201 && checkout.data.orders.length === 1 && Number(checkout.data.totalAmount) === 0.01);
  const checkoutAgain = await req("/me/cart/checkout", "POST", checkoutPayload, buyer.token);
  check("购物车结算重试只返回原批次", checkoutAgain.data.batchId === checkout.data.batchId && (await req("/mall/products/" + product.id)).data.stock === 4);
  check("结算后购物车为空", (await req("/me/cart", "GET", undefined, buyer.token)).data.length === 0);
  const no = checkout.data.orders[0].orderNo;
  check("模拟付款成功（无真实扣款）", (await req("/me/orders/" + no + "/demo-pay", "POST", undefined, buyer.token)).data.status === "PAID");
  pending.delete(no);
  check("店主演示发货成功", (await req("/shop/orders/" + no + "/ship", "POST", undefined, seller.token)).data.status === "SHIPPED");
  check("买家确认收货成功", (await req("/me/orders/" + no + "/complete", "POST", undefined, buyer.token)).data.status === "COMPLETED");
  const timeline = (await req("/me/orders/" + no, "GET", undefined, buyer.token)).data.events;
  check("订单时间线完整", timeline.map((event) => event.status).join(",") === "PENDING,PAID,SHIPPED,COMPLETED");
} finally {
  const cleanupErrors = [];
  async function cleanup(path, method, data, token) {
    try { const result = await req(path, method, data, token); if (result.status !== 200) cleanupErrors.push(`${method} ${path}: ${result.status}`); }
    catch (error) { cleanupErrors.push(`${method} ${path}: ${error.message}`); }
  }
  for (const no of pending) await cleanup("/me/orders/" + no + "/cancel", "POST", undefined, buyer.token);
  if (product?.id && buyer) await cleanup("/me/cart/" + product.id, "DELETE", undefined, buyer.token);
  if (address?.id) await cleanup("/me/addresses/" + address.id, "DELETE", undefined, buyer.token);
  if (product?.id) await cleanup("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller.token);
  assert.equal(cleanupErrors.length, 0, "测试收尾失败：" + cleanupErrors.join("; "));
  console.log("测试收尾：待付款订单取消、虚拟地址/购物车清空、测试商品下架；保留独立账号和订单记录便于审计。");
  console.log(JSON.stringify({ sellerId: seller?.user.id, buyerId: buyer?.user.id, productId: product?.id }));
}
console.log(`${passed} 项云端交易检查通过：${base.origin}`);
