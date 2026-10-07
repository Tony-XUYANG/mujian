import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Heart,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./api";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { createRequestKey } from "./requestKey";
import {
  CommerceLogin,
  LoadState,
  ProductGrid,
  ProductImage,
  money,
  states,
  useRemote,
  type CommerceProps,
  type Order,
  type Product,
} from "./Commerce";

export const productCategories = [
  "生活日用",
  "家居香氛",
  "服饰箱包",
  "文具书籍",
  "数码配件",
  "其他好物",
];
export type Address = {
  id: number;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  label: string;
  isDefault: boolean;
};
export type CartItem = Product & {
  quantity: number;
  available: boolean | number;
};
const cartKey = (p: CartItem) => p.id + ":" + (p.skuId || "default");
const cartLabel = (p: CartItem) => p.name + (p.variantName ? " · " + p.variantName : "");
export const shoppingChanged = () =>
  window.dispatchEvent(new Event("shopping-changed"));

export function ShoppingEntry({ user, onLogin, onNavigate }: CommerceProps) {
  const [refresh, setRefresh] = useState(0);
  const { data } = useRemote<CartItem[]>(user ? "/me/cart" : null, refresh);
  useEffect(() => {
    const change = () => setRefresh((n) => n + 1);
    window.addEventListener("shopping-changed", change);
    return () => window.removeEventListener("shopping-changed", change);
  }, []);
  return (
    <button
      className="secondary shopping-cart-entry"
      onClick={() => (user ? onNavigate("cart") : onLogin())}
    >
      <ShoppingCart size={18} />
      购物车
      {Boolean(data?.length) && (
        <b>{data!.reduce((sum, p) => sum + p.quantity, 0)}</b>
      )}
    </button>
  );
}
export function AddressForm({
  value,
  onSaved,
  onClose,
}: {
  value?: Address;
  onSaved: (a: Address) => void;
  onClose: () => void;
}) {
  return createPortal(
    <AddressEditor value={value} onSaved={onSaved} onClose={onClose} />,
    document.body,
  );
}
function AddressEditor({
  value,
  onSaved,
  onClose,
}: {
  value?: Address;
  onSaved: (a: Address) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    recipient: value?.recipient || "",
    phone: value?.phone || "",
    region: value?.region || "",
    detail: value?.detail || "",
    label: value?.label || "家",
    isDefault: value?.isDefault || false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Address>(
        "/me/addresses" + (value ? "/" + value.id : ""),
        { method: value ? "PUT" : "POST", body: JSON.stringify(form) },
      );
      onSaved(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label={value ? "编辑收货地址" : "新增收货地址"}
      className="address-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="commerce-modal-heading">
        <h2>{value ? "编辑收货地址" : "新增收货地址"}</h2>
        <button
          className="icon-button"
          aria-label="关闭地址表单"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <form className="commerce-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            收货人
            <input
              required
              maxLength={40}
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
            />
          </label>
          <label>
            联系电话
            <input
              required
              type="tel"
              maxLength={24}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            所在地区
            <input
              required
              maxLength={100}
              placeholder="省 / 市 / 区"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </label>
          <label>
            详细地址
            <textarea
              required
              minLength={5}
              maxLength={180}
              placeholder="街道、楼栋、门牌号"
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </label>
          <label>
            地址标签
            <select
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            >
              {["家", "公司", "其他"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="commerce-check">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) =>
                setForm({ ...form, isDefault: e.target.checked })
              }
            />
            设为默认地址
          </label>
        </fieldset>
        <p className="commerce-note">演示购物请使用虚拟地址信息。</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "保存中…" : "保存收货地址"}
        </button>
      </form>
    </Modal>
  );
}
export function AddressBook(props: CommerceProps) {
  const [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState<Address | null | undefined>(),
    [removing, setRemoving] = useState<Address | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const { data, error, loading } = useRemote<Address[]>(
    props.user ? "/me/addresses" : null,
    refresh,
  );
  async function makeDefault(a: Address) {
    setBusy(true);
    try {
      await api("/me/addresses/" + a.id, {
        method: "PUT",
        body: JSON.stringify({ ...a, isDefault: true }),
      });
      setRefresh((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await api("/me/addresses/" + removing.id, { method: "DELETE" });
      setRemoving(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">每一份喜欢，都送到你身边</p>
          <h1>收货地址</h1>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          新增地址
        </button>
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRefresh((n) => n + 1)}
      />
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {data?.length === 0 && (
        <div className="empty">
          <MapPin />
          <h3>添加你的第一个收货地址</h3>
          <p>保存后，结算时可以直接选择。</p>
        </div>
      )}
      <div className="address-list">
        {data?.map((a) => (
          <article className="address-card" key={a.id}>
            <MapPin size={22} />
            <div>
              <h3>
                {a.recipient}
                <small>{a.phone}</small>
              </h3>
              <p>
                {a.region} {a.detail}
              </p>
              <span className="small-tag">{a.label}</span>
              {Boolean(a.isDefault) && (
                <span className="default-address">默认地址</span>
              )}
              <div className="address-actions">
                {!a.isDefault && (
                  <button disabled={busy} onClick={() => makeDefault(a)}>
                    设为默认
                  </button>
                )}
                <button onClick={() => setEditing(a)}>编辑</button>
                <button onClick={() => setRemoving(a)}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <AddressForm
          value={editing || undefined}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setRefresh((n) => n + 1);
            props.toast("收货地址已保存");
          }}
        />
      )}
      {removing && (
        <Modal
          label="删除收货地址"
          className="address-modal"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <h2>删除这个地址？</h2>
          <p>
            {removing.region} {removing.detail}
          </p>
          <p className="commerce-note">
            已下单的收货信息保留，不受本次删除影响。
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              保留
            </button>
            <button className="primary" disabled={busy} onClick={remove}>
              确认删除地址
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function AddressPicker({
  onSelect,
  required = false,
}: {
  onSelect: (a: Address) => void;
  required?: boolean;
}) {
  const [refresh, setRefresh] = useState(0),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<number>(0);
  const { data, error, loading } = useRemote<Address[]>(
    "/me/addresses",
    refresh,
  );
  useEffect(() => {
    if (!selected && data?.length) {
      const a = data.find((a) => a.isDefault) || data[0];
      setSelected(a.id);
      onSelect(a);
    }
  }, [data]);
  return (
    <div className="address-picker">
      <div className="shopping-section-title">
        <h3>
          <MapPin size={17} />
          收货地址
        </h3>
        <button type="button" onClick={() => setAdding(true)}>
          新增地址
        </button>
      </div>
      {loading ? (
        <p className="commerce-note">正在读取地址…</p>
      ) : error ? (
        <p className="form-error">
          {error}
          <button type="button" onClick={() => setRefresh((n) => n + 1)}>
            重试
          </button>
        </p>
      ) : data?.length ? (
        <label>
          选择已保存地址
          <select
            aria-label="选择已保存地址"
            value={selected}
            onChange={(e) => {
              const a = data.find((a) => a.id === Number(e.target.value));
              if (a) {
                setSelected(a.id);
                onSelect(a);
              }
            }}
          >
            {data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.isDefault ? "默认 · " : ""}
                {a.recipient} · {a.region} {a.detail}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="commerce-note">
          {required
            ? "请先新增收货地址，再提交订单。"
            : "暂无保存地址，可直接填写下方收货信息。"}
        </p>
      )}
      {adding && (
        <AddressForm
          onClose={() => setAdding(false)}
          onSaved={(a) => {
            setAdding(false);
            setSelected(a.id);
            onSelect(a);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
export function Cart(props: CommerceProps) {
  const [refresh, setRefresh] = useState(0),
    [selection, setSelection] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [checkout, setCheckout] = useState(false);
  const { data, error, loading } = useRemote<CartItem[]>(
    props.user ? "/me/cart" : null,
    refresh,
  );
  const eligible = (data || []).filter(
    (p) => p.available && p.stock >= p.quantity,
  );
  const chosen = eligible.filter((p) =>
    (selection || eligible.map(cartKey)).includes(cartKey(p)),
  );
  const total =
    chosen.reduce((sum, p) => sum + Math.round(p.price * 100) * p.quantity, 0) /
    100;
  async function mutate(p: CartItem, quantity?: number) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api("/me/cart/" + p.id + (quantity === undefined && p.skuId ? "?skuId=" + p.skuId : ""), {
        method: quantity === undefined ? "DELETE" : "PUT",
        body: quantity === undefined ? undefined : JSON.stringify({ quantity, skuId: p.skuId }),
      });
      setRefresh((n) => n + 1);
      shoppingChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function toggle(id: string) {
    const ids = selection || eligible.map(cartKey);
    setSelection(ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]);
  }
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  const shops = [...new Set((data || []).map((p) => p.shopId))];
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        继续逛商城
      </button>
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">喜欢的，先放在这里</p>
          <h1>
            购物车 <small>{data?.length || 0} 种好物</small>
          </h1>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          刷新购物车
        </button>
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRefresh((n) => n + 1)}
      />
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {data?.length === 0 && (
        <div className="empty">
          <ShoppingCart size={42} />
          <h3>购物车还是空的</h3>
          <p>遇到心动的好物，先加入购物车吧。</p>
          <button className="primary" onClick={() => props.onNavigate("mall")}>
            发现好物
          </button>
        </div>
      )}
      <div className="cart-shops">
        {shops.map((id) => (
          <section className="cart-shop" key={id}>
            <button
              className="cart-shop-title"
              onClick={() => props.onNavigate("store/" + id)}
            >
              <Store size={17} />
              {data!.find((p) => p.shopId === id)!.shopName}
              <ChevronRight size={14} />
            </button>
            {data!
              .filter((p) => p.shopId === id)
              .map((p) => {
                const valid = Boolean(p.available) && p.stock >= p.quantity;
                return (
                  <article
                    className={
                      "cart-line" + (!valid ? " cart-unavailable" : "")
                    }
                    key={cartKey(p)}
                  >
                    <input
                      type="checkbox"
                      aria-label={"选择" + cartLabel(p)}
                      disabled={!valid || busy}
                      checked={chosen.some((v) => cartKey(v) === cartKey(p))}
                      onChange={() => toggle(cartKey(p))}
                    />
                    <button
                      className="cart-image"
                      onClick={() => props.onNavigate("product/" + p.id)}
                    >
                      <ProductImage src={p.imageUrl} name={p.name} />
                    </button>
                    <div className="cart-line-copy">
                      <button
                        className="cart-product-name"
                        onClick={() => props.onNavigate("product/" + p.id)}
                      >
                        {p.name}
                      </button>
                      <small>
                        {p.variantName || p.specification || "默认款"} ·{" "}
                        {p.category || "生活日用"}
                      </small>
                      <p className="price">¥ {money(p.price)}</p>
                      {!valid && (
                        <p className="form-error">
                          {p.available
                            ? "库存不足，剩余" + p.stock + "件"
                            : p.hasVariants && !p.skuId ? "商品已启用多规格，请进入商品页重新选择" : "商品或规格已停售，或店铺已关闭"}
                        </p>
                      )}
                      <div className="cart-line-actions">
                        <div className="quantity-stepper">
                          <button
                            aria-label={"减少" + cartLabel(p)}
                            title={p.stock > 0 && p.quantity > p.stock ? "调整到剩余库存数量" : "减少一件"}
                            disabled={busy || !p.available || p.quantity <= 1 || p.stock < 1}
                            onClick={() => mutate(p, Math.min(p.quantity - 1, p.stock))}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{p.quantity}</span>
                          <button
                            aria-label={"增加" + cartLabel(p)}
                            disabled={
                              busy ||
                              !p.available ||
                              p.quantity >= Math.min(99, p.stock)
                            }
                            onClick={() => mutate(p, p.quantity + 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={"移除" + cartLabel(p)}
                          disabled={busy}
                          onClick={() => mutate(p)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
          </section>
        ))}
      </div>
      {Boolean(data?.length) && (
        <div className="cart-checkout-bar">
          <label>
            <input
              type="checkbox"
              aria-label="全选可购买商品"
              checked={eligible.length > 0 && chosen.length === eligible.length}
              onChange={() =>
                setSelection(
                  chosen.length === eligible.length
                    ? []
                    : eligible.map(cartKey),
                )
              }
            />
            全选
          </label>
          <div>
            <small>
              已选 {chosen.reduce((sum, p) => sum + p.quantity, 0)} 件
            </small>
            <span>
              合计 <strong>¥ {money(total)}</strong>
            </span>
          </div>
          <button
            className="primary"
            disabled={busy || !chosen.length || chosen.length > 20}
            onClick={() => setCheckout(true)}
          >
            去结算 ({chosen.length})
          </button>
        </div>
      )}
      {chosen.length > 20 && (
        <p className="form-error">一次最多结算20种商品，请减少勾选数量。</p>
      )}
      {checkout && (
        <CartCheckout
          items={chosen}
          {...props}
          onClose={() => setCheckout(false)}
          onRefresh={() => setRefresh((n) => n + 1)}
        />
      )}
    </section>
  );
}
function CartCheckout({
  items,
  onClose,
  onRefresh,
  ...props
}: CommerceProps & {
  items: CartItem[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [address, setAddress] = useState<Address | null>(null),
    [key, setKey] = useState(createRequestKey),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const total =
    items.reduce((sum, p) => sum + Math.round(p.price * 100) * p.quantity, 0) /
    100;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !address) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ orders: Order[] }>("/me/cart/checkout", {
        method: "POST",
        body: JSON.stringify({
          requestKey: key,
          addressId: address.id,
          items: items.map((p) => ({
            productId: p.id,
            skuId: p.skuId,
            quantity: p.quantity,
            expectedPrice: p.price,
          })),
        }),
      });
      shoppingChanged();
      props.toast("已创建" + result.orders.length + "笔订单，请确认模拟支付");
      onClose();
      props.onNavigate("orders");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      label="购物车结算"
      className="commerce-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="commerce-modal-heading">
        <h2>确认订单</h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="关闭购物车结算"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <form className="commerce-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <AddressPicker
            required
            onSelect={(a) => {
              setAddress(a);
              setKey(createRequestKey());
            }}
          />
          {address && (
            <p className="checkout-address">
              {address.recipient} · {address.phone}
              <br />
              {address.region} {address.detail}
            </p>
          )}
          <div className="checkout-lines">
            {items.map((p) => (
              <article key={cartKey(p)}>
                <ProductImage src={p.imageUrl} name={p.name} />
                <div>
                  <small>{p.shopName}</small>
                  <strong>{p.name}</strong>
                  {p.variantName && <small>{p.variantName}</small>}
                  <span>
                    ¥ {money(p.price)} × {p.quantity}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </fieldset>
        <div className="checkout-breakdown">
          <p>
            <span>商品金额</span>
            <b>¥ {money(total)}</b>
          </p>
          <p>
            <span>演示运费</span>
            <b>¥ 0.00</b>
          </p>
          <p>
            <span>应付合计</span>
            <strong className="price">¥ {money(total)}</strong>
          </p>
        </div>
        <p className="commerce-note">
          当前按商品及规格拆成 {items.length}{" "}
          笔独立订单，分别模拟付款、发货与收货。15分钟未付款自动取消。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !address}>
          {busy ? "提交中…" : "提交演示订单"}
        </button>
        {error && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onClose();
              onRefresh();
            }}
          >
            返回购物车重新确认
          </button>
        )}
      </form>
    </Modal>
  );
}
export function ProductShopping({
  product,
  props,
}: {
  product: Product;
  props: CommerceProps;
}) {
  const [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const { data } = useRemote<Product[]>(
    props.user ? "/me/product-favorites" : null,
    refresh,
  );
  const saved = Boolean(data?.some((p) => p.id === product.id));
  async function act(kind: "cart" | "favorite") {
    if (!props.user) {
      props.onLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (kind === "cart") {
        await api("/me/cart/" + product.id, {
          method: "POST",
          body: JSON.stringify({ quantity: 1, skuId: product.skuId }),
        });
        shoppingChanged();
        props.toast("已加入购物车");
      } else {
        await api("/me/product-favorites/" + product.id, {
          method: saved ? "DELETE" : "PUT",
        });
        setRefresh((n) => n + 1);
        props.toast(saved ? "已取消收藏" : "已收藏好物");
      }
    } catch (e) {
      props.toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="product-shopping-actions">
      <button
        className={saved ? "secondary is-liked" : "secondary"}
        disabled={busy}
        aria-pressed={saved}
        onClick={() => act("favorite")}
      >
        <Heart size={18} />
        {saved ? "已收藏" : "收藏好物"}
      </button>
      <button
        className="secondary add-to-cart"
        disabled={busy || !product.stock || Boolean(product.hasVariants && !product.skuId)}
        onClick={() => act("cart")}
      >
        <ShoppingCart size={18} />
        加入购物车
      </button>
      <button
        className="icon-button"
        aria-label="打开购物车"
        onClick={() => props.onNavigate("cart")}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

type ProductReview = {
  id: number;
  productId: number;
  rating: number;
  content: string;
  createTime: string;
  nickname: string;
  avatar: string;
};
type ProductReviewSummary = {
  items: ProductReview[];
  reviewCount: number;
  averageRating: number;
};
type ReviewableOrder = {
  orderNo: string;
  quantity: number;
  createTime: string;
};

export function ProductReviews({
  productId,
  props,
  initialOrderNo = "",
  onPublished,
}: {
  productId: number;
  props: CommerceProps;
  initialOrderNo?: string;
  onPublished?: () => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [orderNo, setOrderNo] = useState(initialOrderNo);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { data, error, loading } = useRemote<ProductReviewSummary>(
    "/mall/products/" + productId + "/reviews",
    refresh,
  );
  const { data: reviewable, error: eligibilityError, loading: eligibilityLoading } = useRemote<ReviewableOrder[]>(
    props.user ? "/me/products/" + productId + "/reviewable-orders" : null,
    refresh,
  );
  useEffect(() => {
    if (reviewable && !reviewable.some((o) => o.orderNo === orderNo))
      setOrderNo(reviewable[0]?.orderNo || "");
  }, [reviewable, orderNo]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!props.user) {
      props.onLogin();
      return;
    }
    if (busy || !orderNo || !rating || !content.trim()) return;
    setBusy(true);
    setSubmitError("");
    try {
      await api("/me/products/" + productId + "/reviews", {
        method: "POST",
        body: JSON.stringify({ rating, content: content.trim(), orderNo }),
      });
      setContent("");
      setRating(0);
      setRefresh((n) => n + 1);
      props.toast("评价已发布，感谢你的真实反馈");
      onPublished?.();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-reviews" aria-labelledby="product-reviews-title">
      <div className="product-reviews-heading">
        <div>
          <h2 id="product-reviews-title">商品评价</h2>
          <p>购买过的用户，分享真实使用感受</p>
        </div>
        <div className="review-score" aria-label={data?.reviewCount ? data.averageRating + "分" : "暂无评分"}>
          <strong>{data?.reviewCount ? Number(data.averageRating).toFixed(1) : "—"}</strong>
          <span>
            <Star size={14} fill="currentColor" />
            {data ? data.reviewCount + " 条评价" : error ? "评分暂不可用" : "评分加载中"}
          </span>
        </div>
      </div>
      <LoadState loading={loading} error={error} retry={() => setRefresh((n) => n + 1)} />
      {props.user && <LoadState loading={eligibilityLoading} error={eligibilityError} retry={() => setRefresh((n) => n + 1)} />}
      {props.user && reviewable?.length ? (
        <form className="review-editor" onSubmit={submit} noValidate>
          <fieldset disabled={busy}>
          <div className="review-editor-title">
            <strong>写下你的评价</strong>
            <span>确认收货后可评价，每笔订单限评一次</span>
          </div>
          <div className="review-rating">
            <span>满意度</span>
            <div role="radiogroup" aria-label="选择评分">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className={value <= rating ? "selected" : ""}
                >
                  <input type="radio" name="product-rating" value={value} checked={rating === value} aria-label={value + "星"} onChange={() => setRating(value)} />
                  <Star size={22} fill="currentColor" aria-hidden="true" />
                </label>
              ))}
            </div>
            <b>{rating ? rating + " 星" : "请选择"}</b>
          </div>
          {reviewable.length > 1 && (
            <label className="review-order-picker">
              评价订单
              <select aria-label="评价订单" value={orderNo} onChange={(e) => setOrderNo(e.target.value)}>
                {reviewable.map((order) => (
                  <option value={order.orderNo} key={order.orderNo}>
                    {new Date(order.createTime).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} · {order.quantity}件 · 尾号{order.orderNo.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <textarea
            aria-label="评价内容"
            value={content}
            maxLength={500}
            required
            placeholder="说说你的真实体验，帮助其他人做决定…"
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="review-editor-actions">
            <span>{content.length}/500</span>
            <button className="primary" disabled={busy || !rating || !content.trim() || !orderNo}>
              {busy ? "发布中…" : "发布评价"}
            </button>
          </div>
          </fieldset>
          {submitError && <p className="form-error" role="alert">{submitError}</p>}
        </form>
      ) : props.user ? (
        !eligibilityLoading && !eligibilityError && <p className="review-empty">暂无待评价订单。确认收货后可评价，已评价的订单无需重复提交。</p>
      ) : (
        <button className="review-login" onClick={props.onLogin}>
          登录后评价，分享你的使用感受
          <ChevronRight size={16} />
        </button>
      )}
      {data?.items.length ? (
        <div className="review-list">
          {data.items.map((review) => (
            <article className="review-item" key={review.id}>
              <div className="review-avatar">
                {review.avatar ? <img src={review.avatar} alt="" /> : (review.nickname || "幕间用户").slice(0, 1)}
              </div>
              <div className="review-item-main">
                <div className="review-item-head">
                  <strong>{review.nickname || "幕间用户"}</strong>
                  <span>{new Date(review.createTime).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="review-stars" aria-label={review.rating + "星"}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star key={value} size={13} fill={value <= review.rating ? "currentColor" : "none"} />
                  ))}
                </div>
                <p>{review.content}</p>
              </div>
            </article>
          ))}
        </div>
      ) : data && <p className="review-empty">还没有评价，成为第一个分享体验的人吧。</p>}
      {data && data.reviewCount > data.items.length && <p className="review-empty">当前展示最近 {data.items.length} 条评价，评分统计全部可见评价。</p>}
    </section>
  );
}
export function ProductFavorites(props: CommerceProps) {
  const [retry, setRetry] = useState(0);
  const { data, error, loading } = useRemote<Product[]>(
    props.user ? "/me/product-favorites" : null,
    retry,
  );
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">心动好物，慢慢挑选</p>
          <h1>好物收藏</h1>
        </div>
        <ShoppingEntry {...props} />
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {data && (
        <div className="favorite-products">
          {data.map((p) => (
            <div key={p.id}>
              <ProductGrid products={[p]} onNavigate={props.onNavigate} />
              <button
                className="favorite-remove"
                onClick={async () => {
                  try {
                    await api("/me/product-favorites/" + p.id, {
                      method: "DELETE",
                    });
                    setRetry((n) => n + 1);
                  } catch (e) {
                    props.toast((e as Error).message, true);
                  }
                }}
              >
                取消收藏{p.status !== "ON_SALE" ? " · 已下架" : ""}
              </button>
            </div>
          ))}
        </div>
      )}
      {data?.length === 0 && (
        <div className="empty">
          <Heart />
          <h3>还没有收藏好物</h3>
          <p>在商品详情页收藏，之后来这里慢慢挑。</p>
        </div>
      )}
    </section>
  );
}
export function OrderDetail({
  no,
  seller,
  onClose,
}: {
  no: string;
  seller: boolean;
  onClose: () => void;
}) {
  const [retry, setRetry] = useState(0);
  const {
    data: o,
    error,
    loading,
  } = useRemote<
    Order & {
      expiresAt: string;
      events: { status: string; description: string; createTime: string }[];
    }
  >((seller ? "/shop/orders/" : "/me/orders/") + no, retry);
  return (
    <Modal label="订单详情" className="commerce-modal" onClose={onClose}>
      <div className="commerce-modal-heading">
        <h2>订单详情</h2>
        <button
          className="icon-button"
          aria-label="关闭订单详情"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {o && (
        <>
          <div className="order-detail-state">
            <Check size={22} />
            <div>
              <h3>{states[o.status]}</h3>
              <p>
                {o.status === "PENDING"
                  ? "请于 " +
                    new Date(o.expiresAt).toLocaleTimeString("zh-CN") +
                    " 前完成模拟支付"
                  : "当前为演示交易，无真实扣款和物流。"}
              </p>
            </div>
          </div>
          <div className="checkout-lines">
            <article>
              <ProductImage src={o.imageUrl} name={o.productName} />
              <div>
                <small>{o.shopName}</small>
                <strong>{o.productName}</strong>
                {o.variantName && <small className="selected-variant">{o.variantName}</small>}
                <span>
                  ¥ {money(o.unitPrice)} × {o.quantity}
                </span>
              </div>
            </article>
          </div>
          <p className="checkout-address">
            <MapPin size={15} /> {o.recipient} · {o.phone}
            <br />
            {o.address}
          </p>
          <div className="checkout-breakdown">
            <p>
              <span>订单编号</span>
              <b className="order-number">{o.orderNo}</b>
            </p>
            <p>
              <span>下单时间</span>
              <b>{new Date(o.createTime).toLocaleString("zh-CN")}</b>
            </p>
            <p>
              <span>实付/应付金额</span>
              <strong className="price">¥ {money(o.totalAmount)}</strong>
            </p>
          </div>
          <h3>订单动态</h3>
          {o.events.length ? (
            <ol className="order-timeline">
              {o.events.map((event, i) => (
                <li key={i}>
                  <span />
                  <div>
                    <strong>{event.description}</strong>
                    <time>
                      {new Date(event.createTime).toLocaleString("zh-CN")}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="commerce-note">
              这是早期版本订单，未记录历史动态；以当前订单状态为准。
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

export function ProductGallery({ product: p }: { product: Product }) {
  let extras: string[] = [];
  try {
    const parsed = JSON.parse(p.imagesJson || "[]");
    if (Array.isArray(parsed))
      extras = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    /* fallback to primary image */
  }
  const images = [
    ...new Set([p.imageUrl, ...extras].filter((v): v is string => Boolean(v))),
  ];
  const [index, setIndex] = useState(0);
  return (
    <div className="product-gallery">
      <div className="detail-picture">
        <ProductImage src={images[index] || null} name={p.name} />
        <span className="gallery-count">
          {images.length ? index + 1 : 0} / {images.length}
        </span>
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbnails">
          {images.map((src, i) => (
            <button
              key={src}
              className={i === index ? "selected" : ""}
              aria-label={"查看商品图片" + (i + 1)}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <ProductImage src={src} name={p.name + "图片" + (i + 1)} />
            </button>
          ))}
        </div>
      )}
      <div className="product-spec-table">
        <h3>商品参数</h3>
        {[
          ["分类", p.category],
          ["材质", p.material],
          ["规格", p.specification],
          ["产地", p.origin],
          ["发货地", p.shippingFrom],
        ].map(([label, value]) => (
          <p key={label}>
            <span>{label}</span>
            <strong>{value || "商家暂未填写"}</strong>
          </p>
        ))}
      </div>
    </div>
  );
}
