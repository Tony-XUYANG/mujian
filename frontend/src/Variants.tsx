import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { api } from "./api";
import { Modal } from "./Modal";
import { LoadState, ProductImage, money, useRemote, type Product } from "./Commerce";
import { CommerceImageField } from "./CommerceImageField";

export type Variant = { id: number; productId: number; name: string; price: number; stock: number; onSale: boolean | number; imageUrl?: string | null; valueIds?: number[] };
export type AttributeValue = { id?: number; attributeId?: number; value: string; sortOrder?: number };
export type AttributeGroup = { id?: number; productId?: number; name: string; sortOrder?: number; values: AttributeValue[] };
type MatrixDraft = { id?: number; valueIds: number[]; price: number; stock: number; onSale: boolean; imageUrl?: string | null };
type Draft = { id?: number; name: string; price: number; stock: number; onSale: boolean; imageUrl?: string | null };

function VariantImageField({ value, fallback, label, onChange }: { value?: string | null; fallback: string | null; label: string; onChange: (value: string) => void }) {
  return <CommerceImageField value={value} fallback={fallback} label={label} onChange={onChange} />;
}
export function VariantSelector({ variants, selected, onSelect }: { variants: Variant[]; selected: number | null; onSelect: (id: number) => void }) {
  return <section className="variant-picker" aria-label="商品规格">
    <h3>选择规格 <small>不同款式独立库存</small></h3>
    <div>{variants.map(v => <button type="button" key={v.id} aria-pressed={selected === v.id}
      disabled={!v.onSale || v.stock < 1} className={selected === v.id ? "selected" : ""}
      onClick={() => onSelect(v.id)}>
      {v.imageUrl && <span className="variant-option-image"><ProductImage src={v.imageUrl} name={v.name} /></span>}<strong>{v.name}</strong><span>¥ {money(v.price)} · {!v.onSale ? "已停售" : v.stock ? "剩余" + v.stock + "件" : "售罄"}</span>
    </button>)}</div>
  </section>;
}

/** Selects one value from each attribute group and resolves a concrete SKU. */
export function AttributeSelector({ groups, variants, selected, onSelect }: { groups: AttributeGroup[]; variants: Variant[]; selected: number | null; onSelect: (id: number | null) => void }) {
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const matrix = variants.filter(v => (v.valueIds?.length || 0) === groups.length);
  useEffect(() => {
    const current = variants.find(v => v.id === selected && v.valueIds?.length === groups.length);
    if (!current) return;
    const next: Record<string, number> = {};
    groups.forEach((g, i) => { next[String(g.id ?? i)] = current.valueIds![i]; });
    setChosen(next);
  }, [selected, variants, groups]);
  function pick(index: number, valueId: number) {
    // A sparse matrix may contain 白/350 and 蓝/500 but no cross-pairs.
    // Keep the changed attribute, then retain only previous choices that can
    // still lead to an in-stock SKU. This avoids trapping the buyer on 白/350.
    let candidates = matrix.filter(v => v.onSale && v.stock > 0 && v.valueIds?.[index] === valueId);
    if (!candidates.length) return;
    const next: Record<string, number> = { [String(groups[index].id ?? index)]: valueId };
    groups.forEach((g, i) => {
      if (i === index) return;
      const key = String(g.id ?? i), previous = chosen[key];
      if (previous === undefined) return;
      const compatible = candidates.filter(v => v.valueIds?.[i] === previous);
      if (compatible.length) { next[key] = previous; candidates = compatible; }
    });
    setChosen(next);
    const complete = groups.every((g, i) => next[String(g.id ?? i)] !== undefined);
    if (!complete) { onSelect(null); return; }
    const sku = matrix.find(v => groups.every((g, i) => v.valueIds![i] === next[String(g.id ?? i)]));
    onSelect(sku?.id ?? null);
  }
  return <section className="variant-picker attribute-picker" aria-label="商品属性">
    <h3>选择款式 <small>按属性组合选择</small></h3>
    {groups.map((group, gi) => <div className="attribute-group" key={group.id || "new-" + gi}>
      <strong>{group.name}</strong>
      <div>{group.values.map(value => {
        const key = String(group.id ?? gi);
        const active = matrix.some(v => v.onSale && v.stock > 0 && v.valueIds?.[gi] === value.id);
        return <button type="button" key={value.id || value.value} aria-pressed={chosen[key] === value.id} disabled={!active} className={chosen[key] === value.id ? "selected" : ""} onClick={() => value.id && pick(gi, value.id)}>{value.value}</button>;
      })}</div>
    </div>)}
    {selected && <p className="selected-variant">已选组合：{variants.find(v => v.id === selected)?.name}</p>}
    {!selected && Object.keys(chosen).length > 0 && <p className="selected-variant">请选择剩余属性，确定可购买的款式</p>}
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
        <VariantImageField label={"规格图片" + (i + 1)} value={r.imageUrl} fallback={product.imageUrl} onChange={imageUrl => edit(i,{imageUrl})} />
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

export function AttributeMatrixManager({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const { data, error, loading } = useRemote<AttributeMatrixData>("/shop/products/" + product.id + "/attributes", retry);
  const close = () => { if (!busy) onClose(); };
  return <Modal label="属性组合" className="commerce-modal attribute-modal" onClose={close}>
    <div className="commerce-modal-heading"><h2>属性组合</h2><button className="icon-button" aria-label="关闭属性组合" disabled={busy} onClick={close}><X /></button></div>
    <p>{product.name}</p>
    <LoadState loading={loading} error={error} retry={() => setRetry(n => n + 1)} />
    {data && <AttributeMatrixForm product={product} data={data} onSaved={onSaved} onBusy={setBusy} />}
  </Modal>;
}

export type AttributeMatrixData = { version: number; groups: AttributeGroup[]; variants: Variant[]; limits?: { maxGroups: number; maxValuesPerGroup: number; maxCombinations: number } };

function AttributeMatrixForm({ product, data, onSaved, onBusy }: { product: Product; data: AttributeMatrixData; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const [groups, setGroups] = useState<AttributeGroup[]>(() => data.groups.length ? data.groups.map(g => ({ ...g, values: g.values.map(v => ({ ...v })) })) : [{ name: "颜色", values: [{ value: "" }] }]);
  const [rows, setRows] = useState<MatrixDraft[]>(() => data.variants.filter(v => v.valueIds?.length).map(v => ({ id: v.id, valueIds: v.valueIds!, price: v.price, stock: v.stock, onSale: Boolean(v.onSale), imageUrl: v.imageUrl })));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const maxGroups = data.limits?.maxGroups || 3, maxValues = data.limits?.maxValuesPerGroup || 10, maxCombinations = data.limits?.maxCombinations || 20;
  function editGroup(index: number, patch: Partial<AttributeGroup>) { setGroups(old => old.map((g, i) => i === index ? { ...g, ...patch } : g)); }
  function editValue(gi: number, vi: number, patch: Partial<AttributeValue>) { setGroups(old => old.map((g, i) => i === gi ? { ...g, values: g.values.map((v, n) => n === vi ? { ...v, ...patch } : v) } : g)); }
  function addGroup() { if (groups.length < maxGroups) setGroups(old => [...old, { name: "", values: [{ value: "" }] }]); }
  function addValue(gi: number) { if (groups[gi].values.length < maxValues) editGroup(gi, { values: [...groups[gi].values, { value: "" }] }); }
  function removeGroup(gi: number) { if (!groups[gi].id) setGroups(old => old.filter((_, i) => i !== gi)); }
  function removeValue(gi: number, vi: number) { if (!groups[gi].values[vi].id) editGroup(gi, { values: groups[gi].values.filter((_, i) => i !== vi) }); }
  function generate() {
    setError("");
    if (!groups.length || groups.some(g => !g.name.trim() || !g.values.length || g.values.some(v => !v.value.trim()))) { setError("请先填写属性组和属性值"); return; }
    const combinations = groups.reduce<number[][]>((all, g) => all.flatMap(prefix => g.values.map((v, vi) => [...prefix, v.id || -(vi + 1)])), [[]]);
    if (combinations.length > maxCombinations) { setError("属性组合超过20种，请减少属性值"); return; }
    // Temporary negative IDs are positions within each group. Sorting them
    // merges distinct pairs such as [-1,-2] and [-2,-1]. Keep group order.
    const old = new Map(rows.map(r => [r.valueIds.join(","), r]));
    const legacy = new Map(data.variants.filter(v => v.valueIds?.length).map(v => [v.valueIds!.join(","), v]));
    const reusedIds = new Set<number>();
    setRows(combinations.map(valueIds => {
      const key = valueIds.join(",");
      const previous = old.get(key), saved = legacy.get(key);
      if (previous) { if (previous.id) reusedIds.add(previous.id); return { ...previous, valueIds }; }
      if (saved) { reusedIds.add(saved.id); return { id: saved.id, valueIds, price: saved.price, stock: saved.stock, onSale: Boolean(saved.onSale), imageUrl: saved.imageUrl }; }
      // When adding a new attribute group, assign each old SKU to the first
      // compatible new combination. Preserve its stock, price and order ID.
      const carry = data.variants.find(v => v.valueIds?.length && !reusedIds.has(v.id) && v.valueIds.every(id => valueIds.includes(id)));
      if (carry) {
        reusedIds.add(carry.id);
        const edited = rows.find(r => r.id === carry.id);
        return { id: carry.id, valueIds, price: edited?.price ?? carry.price, stock: edited?.stock ?? carry.stock, onSale: edited?.onSale ?? Boolean(carry.onSale), imageUrl: edited ? edited.imageUrl : carry.imageUrl };
      }
      return { valueIds, price: product.price, stock: 0, onSale: true };
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!groups.length || groups.some(g => !g.name.trim() || !g.values.length || g.values.some(v => !v.value.trim()))) { setError("请先填写属性组和属性值"); return; }
    if (!rows.length || rows.length > maxCombinations) { setError("请先生成有效的属性组合"); return; }
    if (rows.some(r => !Number.isFinite(r.price) || r.price <= 0 || !Number.isInteger(r.stock) || r.stock < 0)) { setError("请填写有效的组合价格和非负整数库存"); return; }
    if (rows.reduce((total, r) => total + r.stock, 0) > 999999) { setError("全部规格库存合计不能超过999999"); return; }
    setBusy(true); onBusy(true); setError("");
    try {
      await api("/shop/products/" + product.id + "/attributes", { method: "PUT", body: JSON.stringify({ version: data.version, groups: groups.map((g, gi) => ({ ...g, id: g.id, name: g.name.trim(), values: g.values.map((v, vi) => ({ ...v, value: v.value.trim(), sortOrder: vi })) })), variants: rows.map(r => ({ ...r, valueIds: r.valueIds.filter(Boolean) })) }) });
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); onBusy(false); }
  }
  return <form className="commerce-form attribute-form" onSubmit={save} noValidate>
    <p className="commerce-note">分别维护颜色、容量等属性，系统自动生成组合。最多3组属性、每组10个值、20种组合；已保存属性不能删除，历史订单会保留原组合。</p>
    <fieldset disabled={busy}>
      <div className="attribute-editor-groups">
        {groups.map((g, gi) => <section className="attribute-editor-group" key={g.id || "new-group-" + gi}>
          <div className="variant-row-title"><strong>属性组 {gi + 1}</strong>{!g.id && <button type="button" className="icon-button" aria-label="移除属性组" onClick={() => removeGroup(gi)}><X size={16} /></button>}</div>
          <label>属性名称<input aria-label={"属性组名称" + (gi + 1)} maxLength={40} placeholder="如：颜色、容量" value={g.name} onChange={e => editGroup(gi, { name: e.target.value })} /></label>
          <div className="attribute-values">
            {g.values.map((v, vi) => <div className="attribute-value-row" key={v.id || "new-value-" + vi}>
              <input aria-label={g.name + "属性值" + (vi + 1)} maxLength={60} placeholder="如：奶油白" value={v.value} onChange={e => editValue(gi, vi, { value: e.target.value })} />
              {!v.id && <button type="button" className="icon-button" aria-label="移除属性值" onClick={() => removeValue(gi, vi)}><X size={15} /></button>}
            </div>)}
          </div>
          <button type="button" className="secondary compact-button" disabled={g.values.length >= maxValues} onClick={() => addValue(gi)}><Plus size={15} />添加属性值</button>
        </section>)}
      </div>
      <div className="attribute-form-actions"><button type="button" className="secondary" disabled={groups.length >= maxGroups} onClick={addGroup}><Plus size={16} />添加属性组</button><button type="button" className="secondary" onClick={generate}>生成组合</button></div>
      {rows.length > 0 && <div className="attribute-combination-table" aria-label="组合规格编辑">
        <div className="attribute-combination-head"><strong>组合</strong><strong>售价</strong><strong>库存</strong><strong>状态</strong></div>
        {rows.map((r, i) => <div className="attribute-combination-row" key={r.id || r.valueIds.join("-") }>
          <strong>{r.valueIds.map((id, gi) => groups[gi]?.values.find((v, vi) => (v.id || -(vi + 1)) === id)?.value || "待生成").join(" / ")}</strong>
          <label className="combination-number"><span>售价（元）</span><input aria-label={"组合售价" + (i + 1)} type="number" min="0.01" step="0.01" value={r.price} onChange={e => setRows(old => old.map((x, n) => n === i ? { ...x, price: Number(e.target.value) } : x))} /></label>
          <label className="combination-number"><span>可售库存</span><input aria-label={"组合库存" + (i + 1)} type="number" min="0" step="1" value={r.stock} onChange={e => setRows(old => old.map((x, n) => n === i ? { ...x, stock: Number(e.target.value) } : x))} /></label>
          <label className="commerce-check"><input type="checkbox" checked={r.onSale} onChange={e => setRows(old => old.map((x, n) => n === i ? { ...x, onSale: e.target.checked } : x))} />在售</label>
          <VariantImageField label={"组合图片" + (i + 1)} value={r.imageUrl} fallback={product.imageUrl} onChange={imageUrl => setRows(old => old.map((x, n) => n === i ? { ...x, imageUrl } : x))} />
        </div>)}
      </div>}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? "保存中…" : "保存属性组合"}</button>
  </form>;
}
