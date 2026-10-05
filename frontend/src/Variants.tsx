import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { api } from "./api";
import { Modal } from "./Modal";
import { LoadState, money, useRemote, type Product } from "./Commerce";

export type Variant = { id: number; productId: number; name: string; price: number; stock: number; onSale: boolean | number };
type Draft = { id?: number; name: string; price: number; stock: number; onSale: boolean };
export function VariantSelector({ variants, selected, onSelect }: { variants: Variant[]; selected: number | null; onSelect: (id: number) => void }) {
  return <section className="variant-picker" aria-label="商品规格">
    <h3>选择规格 <small>不同款式独立库存</small></h3>
    <div>{variants.map(v => <button type="button" key={v.id} aria-pressed={selected === v.id}
      disabled={!v.onSale || v.stock < 1} className={selected === v.id ? "selected" : ""}
      onClick={() => onSelect(v.id)}>
      <strong>{v.name}</strong><span>¥ {money(v.price)} · {!v.onSale ? "已停售" : v.stock ? "剩余" + v.stock + "件" : "售罄"}</span>
    </button>)}</div>
  </section>;
}
export function VariantManager({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const { data, error, loading } = useRemote<{ version: number; items: Variant[] }>("/shop/products/" + product.id + "/variants", retry);
  const close = () => { if (!busy) onClose(); };
  return <Modal label="规格库存" className="commerce-modal variant-modal" onClose={close}>
    <div className="commerce-modal-heading"><h2>规格库存</h2><button className="icon-button" aria-label="关闭规格库存" disabled={busy} onClick={close}><X /></button></div>
    <p>{product.name}</p>
    <LoadState loading={loading} error={error} retry={() => setRetry(n => n + 1)} />
    {data && <VariantForm product={product} data={data} onSaved={onSaved} onBusy={setBusy} />}
  </Modal>;
}
function VariantForm({ product, data, onSaved, onBusy }: { product: Product; data: { version: number; items: Variant[] }; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const [rows, setRows] = useState<Draft[]>(() => data.items.length ? data.items.map(v => ({ ...v, onSale: Boolean(v.onSale) })) : [{ name: "", price: product.price, stock: product.stock, onSale: true }]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  function edit(index: number, patch: Partial<Draft>) { setRows(old => old.map((r,i) => i === index ? { ...r, ...patch } : r)); }
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (rows.some(r => !r.name.trim() || r.name.trim().length > 80 || !Number.isFinite(r.price) || r.price <= 0 || r.price > 99999999.99 || Math.abs(r.price * 100 - Math.round(r.price * 100)) > 0.0001 || !Number.isInteger(r.stock) || r.stock < 0)) {
      setError("请填写规格名称、有效的两位小数价格和非负整数库存"); return;
    }
    if (new Set(rows.map(r => r.name.trim().toLocaleLowerCase())).size !== rows.length) { setError("规格名称不能重复"); return; }
    if (rows.reduce((n,r) => n + r.stock,0) > 999999) { setError("全部规格库存合计不能超过999999"); return; }
    setBusy(true); onBusy(true); setError("");
    try {
      await api("/shop/products/" + product.id + "/variants", { method: "PUT", body: JSON.stringify({ version: data.version, items: rows.map(r => ({ ...r, name: r.name.trim() })) }) });
      onSaved();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); onBusy(false); }
  }
  return <form className="commerce-form variant-form" onSubmit={save} noValidate>
    <p className="commerce-note">每行是一种可购买的组合，例如“奶油白 / 350毫升”。价格和库存分别维护，最多20种。已保存规格可以停售，历史订单保留原款式。</p>
    {!data.items.length && <p className="commerce-note">启用后，商品展示最低规格价和在售规格总库存，已有购物车中的默认款需要重新选择规格。</p>}
    <fieldset disabled={busy}>
      {rows.map((r,i) => <section className="variant-editor-row" key={r.id || "new-" + i} aria-label={"规格" + (i + 1)}>
        <div className="variant-row-title"><strong>规格 {i + 1}</strong>{!r.id && rows.length > 1 && <button type="button" className="icon-button" aria-label={"移除新规格" + (i + 1)} onClick={() => setRows(old => old.filter((_,n) => n !== i))}><X size={16}/></button>}</div>
        <label>规格名称<input aria-label={"规格名称" + (i + 1)} maxLength={80} placeholder="如：奶油白 / 350毫升" value={r.name} onChange={e => edit(i,{name:e.target.value})}/></label>
        <div className="commerce-field-row">
          <label>售价（元）<input aria-label={"规格售价" + (i + 1)} type="number" min="0.01" step="0.01" value={r.price} onChange={e => edit(i,{price:Number(e.target.value)})}/></label>
          <label>可售库存<input aria-label={"规格库存" + (i + 1)} type="number" min="0" step="1" value={r.stock} onChange={e => edit(i,{stock:Number(e.target.value)})}/></label>
        </div>
        <label className="commerce-check"><input type="checkbox" checked={r.onSale} aria-label={"规格在售" + (i + 1)} onChange={e => edit(i,{onSale:e.target.checked})}/>在售（关闭后停售）</label>
      </section>)}
      <button type="button" className="secondary" disabled={rows.length >= 20} onClick={() => setRows(old => [...old,{name:"",price:product.price,stock:0,onSale:true}])}><Plus size={16}/>添加规格</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? "保存中…" : "保存规格"}</button>
  </form>;
}
