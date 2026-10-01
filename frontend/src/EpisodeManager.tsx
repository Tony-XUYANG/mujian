import { useEffect, useState, type FormEvent } from 'react';
import { Check, ListVideo, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, seriesLabel, type Drama, type Episode } from './api';
import { Modal } from './Modal';

type Input={episodeNo:number;title:string;videoUrl:string};
export function EpisodeManager({drama,onClose,onChange}:{drama:Drama;onClose:()=>void;onChange:()=>void}) {
  const [episodes,setEpisodes]=useState<Episode[]>([]),[info,setInfo]=useState(drama),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<number|null>(null),[deleting,setDeleting]=useState<Episode|null>(null),[notice,setNotice]=useState('');
  const [form,setForm]=useState<Input>({episodeNo:1,title:'',videoUrl:drama.videoUrl});
  const [status,setStatus]=useState(drama.seriesStatus||'COMPLETED'),[total,setTotal]=useState(drama.totalEpisodes||1);
  const base='/admin/dramas/'+drama.id;
  async function refresh(){setLoading(true);setError('');try{const [e,d]=await Promise.all([api<Episode[]>('/dramas/'+drama.id+'/episodes'),api<Drama>('/dramas/'+drama.id)]);setEpisodes(e);setInfo(d);setTotal(d.totalEpisodes||1);setStatus(d.seriesStatus||'COMPLETED');setForm({episodeNo:Math.max(...e.map(i=>i.episodeNo),0)+1,title:'',videoUrl:d.videoUrl});setEditing(null);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void refresh();},[drama.id]);
  function edit(ep:Episode){setEditing(ep.id);setForm({episodeNo:ep.episodeNo,title:ep.title,videoUrl:ep.videoUrl});setError('');setNotice('');}
  function reset(){setEditing(null);setForm({episodeNo:Math.max(...episodes.map(e=>e.episodeNo),0)+1,title:'',videoUrl:info.videoUrl});}
  async function saveEpisode(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');try{await api(base+'/episodes'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',body:JSON.stringify(form)});await refresh();onChange();setNotice('分集已保存，播放页已同步更新');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function saveSeries(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');try{const d=await api<Drama>(base+'/series',{method:'PUT',body:JSON.stringify({status,totalEpisodes:total})});setInfo(d);onChange();setNotice('连载状态已更新');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function remove(){if(!deleting||busy)return;setBusy(true);setError('');try{await api(base+'/episodes/'+deleting.id,{method:'DELETE'});setDeleting(null);await refresh();onChange();setNotice('分集已删除，状态已调整为连载中');}catch(e){setError((e as Error).message);setDeleting(null);}finally{setBusy(false);}}
  return <Modal label="分集管理" className="episode-admin-overlay" onClose={()=>{if(!busy)onClose();}}><div className="episode-admin-top"><div><p className="eyebrow">分集与连载</p><h2>{drama.title}</h2><p className="series-meta">{seriesLabel(info)}</p></div><button className="icon-button" aria-label="关闭分集管理" disabled={busy} onClick={onClose}><X/></button></div>
    {loading?<div className="empty"><LoaderCircle className="spin"/>加载分集中…</div>:<>
      <form className="series-form" onSubmit={saveSeries}><label>连载状态<select value={status} onChange={e=>setStatus(e.target.value as typeof status)} disabled={busy}><option value="SERIALIZING">连载中</option><option value="COMPLETED">已完结</option></select></label><label>计划总集数<input type="number" min={1} max={500} required value={total} onChange={e=>setTotal(Number(e.target.value))} disabled={busy}/></label><button className="secondary" disabled={busy}>保存状态</button></form>
      <p className="field-hint">新增、删除或调整集号后，自动恢复连载状态。全部集号连续且齐全后，才可标记完结。</p>
      <div className="episode-admin-list">{episodes.map(ep=><article key={ep.id}><span className="episode-number">{ep.episodeNo}</span><div><strong>{ep.title}</strong><small>{ep.videoUrl}</small></div><button className="icon-button" disabled={busy} aria-label={'编辑第'+ep.episodeNo+'集'} onClick={()=>edit(ep)}><Pencil size={16}/></button><button className="icon-button danger" disabled={busy||episodes.length<=1} aria-label={'删除第'+ep.episodeNo+'集'} onClick={()=>setDeleting(ep)}><Trash2 size={16}/></button></article>)}</div>
      <form className="episode-editor" onSubmit={saveEpisode}><h3><ListVideo size={17}/>{editing?'编辑分集':'新增分集'}</h3><div className="form-row"><label>集号<input type="number" min={1} max={500} required value={form.episodeNo} onChange={e=>setForm({...form,episodeNo:Number(e.target.value)})} disabled={busy}/></label><label>分集标题<input required maxLength={80} value={form.title} placeholder="这一集的故事" onChange={e=>setForm({...form,title:e.target.value})} disabled={busy}/></label></div><label>分集视频地址<input required maxLength={1000} value={form.videoUrl} onChange={e=>setForm({...form,videoUrl:e.target.value})} disabled={busy}/></label><div className="modal-actions">{editing&&<button className="secondary" type="button" disabled={busy} onClick={reset}>取消编辑</button>}<button className="primary" disabled={busy}>{editing?<Check size={16}/>:<Plus size={16}/>}保存分集</button></div></form>
    </>}
    {error&&<div className="form-error" role="alert">{error}{!episodes.length&&<button className="secondary" onClick={refresh}>重新加载</button>}</div>}{notice&&<p className="episode-success" role="status">{notice}</p>}
    {deleting&&<Modal label="删除分集" onClose={()=>{if(!busy)setDeleting(null);}}><h2>删除第 {deleting.episodeNo} 集？</h2><p className="muted">这集的观看进度也会删除，其他分集保留。删除后短剧将恢复为连载中。</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleting(null)}>保留</button><button className="primary destructive" disabled={busy} onClick={remove}>确认删除分集</button></div></Modal>}
  </Modal>;
}
