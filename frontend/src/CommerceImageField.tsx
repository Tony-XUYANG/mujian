import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Images, Upload, X } from 'lucide-react';
import { MediaPicker } from './MediaLibrary';
import { api } from './api';
import { ProductImage } from './Commerce';
import { ProfileImageEditor } from './ProfileImageEditor';

/** Selection is a draft; uploading never saves the surrounding product form. */
export function CommerceImageField({ value, fallback = null, label, onChange, disabled = false }: {
  value?: string | null; fallback?: string | null; label: string;
  onChange: (url: string) => void; disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function choose(next?: File) {
    setError(''); setUploaded(false);
    if (!next) return;
    if (!next.size || next.size > 5_000_000) { setError('请选择不超过5MB的图片'); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(next.type)) { setError('请选择JPG、PNG或WebP图片'); return; }
    setFile(next);
  }
  async function upload(cropped: File) {
    const body = new FormData(); body.append('file', cropped);
    const controller = new AbortController(); request.current = controller;
    const result = await api<{url: string}>('/shop/media/images', { method: 'POST', body, signal: controller.signal });
    if (controller.signal.aborted) return;
    onChange(result.url); setUploaded(true); setError('');
  }
  return <div className="variant-image-field commerce-image-field">
    <div className="variant-image-preview"><ProductImage src={value?.trim() || fallback} name={label + '预览'} /></div>
    <div className="commerce-image-controls">
      <label>{label}<input aria-label={label} maxLength={1000} disabled={disabled} value={value || ''} placeholder={fallback ? '留空使用商品主图，也可填写图片链接' : '上传图片，或填写图片链接'} onChange={e => { onChange(e.target.value); setUploaded(false); }} /></label>
      <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label={'选择' + label + '文件'} disabled={disabled} onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="commerce-image-actions">
        <button type="button" className="secondary compact-button" disabled={disabled} aria-label={'上传' + label} onClick={() => input.current?.click()}><Upload size={14} />上传图片</button>
        <button type="button" className="secondary compact-button" disabled={disabled} aria-label={'从素材库选择' + label} onClick={() => setPicking(true)}><Images size={14} />从素材库选择</button>
        {value && <button type="button" className="secondary compact-button" disabled={disabled} aria-label={'清空' + label} onClick={() => { onChange(''); setUploaded(false); }}><X size={14} />清空</button>}
      </div>
      <small>JPG、PNG、WebP · 5MB以内 · 可裁剪</small>
      {uploaded && <small role="status">图片已选好，保存表单后生效</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    {file && createPortal(<ProfileImageEditor file={file} kind="product" onClose={() => setFile(null)} onSave={upload} />, document.body)}
    {picking && createPortal(<MediaPicker current={value} onClose={() => setPicking(false)} onSelect={url => { onChange(url); setUploaded(true); setError(''); setPicking(false); }} />, document.body)}
  </div>;
}
