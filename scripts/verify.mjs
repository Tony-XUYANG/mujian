import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const base=process.env.APP_URL || 'http://127.0.0.1:8080';
let passed=0;
async function request(path,method='GET',body,token){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.status===204?null:await r.json()};}
function check(name,condition){assert.ok(condition,name);passed++;console.log(`PASS ${passed}: ${name}`);}
const health=await request('/health');check('真实数据库连接',health.status===200&&health.data.database==='connected');
const list=await request('/dramas');check('公开内容列表',list.status===200&&list.data.length>=8);
const bad=await request('/auth/login','POST',{username:'admin',password:'wrong'});check('错误密码拒绝登录',bad.status===401);
const username='验收_'+Date.now().toString(36);
const signup=await request('/auth/register','POST',{username,password:'Verify123!',nickname:'自动验收',role:'ADMIN'});check('用户注册且不能自选管理员',signup.status===201&&signup.data.user.role==='USER');
const token=signup.data.token;
const duplicate=await request('/auth/register','POST',{username,password:'Verify123!',nickname:'重复'});check('用户名唯一约束',duplicate.status===409);
const weak=await request('/auth/register','POST',{username:'weak_demo',password:'123',nickname:'弱密码'});check('注册字段校验',weak.status===400);
check('普通用户禁止后台查询',(await request('/admin/dramas','GET',undefined,token)).status===403);
check('匿名禁止后台操作',(await request('/admin/dramas')).status===401);
check('无效token拒绝',(await request('/auth/me','GET',undefined,'invalid')).status===401);
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const expiredPart=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:'mujian',sub:String(signup.data.user.id),role:'USER',exp:1,iat:0});
const expired=expiredPart+'.'+createHmac('sha256','local-demo-only-mujian-secret-change-before-deploy-2026').update(expiredPart).digest('base64url');
check('过期token拒绝',(await request('/auth/me','GET',undefined,expired)).status===401);
const admin=await request('/auth/login','POST',{username:'admin',password:'Admin123!'});check('管理员登录',admin.status===200&&admin.data.user.role==='ADMIN');
const adminToken=admin.data.token;
const input={title:'验收临时短剧',category:'都市',description:'用于验证新增、修改、播放和删除的临时记录。',coverImg:'/media/forest.jpg',videoUrl:'/media/sintel-trailer.mp4'};
const created=await request('/admin/dramas','POST',input,adminToken);check('管理员新增',created.status===201&&created.data.id>0);
const id=created.data.id;
try {
  check('普通用户禁止后台修改',(await request('/admin/dramas/'+id,'PUT',input,token)).status===403);
  const invalid=await request('/admin/dramas','POST',{...input,videoUrl:'javascript:alert(1)'},adminToken);check('拒绝不安全资源地址',invalid.status===400);
  const updated=await request('/admin/dramas/'+id,'PUT',{...input,title:'验收已更新'},adminToken);check('管理员编辑与前台同步',updated.status===200&&(await request('/dramas/'+id)).data.title==='验收已更新');
  check('未登录不能点赞',(await request(`/dramas/${id}/like`,'PUT')).status===401);
  await request(`/dramas/${id}/like`,'PUT',undefined,token);
  const liked=await request(`/dramas/${id}/like`,'PUT',undefined,token);check('重复点赞幂等',liked.status===200&&liked.data.likeCount===1&&Boolean(liked.data.liked));
  const concurrent=await Promise.all(Array.from({length:6},()=>request(`/dramas/${id}/favorite`,'PUT',undefined,token)));check('并发收藏唯一约束',concurrent.every(r=>r.status===200)&&concurrent.at(-1).data.favoriteCount===1);
  const fresh=await request('/auth/login','POST',{username,password:'Verify123!'});
  const persisted=await request('/dramas/'+id,'GET',undefined,fresh.data.token);check('重新登录后数据持久化',Boolean(persisted.data.liked)&&Boolean(persisted.data.favorited));
  const favorites=await request('/me/favorites','GET',undefined,token);check('个人收藏列表',favorites.data.some(d=>d.id===id));
  await request(`/dramas/${id}/like`,'DELETE',undefined,token);
  const unliked=await request(`/dramas/${id}/like`,'DELETE',undefined,token);check('重复取消点赞幂等',unliked.status===200&&unliked.data.likeCount===0);
  const views=await request(`/dramas/${id}/view`,'POST');check('播放计数更新',views.status===200&&views.data.viewCount===1);
  const commentsOpen=await request(`/dramas/${id}/comments`);check('匿名可查看剧友评论',commentsOpen.status===200&&Array.isArray(commentsOpen.data));
  const comment=await request(`/dramas/${id}/comments`,'POST',{content:'验收评论：节奏很舒服。'},token);check('登录用户发表评论',comment.status===201&&comment.data.content.includes('节奏'));
  const progress=await request(`/dramas/${id}/progress`,'PUT',{progressSec:12,durationSec:60},token);check('观看进度同步',progress.status===200&&progress.data.progressSec===12);
  const resumed=await request('/dramas/'+id,'GET',undefined,token);check('详情返回上次观看位置',resumed.status===200&&resumed.data.progressSec===12&&resumed.data.durationSec===60);
  const history=await request('/me/history','GET',undefined,token);check('继续观看历史',history.status===200&&history.data.some(d=>d.id===id&&d.progressSec===12));
  const removed=await request(`/me/history/${id}`,'DELETE',undefined,token);check('用户可移除观看记录',removed.status===204&&!(await request('/me/history','GET',undefined,token)).data.some(d=>d.id===id));
  const search=await request('/dramas?q='+encodeURIComponent('验收已更新'));check('搜索短剧',search.data.some(d=>d.id===id));
} finally {
  const deleted=await request('/admin/dramas/'+id,'DELETE',undefined,adminToken);check('管理员删除',deleted.status===200);
}
check('删除后前台不可访问',(await request('/dramas/'+id)).status===404);
const remaining=await request('/me/favorites','GET',undefined,token);check('删除级联清理收藏',!remaining.data.some(d=>d.id===id));
const video=await fetch(base+'/media/sintel-trailer.mp4',{headers:{Range:'bytes=0-1023'}});check('本地视频支持拖动播放',video.status===206&&(await video.arrayBuffer()).byteLength===1024);
const home=await fetch(base+'/');check('前端已集成到Java服务',home.status===200&&(await home.text()).includes('幕间'));
const manifest=await fetch(base+'/manifest.webmanifest');check('App安装清单可访问',manifest.status===200&&(await manifest.text()).includes('standalone'));
const worker=await fetch(base+'/sw.js');check('App离线缓存脚本可访问',worker.status===200&&(await worker.text()).includes('asset-manifest.json'));
console.log(`\n${passed} checks passed. Temporary user: ${username}`);
