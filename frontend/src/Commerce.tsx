import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Package,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { api, type User } from "./api";
import { Modal } from "./Modal";

export type Product = {
  id: number;
  name: string;
  imageUrl: string | null;
  description: string | null;
  price: number;
  stock: number;
  status: string;
  version: number;
  shopId: number;
  shopName: string;
};
export type Shop = {
  id: number;
  name: string;
  logoUrl: string | null;
  description: string | null;
};
export type Order = {
  orderNo: string;
  productId: number;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  createTime: string;
  recipient: string;
  phone: string;
  address: string;
  shopId: number;
  shopName: string;
};
export type CommerceProps = {
  user: User | null;
  onLogin: () => void;
  onNavigate: (path: string) => void;
  toast: (s: string, error?: boolean) => void;
};
export const money = (value: number) => Number(value).toFixed(2);
export const states: Record<string, string> = {
  PENDING: "待付款",
  PAID: "待发货",
  SHIPPED: "待收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
export function useRemote<T>(path: string | null, refresh = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setData(null);
    setError("");
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, refresh]);
  return { data, error, loading };
}
export function ProductImage({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return src && !broken ? (
    <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <span className="product-placeholder">
      <ShoppingBag size={36} />
    </span>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <div className="empty" role="status">
      正在加载…
    </div>
  ) : error ? (
    <div className="empty">
      <p role="alert">{error}</p>
      <button className="secondary" onClick={retry}>
        重试
      </button>
    </div>
  ) : null;
}
export function CommerceLogin({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="empty">
      <ShoppingBag size={36} />
      <h2>登录后继续</h2>
      <p>查看订单，或开通你的店铺。</p>
      <button className="primary" onClick={onLogin}>
        登录 / 注册
      </button>
    </div>
  );
}
function ProductGrid({
  products,
  onNavigate,
}: {
  products: Product[];
  onNavigate: (path: string) => void;
}) {
  return products.length ? (
    <div className="product-grid">
      {products.map((p) => (
        <button
          className="product-card"
          key={p.id}
          onClick={() => onNavigate("product/" + p.id)}
        >
          <div className="product-picture">
            <ProductImage src={p.imageUrl} name={p.name} />
            {p.stock === 0 && <span className="stock-badge">暂时售罄</span>}
          </div>
          <div className="product-copy">
            <small>{p.shopName}</small>
            <h3>{p.name}</h3>
            <div>
              <strong className="price">¥ {money(p.price)}</strong>
              <span>
                查看商品 <ChevronRight size={13} />
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">
      <Package />
      <h3>暂时没有商品</h3>
      <p>换个关键词，或稍后再来看看。</p>
    </div>
  );
}
export function Mall({ onNavigate }: CommerceProps) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("latest"),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error, loading } = useRemote<Product[]>(
    "/mall/products?q=" + encodeURIComponent(search) + "&sort=" + sort,
    retry,
  );
  return (
    <section className="commerce-page">
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">故事之外，也有好物</p>
          <h1>
            幕间商城<span>把心动带回家</span>
          </h1>
        </div>
        <button className="secondary" onClick={() => onNavigate("orders")}>
          <ShoppingBag size={17} />
          我的订单
        </button>
      </div>
      <div className="mall-banner">
        <div>
          <span className="small-tag">幕间生活提案</span>
          <h2>
            看见喜欢，
            <br />
            让故事走进生活。
          </h2>
          <p>从视频里的小店，到身边的日常好物。</p>
        </div>
        <ShoppingBag size={98} strokeWidth={1} />
      </div>
      <p className="commerce-note">
        演示商城 · 体验选购与订单流程，模拟支付不产生真实扣款。
      </p>
      <div className="commerce-tools">
        <label className="commerce-search">
          <Search size={18} />
          <input
            aria-label="搜索商品"
            placeholder="搜索你喜欢的好物"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="商品排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="latest">最新上架</option>
          <option value="priceAsc">价格从低到高</option>
          <option value="priceDesc">价格从高到低</option>
        </select>
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {data && <ProductGrid products={data} onNavigate={onNavigate} />}
    </section>
  );
}
export function Storefront({ id, ...props }: CommerceProps & { id: number }) {
  const [retry, setRetry] = useState(0);
  const { data, error, loading } = useRemote<{
    shop: Shop;
    products: Product[];
  }>("/mall/shops/" + id, retry);
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {data && (
        <>
          <div className="store-heading">
            <div className="store-logo">
              <ProductImage src={data.shop.logoUrl} name={data.shop.name} />
            </div>
            <div>
              <span className="small-tag">幕间小店</span>
              <h1>{data.shop.name}</h1>
              <p>{data.shop.description || "欢迎来店里逛逛。"}</p>
            </div>
          </div>
          <h2>
            店内好物 <small>{data.products.length} 件</small>
          </h2>
          <ProductGrid products={data.products} onNavigate={props.onNavigate} />
        </>
      )}
    </section>
  );
}
export function ProductPage({ id, ...props }: CommerceProps & { id: number }) {
  const [retry, setRetry] = useState(0),
    [checkout, setCheckout] = useState(false);
  const {
    data: p,
    error,
    loading,
  } = useRemote<Product>("/mall/products/" + id, retry);
  return (
    <section className="commerce-page">
      <button
        className="commerce-back"
        onClick={() => props.onNavigate("mall")}
      >
        <ArrowLeft size={16} />
        返回商城
      </button>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {p && (
        <>
          <div className="product-detail">
            <div className="detail-picture">
              <ProductImage src={p.imageUrl} name={p.name} />
            </div>
            <div className="detail-copy">
              <span className="small-tag">店铺好物</span>
              <h1>{p.name}</h1>
              <p className="detail-price">¥ {money(p.price)}</p>
              <p>{p.description || "店主正在准备更多商品介绍。"}</p>
              <p className="muted">可售库存 {p.stock} 件</p>
              <button
                className="store-link"
                onClick={() => props.onNavigate("store/" + p.shopId)}
              >
                <Store size={22} />
                <span>
                  {p.shopName}
                  <small>进店看看更多好物</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <button
                className="primary purchase-button"
                disabled={!p.stock}
                onClick={() =>
                  props.user ? setCheckout(true) : props.onLogin()
                }
              >
                {p.stock ? "立即购买" : "暂时售罄"}
              </button>
              <p className="commerce-note">
                演示购买，无真实扣款。请使用虚拟收货信息体验。
              </p>
            </div>
          </div>
          {checkout && props.user && (
            <Checkout
              product={p}
              onClose={() => setCheckout(false)}
              {...props}
            />
          )}
        </>
      )}
    </section>
  );
}
function Checkout({
  product: p,
  onClose,
  ...props
}: CommerceProps & { product: Product; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1),
    [recipient, setRecipient] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = () => {
    setKey(crypto.randomUUID());
    setError("");
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api<Order>("/products/" + p.id + "/buy", {
        method: "POST",
        body: JSON.stringify({
          quantity,
          recipient,
          phone,
          address,
          requestKey: key,
        }),
      });
      props.toast("订单已创建，请在我的订单中确认模拟支付");
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
      label="确认订单"
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
          aria-label="关闭结算"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <p>{p.name}</p>
      <form className="commerce-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            购买数量
            <input
              type="number"
              min={1}
              max={Math.min(99, p.stock)}
              required
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                change();
              }}
            />
          </label>
          <label>
            收货人
            <input
              required
              maxLength={40}
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                change();
              }}
            />
          </label>
          <label>
            联系电话
            <input
              type="tel"
              required
              maxLength={24}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                change();
              }}
            />
          </label>
          <label>
            收货地址
            <textarea
              required
              minLength={5}
              maxLength={300}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                change();
              }}
              placeholder="省市区、街道及详细地址（体验请使用虚拟信息）"
            />
          </label>
        </fieldset>
        <div className="order-total">
          合计 <strong className="price">¥ {money(p.price * quantity)}</strong>
        </div>
        <p className="commerce-note">
          提交后保留库存15分钟。未付款可取消，超时自动取消。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "提交中…" : "提交演示订单"}
        </button>
      </form>
    </Modal>
  );
}
export function Orders({
  seller = false,
  ...props
}: CommerceProps & { seller?: boolean }) {
  const [retry, setRetry] = useState(0),
    [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState("");
  const { data, error, loading } = useRemote<Order[]>(
    props.user ? (seller ? "/shop/orders" : "/me/orders") : null,
    retry,
  );
  useEffect(() => {
    if (!props.user) return;
    const timer = setInterval(() => setRetry((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [props.user?.id]);
  async function action(o: Order, verb: string) {
    if (busy) return;
    setBusy(o.orderNo);
    setActionError("");
    try {
      const updated = await api<Order>(
        (seller ? "/shop/orders/" : "/me/orders/") + o.orderNo + "/" + verb,
        { method: "POST" },
      );
      props.toast(
        updated.status === "CANCELLED"
          ? "订单已取消，库存已释放"
          : verb === "demo-pay"
            ? "模拟支付完成，未产生真实扣款"
            : verb === "ship"
              ? "已标记演示发货"
              : "已确认收货",
      );
      setRetry((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!props.user) return <CommerceLogin onLogin={props.onLogin} />;
  const visible = data?.filter((o) => filter === "ALL" || o.status === filter);
  return (
    <section className="commerce-page orders-page">
      <div className="commerce-heading">
        <div>
          <p className="eyebrow">
            {seller ? "店铺经营" : "每一份心动，都有记录"}
          </p>
          <h1>{seller ? "店铺订单" : "我的订单"}</h1>
        </div>
        <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
          刷新
        </button>
      </div>
      <p className="commerce-note">
        当前为演示订单，支付和发货仅用于体验，不会实际扣款或寄送。
      </p>
      <div className="order-tabs" aria-label="订单状态">
        {Object.entries({ ALL: "全部", ...states }).map(([key, label]) => (
          <button
            className={key === filter ? "selected" : ""}
            key={key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <LoadState
        loading={loading}
        error={error}
        retry={() => setRetry((n) => n + 1)}
      />
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {!loading && visible?.length === 0 && (
        <div className="empty">
          <ShoppingBag />
          <h3>暂时没有{filter === "ALL" ? "" : states[filter]}订单</h3>
          {!seller && (
            <button
              className="secondary"
              onClick={() => props.onNavigate("mall")}
            >
              去商城逛逛
            </button>
          )}
        </div>
      )}
      <div className="order-list">
        {visible?.map((o) => (
          <article className="order-card" key={o.orderNo}>
            <div className="order-head">
              <button onClick={() => props.onNavigate("store/" + o.shopId)}>
                <Store size={16} />
                {o.shopName}
                <ChevronRight size={14} />
              </button>
              <span className={"order-state state-" + o.status}>
                {states[o.status]}
              </span>
            </div>
            <div className="order-product">
              <div className="order-image">
                <ProductImage src={o.imageUrl} name={o.productName} />
              </div>
              <div>
                <h3>{o.productName}</h3>
                <p>
                  ¥ {money(o.unitPrice)} × {o.quantity}
                </p>
                <small>{o.orderNo}</small>
              </div>
            </div>
            <details>
              <summary>收货信息与下单时间</summary>
              <p>
                {o.recipient} · {o.phone}
              </p>
              <p>{o.address}</p>
              <p>{new Date(o.createTime).toLocaleString("zh-CN")}</p>
            </details>
            <div className="order-footer">
              <span>
                合计 <strong>¥ {money(o.totalAmount)}</strong>
              </span>
              <div>
                {!seller && o.status === "PENDING" && (
                  <>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => action(o, "cancel")}
                    >
                      取消订单
                    </button>
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => action(o, "demo-pay")}
                    >
                      模拟支付
                    </button>
                  </>
                )}
                {seller && o.status === "PAID" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => action(o, "ship")}
                  >
                    演示发货
                  </button>
                )}
                {!seller && o.status === "SHIPPED" && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => action(o, "complete")}
                  >
                    确认收货
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function VideoProducts({
  id,
  onNavigate,
}: {
  id: number;
  onNavigate: (path: string) => void;
}) {
  const { data } = useRemote<Product[]>("/dramas/" + id + "/products");
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  const p = data[0];
  return (
    <div className="video-commerce">
      <div className="video-product-card">
        <button
          className="video-product-main"
          onClick={() => onNavigate("product/" + p.id)}
        >
          <span className="video-product-image">
            <ProductImage src={p.imageUrl} name={p.name} />
          </span>
          <span>
            <small>视频同款 · {data.length} 件好物</small>
            <strong>{p.name}</strong>
            <b>¥ {money(p.price)}</b>
          </span>
        </button>
        <button
          className="video-shop-link"
          onClick={() => onNavigate("store/" + p.shopId)}
        >
          <Store size={15} />
          进店
        </button>
        <button className="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "商品袋"}
        </button>
      </div>
      {open && (
        <div className="video-product-shelf" aria-label="视频商品袋">
          {data.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate("product/" + item.id)}
            >
              <span>
                <ProductImage src={item.imageUrl} name={item.name} />
              </span>
              <strong>{item.name}</strong>
              <b>¥ {money(item.price)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
