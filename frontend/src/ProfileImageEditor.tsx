import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { LoaderCircle, RotateCcw, X } from 'lucide-react';
import { Modal } from './Modal';

export type ProfileImageKind = 'avatar' | 'background';
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function ProfileImageEditor({ file, kind, onClose, onSave }: {
  file: File; kind: ProfileImageKind; onClose: () => void; onSave: (file: File) => Promise<void>;
}) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const avatar = kind === 'avatar';
  const width = avatar ? 512 : 1600;
  const height = avatar ? 512 : 900;
  const aspect = width / height;
  const cropWidth = source ? Math.min(source.naturalWidth, source.naturalHeight * aspect) / zoom : 0;
  const cropHeight = cropWidth / aspect;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let active = true;
    image.onload = () => {
      if (!active) return;
      if (image.naturalWidth * image.naturalHeight > 36_000_000) {
        setError('图片尺寸过大，请选择不超过3600万像素的图片');
      } else setSource(image);
    };
    image.onerror = () => { if (active) setError('无法读取这张图片，请选择 JPG、PNG 或 WebP 图片'); };
    image.src = url;
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!source || !context) return;
    context.fillStyle = '#181819';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, (source.naturalWidth - cropWidth) * position.x / 100,
      (source.naturalHeight - cropHeight) * position.y / 100, cropWidth, cropHeight, 0, 0, width, height);
  }, [source, width, height, cropWidth, cropHeight, position]);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !source || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const availableX = source.naturalWidth - cropWidth;
    const availableY = source.naturalHeight - cropHeight;
    setPosition({
      x: availableX > 0 ? clamp(drag.current.startX - (event.clientX - drag.current.x) * cropWidth / bounds.width / availableX * 100) : 50,
      y: availableY > 0 ? clamp(drag.current.startY - (event.clientY - drag.current.y) * cropHeight / bounds.height / availableY * 100) : 50,
    });
  }

  async function save() {
    if (!canvas.current || !source || busy) return;
    setBusy(true); setError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(
        value => value ? resolve(value) : reject(new Error('图片处理失败，请重新选择')), 'image/jpeg', 0.9));
      await onSave(new File([blob], `${kind}.jpg`, { type: 'image/jpeg' }));
      onClose();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <Modal label={avatar ? '调整头像' : '调整主页背景'} className="profile-image-modal" onClose={() => { if (!busy) onClose(); }}>
    <button className="close icon-button" aria-label="取消图片更换" disabled={busy} onClick={onClose}><X /></button>
    <h2>{avatar ? '调整头像' : '调整主页背景'}</h2>
    <p className="muted">拖动图片或调整滑块，确认满意后保存。</p>
    <div className={`crop-preview ${avatar ? 'crop-avatar' : ''}`} style={{ aspectRatio: String(aspect) }}
      onPointerDown={event => {
        if (!source || busy) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
      }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <canvas ref={canvas} width={width} height={height} aria-label={avatar ? '头像裁剪预览' : '背景裁剪预览'} />
      {!source && !error && <span className="crop-loading"><LoaderCircle className="spin" />正在读取图片…</span>}
    </div>
    <div className="crop-controls">
      <label>缩放 <output>{zoom.toFixed(1)} 倍</output><input aria-label="图片缩放" type="range" min="1" max="3" step="0.05" value={zoom} disabled={!source || busy} onChange={event => setZoom(Number(event.target.value))} /></label>
      <label>左右位置<input aria-label="图片左右位置" type="range" min="0" max="100" value={position.x} disabled={!source || busy} onChange={event => setPosition(p => ({ ...p, x: Number(event.target.value) }))} /></label>
      <label>上下位置<input aria-label="图片上下位置" type="range" min="0" max="100" value={position.y} disabled={!source || busy} onChange={event => setPosition(p => ({ ...p, y: Number(event.target.value) }))} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions crop-actions">
      <button className="secondary" disabled={busy} onClick={() => { setZoom(1); setPosition({ x: 50, y: 50 }); }}><RotateCcw size={15} />重置</button>
      <button className="secondary" disabled={busy} onClick={onClose}>取消</button>
      <button className="primary" disabled={!source || busy} onClick={save}>{busy ? <><LoaderCircle className="spin" size={16} />保存中…</> : '保存图片'}</button>
    </div>
  </Modal>;
}
