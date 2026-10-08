import { useEffect, useState } from 'react';

/** A local Blob avoids browser network range requests during offline seeking. */
export function OfflineVideo({ url, poster }: { url: string; poster: string }) {
  const [source, setSource] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, objectUrl = '';
    setSource(''); setError('');
    async function load() {
      try {
        if (!('caches' in window)) throw new Error('当前浏览器不支持离线播放');
        const cached = await (await caches.open('mujian-offline-v1')).match(url);
        if (!cached) throw new Error('本机视频缓存已被清理，请联网后重新缓存');
        const blob = await cached.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '暂时无法读取本机视频，请重试'); }
    }
    void load();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, retry]);
  return <div className="video-wrap">
    {source && <video key={source} src={source} poster={poster} controls playsInline autoPlay preload="metadata" onError={() => setError('本机视频暂时无法播放，请重试；仍失败时请联网重新缓存')} />}
    {!source && !error && <div className="empty" role="status">正在读取本机视频…</div>}
    {error && <div className="empty" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(n => n + 1)}>重试播放</button></div>}
  </div>;
}
