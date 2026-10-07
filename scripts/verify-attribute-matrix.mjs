import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = (process.env.APP_URL || "http://127.0.0.1:8080") + "/api";
let count = 0;
let seller;
let buyer;
let product;
const pending = [];

function check(name, ok) { assert.ok(ok, name); console.log("PASS " + ++count + ": " + name); }
async function req(path, method = "GET", data, token) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}
async function user(label) {
  const response = await req("/auth/register", "POST", {
    username: "属性矩阵" + label + Date.now().toString(36),
    nickname: label,
    password: "Shopping123!",
  });
  assert.equal(response.status, 201);
  return response.data.token;
}

try {
  seller = await user("店主");
  buyer = await user("买家");
  check("未登录不能读取属性矩阵", (await req("/shop/products/1/attributes")).status === 401);
  check("店主成功开通商城店铺", (await req("/shop/register", "POST", { name: "属性矩阵验收店" }, seller)).status === 201);
  product = (await req("/shop/products", "POST", { name: "属性矩阵验收杯", price: 29.9, stock: 10, imageUrl: "/media/shop-cup.svg" }, seller)).data;

  let matrix = await req("/shop/products/" + product.id + "/attributes", "GET", undefined, seller);
  check("新商品属性矩阵初始为空", matrix.status === 200 && matrix.data.groups.length === 0 && matrix.data.variants.length === 0);
  const groups = [
    { name: "颜色", values: [{ value: "米白" }, { value: "雾蓝" }] },
    { name: "容量", values: [{ value: "350毫升" }, { value: "500毫升" }] },
  ];
  const variants = [
    { valueIds: [-1, -1], price: 29.9, stock: 3, onSale: true },
    { valueIds: [-1, -2], price: 32.9, stock: 2, onSale: true },
    { valueIds: [-2, -1], price: 31.9, stock: 4, onSale: true },
    { valueIds: [-2, -2], price: 35.9, stock: 1, onSale: true },
  ];
  const legacyOrder = await req("/products/" + product.id + "/buy", "POST", {
    quantity: 1, recipient: "虚拟体验人", phone: "13800000000", address: "演示路100号",
    requestKey: randomUUID(), expectedPrice: 29.9,
  }, buyer);
  assert.equal(legacyOrder.status, 201);
  matrix = await req("/shop/products/" + product.id + "/attributes", "GET", undefined, seller);
  const blocked = await req("/shop/products/" + product.id + "/attributes", "PUT", { version: matrix.data.version, groups, variants }, seller);
  check("未付款旧订单阻止首次启用属性矩阵并返回中文原因", blocked.status === 409 && JSON.stringify(blocked.data).includes("未付款的旧款订单"));
  const afterBlocked = await req("/shop/products/" + product.id + "/attributes", "GET", undefined, seller);
  check("启用失败不会留下属性或组合半成品", afterBlocked.data.groups.length === 0 && afterBlocked.data.variants.length === 0 && afterBlocked.data.version === matrix.data.version);
  assert.equal((await req("/me/orders/" + legacyOrder.data.orderNo + "/cancel", "POST", undefined, buyer)).status, 200);
  const afterCancel = await req("/mall/products/" + product.id);
  check("旧订单取消后库存完整返还", afterCancel.data.stock === 10);
  matrix = await req("/shop/products/" + product.id + "/attributes", "GET", undefined, seller);
  const saved = await req("/shop/products/" + product.id + "/attributes", "PUT", { version: matrix.data.version, groups, variants }, seller);
  check("新属性值可以一次生成四种组合", saved.status === 200 && saved.data.groups.length === 2 && saved.data.variants.length === 4);
  check("组合自动生成可读名称", saved.data.variants.some(v => v.name === "米白 / 350毫升") && saved.data.variants.some(v => v.name === "雾蓝 / 500毫升"));
  check("每种组合保存独立价格和库存", saved.data.variants.find(v => v.name === "雾蓝 / 500毫升").price === 35.9 && saved.data.variants.find(v => v.name === "雾蓝 / 500毫升").stock === 1);

  const detail = await req("/mall/products/" + product.id);
  check("公开商品详情返回属性组", detail.status === 200 && detail.data.attributeGroups.length === 2 && detail.data.variants.every(v => v.valueIds.length === 2));
  const sku = saved.data.variants.find(v => v.name === "米白 / 350毫升");
  const cart = await req("/me/cart/" + product.id, "POST", { quantity: 1, skuId: sku.id }, buyer);
  check("买家可以按属性组合加入购物车", cart.status === 200);
  const cartRows = await req("/me/cart", "GET", undefined, buyer);
  check("购物车保存属性组合规格快照", cartRows.data.some(v => v.skuId === sku.id && v.variantName === sku.name));
  // Re-submit the saved matrix with real database IDs.  The duplicate row is
  // intentionally a new SKU pointing at an already-used value combination;
  // this exercises the combination-key guard instead of the new-value path.
  const savedGroups = saved.data.groups.map(group => ({
    id: group.id,
    name: group.name,
    values: group.values.map(value => ({ id: value.id, value: value.value })),
  }));
  const savedVariantInputs = saved.data.variants.map(variant => ({
    id: variant.id,
    valueIds: variant.valueIds,
    price: variant.price,
    stock: variant.stock,
    onSale: Boolean(variant.onSale),
  }));
  const reversed = await req("/shop/products/" + product.id + "/attributes", "PUT", {
    version: saved.data.version, groups: savedGroups,
    variants: savedVariantInputs.map((v, i) => i === 0 ? { ...v, valueIds: [...v.valueIds].reverse() } : v),
  }, seller);
  check("属性组顺序错配被中文校验拒绝", reversed.status === 400 && JSON.stringify(reversed.data).includes("按属性组顺序"));
  const unchanged = await req("/shop/products/" + product.id + "/attributes", "GET", undefined, seller);
  check("错误组合不会修改已有名称库存或版本", JSON.stringify(unchanged.data) === JSON.stringify(saved.data));
  const duplicate = await req("/shop/products/" + product.id + "/attributes", "PUT", {
    version: saved.data.version,
    groups: savedGroups,
    variants: [...savedVariantInputs, {
      valueIds: savedVariantInputs[0].valueIds,
      price: savedVariantInputs[0].price,
      stock: 1,
      onSale: true,
    }],
  }, seller);
  check("重复属性组合被拒绝", duplicate.status === 400);
  const tooMany = Array.from({ length: 21 }, (_, i) => ({ value: "值" + i }));
  const invalid = await req("/shop/products/" + product.id + "/attributes", "PUT", { version: saved.data.version, groups: [{ name: "颜色", values: tooMany }], variants: [{ valueIds: [-1], price: 1, stock: 1, onSale: true }] }, seller);
  check("单个属性值超过上限被拒绝", invalid.status === 400);
  const other = await user("其他");
  check("其他店主不能修改属性矩阵", (await req("/shop/products/" + product.id + "/attributes", "PUT", { version: saved.data.version, groups: savedGroups, variants: savedVariantInputs }, other)).status === 404);
  const resaved = await req("/shop/products/" + product.id + "/attributes", "PUT", { version: saved.data.version, groups: savedGroups, variants: savedVariantInputs }, seller);
  check("真实属性编号可再次保存且组合编号不变", resaved.status === 200 && resaved.data.variants.every((v, i) => v.id === saved.data.variants[i].id && v.name === saved.data.variants[i].name));
  const orders = await req("/me/orders", "GET", undefined, buyer);
  for (const order of orders.data) {
    pending.push(order.orderNo);
    if (order.status === "PENDING") await req("/me/orders/" + order.orderNo + "/cancel", "POST", undefined, buyer);
  }
} finally {
  if (buyer) {
    const orders = await req("/me/orders", "GET", undefined, buyer);
    for (const order of orders.data || []) if (order.status === "PENDING") await req("/me/orders/" + order.orderNo + "/cancel", "POST", undefined, buyer);
  }
  if (seller && product) await req("/shop/products/" + product.id + "/status", "PUT", { onSale: false }, seller);
}
console.log("\n" + count + " attribute matrix checks passed.");
