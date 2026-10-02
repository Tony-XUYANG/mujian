import { useEffect, useState } from 'react';
import { AlertCircle, Bookmark, ChevronRight, Film, LoaderCircle, Play, RefreshCw, Sparkles } from 'lucide-react';
import { api, count, seriesLabel, type Drama, type User } from './api';

type Props = { user: User | null; onLogin: () => void; onView: (id: number) => void; refresh: number };

export function RecommendationFeed({ user, onLogin, onView, refresh }: Props) {
  const [items, setItems] = useState<Drama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Drama[]>('/recommendations').then(data => {
      if (active) setItems(data);
    }).catch(e => {
      if (active) setError(e.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refresh, round, user?.id]);

  const offset = items.length ? round % items.length : 0;
  const visible = items.length ? [...items.slice(offset), ...items.slice(0, offset)] : items;
  return <section className="recommend-page">
    <div className="recommend-head">
      <div>
        <p className="eyebrow">PERSONALIZED FOR YOU</p>
        <h1>为你推荐<span>，现在就入戏。</span></h1>
        <p className="recommend-lede">根据你的收藏、追剧和观看足迹，挑出下一部值得打开的故事。</p>
      </div>
      <button className="secondary" onClick={() => setRound(value => value + 1)} disabled={loading} aria-label="换一批推荐">
        {loading ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}换一批
      </button>
    </div>
    {!user && <div className="recommend-login"><Sparkles size={17}/><span>登录后推荐会越来越懂你，当前先为你展示热播与新剧。</span><button className="secondary" onClick={onLogin}>登录同步偏好</button></div>}
    {error ? <div className="empty"><AlertCircle/><h3>推荐暂时不可用</h3><p>{error}</p><button className="secondary" onClick={() => setRound(value => value + 1)}>重新加载</button></div>
      : loading ? <div className="recommend-stack">{Array.from({ length: 3 }, (_, i) => <div className="recommend-skeleton" key={i}/>)}</div>
      : !visible.length ? <div className="empty"><Film size={34}/><h3>片库正在准备新故事</h3><p>先去发现页浏览几部短剧，推荐会马上有内容。</p></div>
      : <div className="recommend-stack">{visible.map((drama, index) => <article className="recommend-card" key={drama.id}>
        <button className="recommend-poster" onClick={() => onView(drama.id)} aria-label={`播放${drama.title}`}>
          <img src={drama.coverImg} alt={drama.title + '封面'} loading="lazy"/>
          <span className="recommend-shade"/>
          <span className="recommend-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="recommend-play"><Play size={22} fill="currentColor"/></span>
          <span className="recommend-poster-meta"><span>{drama.category}</span><span>{seriesLabel(drama)}</span></span>
        </button>
        <div className="recommend-copy">
          <div className="recommend-title-row"><div><p className="recommend-reason"><Sparkles size={13}/>{drama.recommendationReason || '为你挑选'}</p><h2>{drama.title}</h2></div><button className="icon-button" onClick={() => onView(drama.id)} aria-label={`打开${drama.title}`}><ChevronRight size={19}/></button></div>
          <p className="recommend-description">{drama.description}</p>
          <div className="recommend-meta"><span><Play size={13} fill="currentColor"/>{count(drama.viewCount)} 次播放</span><span><Bookmark size={13} fill={drama.favorited ? 'currentColor' : 'none'}/>{count(drama.favoriteCount)} 人收藏</span><button className="primary" onClick={() => onView(drama.id)}>立即观看<ChevronRight size={15}/></button></div>
        </div>
      </article>)}</div>}
  </section>;
}
