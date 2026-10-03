// Optional integration checks requiring a disposable/local test database.
// MYSQL_CLI, DB_PASSWORD and (optionally) DB_HOST/DB_PORT/DB_USER/DB_NAME must match APP_URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const base = process.env.APP_URL || "http://127.0.0.1:8080";
assert.ok(
  process.env.MYSQL_CLI && process.env.DB_PASSWORD,
  "Set MYSQL_CLI and DB_PASSWORD for this local database test",
);
function sql(query) {
  return execFileSync(
    process.env.MYSQL_CLI,
    [
      "--no-defaults",
      "--host=" + (process.env.DB_HOST || "127.0.0.1"),
      "--port=" + (process.env.DB_PORT || "3307"),
      "--user=" + (process.env.DB_USER || "mujian"),
      "--database=" + (process.env.DB_NAME || "mujian"),
      "-N",
      "--execute=" + query,
    ],
    {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
      encoding: "utf8",
    },
  ).trim();
}
async function req(path, method = "GET", body, token) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
let count = 0;
function check(name, ok) {
  assert.ok(ok, name);
  console.log("PASS " + ++count + ": " + name);
}
const auth = (
  await req("/auth/register", "POST", {
    username: "过期验收" + Date.now().toString(36),
    password: "Commerce123!",
    nickname: "过期验收",
  })
).data.token;
const shop = (
  await req("/shop/register", "POST", { name: "过期与关店验收" }, auth)
).data;
const p = (
  await req(
    "/shop/products",
    "POST",
    { name: "过期验收商品", price: 99999999.99, stock: 100 },
    auth,
  )
).data;
assert.ok(Number.isSafeInteger(p.id) && Number.isSafeInteger(shop.id));
const create = () =>
  req(
    "/products/" + p.id + "/buy",
    "POST",
    {
      quantity: 99,
      recipient: "虚拟用户",
      phone: "13800000000",
      address: "仅供测试的虚拟地址",
      requestKey: randomUUID(),
    },
    auth,
  );
const expire = (o) => {
  assert.match(o.orderNo, /^MJ[A-F0-9]{26}$/);
  sql(
    "UPDATE shop_order SET expires_at=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 SECOND) WHERE order_no='" +
      o.orderNo +
      "'",
  );
};
try {
  let r = await create();
  check(
    "最大单价和99件订单金额可保存",
    r.status === 201 && Number(r.data.totalAmount) === 9899999999.01,
  );
  expire(r.data);
  let paid = await req(
    "/me/orders/" + r.data.orderNo + "/demo-pay",
    "POST",
    undefined,
    auth,
  );
  check(
    "到期后不能支付且事务提交返库",
    paid.status === 200 &&
      paid.data.status === "CANCELLED" &&
      (await req("/mall/products/" + p.id)).data.stock === 100,
  );
  r = await create();
  expire(r.data);
  const deadline = Date.now() + 45000;
  let status;
  do {
    status = (await req("/me/orders", "GET", undefined, auth)).data.find(
      (o) => o.orderNo === r.data.orderNo,
    ).status;
    if (status === "CANCELLED") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  check("后台定时扫描自动取消到期订单", status === "CANCELLED");
  check(
    "自动取消准确返还库存",
    (await req("/mall/products/" + p.id)).data.stock === 100,
  );
  await req(
    "/me/orders/" + r.data.orderNo + "/cancel",
    "POST",
    undefined,
    auth,
  );
  check(
    "超时后再次取消不重复返库",
    (await req("/mall/products/" + p.id)).data.stock === 100,
  );
  sql("UPDATE shop SET status='CLOSED' WHERE id=" + shop.id);
  check(
    "关闭店铺隐藏公开商品",
    (await req("/mall/products/" + p.id)).status === 404,
  );
  check("关闭店铺不能下单", (await create()).status === 409);
  check(
    "关闭店铺不再公开展示",
    (await req("/mall/shops/" + shop.id)).status === 404,
  );
} finally {
  sql("UPDATE shop SET status='ACTIVE' WHERE id=" + shop.id);
  await req(
    "/shop/products/" + p.id + "/status",
    "PUT",
    { onSale: false },
    auth,
  );
  const orders = (await req("/me/orders", "GET", undefined, auth)).data;
  for (const o of orders)
    if (o.status === "PENDING")
      await req("/me/orders/" + o.orderNo + "/cancel", "POST", undefined, auth);
}
console.log("\n" + count + " database boundary checks passed.");
