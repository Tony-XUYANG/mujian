import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { api, type User } from './api';
import { releaseTime, useLiveRevision } from './releases';

type Notification={id:number;createdAt:number;readAt:number|null;episodeId:number;episodeNo:number;title:string;dramaId:number;dramaTitle:string;coverImg:string};
type Inbox={items:Notification[];unreadCount:number;throughId:number;total:number};
export function NotificationEntry({user,refresh,onOpen}:{user:User|null;refresh:number;onOpen:()=>void}){
  const [count,setCount]=useState(0),[revision]=useLiveRevision();
  useEffect(()=>{let active=true;if(!user){setCount(0);return;}api<{unreadCount:number}>('/me/notifications/count').then(r=>{if(active)setCount(r.unreadCount);}).catch(()=>undefined);return()=>{active=false;};},[user?.id,refresh,revision]);
  return <button className="icon-button notification-entry" aria-label={'打开更新提醒'+(count?'，'+count+'条未读':'')} title="更新提醒" onClick={onOpen}><Bell size={19}/>{count>0&&<span>{count>99?'99+':count}</span>}</button>;
}
export function NotificationInbox({user,onLogin,onView,onChange}:{user:User|null;onLogin:()=>void;onView:(id:number,episodeId:number)=>void;onChange:()=>void}){
  const [data,setData]=useState<Inbox|null>(null),[error,setError]=useState(''),[page,setPage]=useState(0),[unread,setUnread]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[revision,refresh]=useLiveRevision();
  useEffect(()=>{if(!user){setLoading(false);return;}let active=true;setError('');api<Inbox>('/me/notifications?page='+page+'&unread='+unread).then(r=>{if(active){if(page>0&&r.items.length===0){setPage(page-1);return;}setData(r);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[user?.id,page,unread,revision]);
  async function read(item?:Notification){if(busy||!data)return;setBusy(true);setError('');try{await api(item?'/me/notifications/'+item.id+'/read':'/me/notifications/read-all',{method:'PUT',...(!item?{body:JSON.stringify({throughId:data.throughId})}:{})});refresh();onChange();if(item)onView(item.dramaId,item.episodeId);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="inbox-page"><div className="page-intro"><div><p className="eyebrow">喜欢的故事，有了新消息</p><h1>更新提醒</h1><p className="following-subtitle">追剧和预约的新集上线后，在这里接着看。</p></div><Bell className="following-icon" size={29}/></div>
    {!user?<div className="empty"><h3>登录后查看更新提醒</h3><button className="primary" onClick={onLogin}>登录 / 注册</button></div>:<>
      <div className="inbox-toolbar"><div className="release-tabs"><button className={!unread?'selected':''} onClick={()=>{if(unread){setUnread(false);setPage(0);setLoading(true);}}}>全部</button><button className={unread?'selected':''} onClick={()=>{if(!unread){setUnread(true);setPage(0);setLoading(true);}}}>未读{data?.unreadCount?' · '+data.unreadCount:''}</button></div><button className="secondary" disabled={busy||!data?.unreadCount} onClick={()=>void read()}><CheckCheck size={16}/>全部已读</button><button className="icon-button" aria-label="刷新提醒" onClick={refresh}><RefreshCw size={17}/></button></div>
      {error&&<div className="release-error" role="alert">{error}<button className="secondary" onClick={refresh}>重试</button></div>}
      {loading?<div className="empty"><LoaderCircle className="spin"/>加载提醒…</div>:!data?.items.length&&!error?<div className="empty"><Bell size={32}/><h3>{unread?'未读提醒都看完了':'还没有更新提醒'}</h3><p>预约新集或追一部剧，上线后就会收到提醒。</p></div>:<div className="inbox-list">{data?.items.map(n=><button key={n.id} className={'notification-card'+(!n.readAt?' unread':'')} disabled={busy} onClick={()=>void read(n)} aria-label={'观看'+n.dramaTitle+'第'+n.episodeNo+'集'}><img src={n.coverImg} alt=""/><span><span className="notification-label">{n.readAt?'已读':'新集上线'} · {releaseTime(n.createdAt)}</span><strong>{n.dramaTitle}</strong><span>第 {n.episodeNo} 集 · {n.title}</span><small>点击观看这一集</small></span><ChevronRight size={18}/></button>)}</div>}
      {Boolean(data&&data.total>20)&&<div className="inbox-pagination"><button className="secondary" disabled={page===0||loading} onClick={()=>{setPage(p=>p-1);setLoading(true);}}>上一页</button><span>第 {page+1} / {Math.ceil((data?.total||0)/20)} 页</span><button className="secondary" disabled={(page+1)*20>=(data?.total||0)||loading} onClick={()=>{setPage(p=>p+1);setLoading(true);}}>下一页</button></div>}
    </>}
  </section>;
}
