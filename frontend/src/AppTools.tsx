import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Download, Monitor, RefreshCw, Smartphone, X } from 'lucide-react';
import { Modal } from './Modal';
import { createAppLifecycle, devicePlatform, initialAppState } from './appLifecycle';
import './app-tools.css';

const guides = {
  desktop: { title: '电脑 · Chrome / Edge', steps: ['用 Chrome 或 Edge 打开当前网站。', '点击地址栏右侧的安装图标，或打开浏览器菜单选择“安装幕间 / 将此站点作为应用安装”。', '确认安装后，从桌面或开始菜单打开幕间。'] },
  android: { title: '安卓手机', steps: ['用 Chrome 或支持安装的浏览器打开当前网站。', '在浏览器菜单选择“安装应用”或“添加到主屏幕”，按提示确认。', '回到手机桌面，点击“幕间”图标打开。'] },
  ios: { title: 'iPhone / iPad', steps: ['在 Safari 中打开当前网站；若在微信等内置浏览器中，请先复制链接到 Safari。', '点击“分享”按钮，选择“添加到主屏幕”；如有“作为网页 App 打开”选项，请保持开启。', '确认名称“幕间”并添加，从主屏幕图标打开。'] },
};

export function AppTools() {
  const [state, setState] = useState(initialAppState);
  const lifecycle = useRef<ReturnType<typeof createAppLifecycle> | null>(null);
  const [view, setView] = useState<'install' | 'update' | null>(null);
  const [platform, setPlatform] = useState(() => devicePlatform(navigator.userAgent, navigator.maxTouchPoints));
  const [copyMessage, setCopyMessage] = useState('');
  const [updateHidden, setUpdateHidden] = useState(false);
  useEffect(() => { setUpdateHidden(false); }, [state.update]);
  useEffect(() => {
    const client = createAppLifecycle(setState, import.meta.env.DEV);
    lifecycle.current = client;
    return () => { client.dispose(); lifecycle.current = null; };
  }, []);
  const hasUpdate = state.update === 'ready' || state.update === 'reload';
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin + '/#home'); setCopyMessage('访问链接已复制'); }
    catch { setCopyMessage('无法自动复制，请从浏览器地址栏复制网址。'); }
  }
  const guide = guides[platform];
  return <>
    <button className="app-tools-entry" aria-label="打开 App 安装与更新" title="App 安装与更新" onClick={() => setView('install')}><Smartphone size={18}/><span>{state.install === 'installed' ? 'App 设置' : '安装 App'}</span>{hasUpdate && <i/>}</button>
    {hasUpdate && !updateHidden && <section className="app-update-banner" aria-label="App 新版本提醒"><RefreshCw size={18}/><div><strong>{state.update === 'reload' ? '新版本已准备好' : '幕间有新版本了'}</strong><p>已缓存的视频会保留。</p></div><button className="secondary" onClick={() => setView('update')}>更新并刷新</button><button className="icon-button" aria-label="稍后更新 App" onClick={() => setUpdateHidden(true)}><X size={15}/></button></section>}
    {view === 'install' && <Modal label="安装幕间 App" className="app-tools-modal" onClose={() => setView(null)}>
      <button className="close icon-button" aria-label="关闭 App 安装窗口" onClick={() => setView(null)}><X/></button>
      <span className="app-install-icon"><img src="/icon-192.png" alt="幕间 App 图标"/></span>
      <p className="eyebrow">你的桌面放映室</p><h2>{state.install === 'installed' ? '幕间已安装' : '把幕间放到桌面'}</h2>
      <p className="muted">从图标直接打开，独立窗口看剧。想在没网时观看，请先在播放器缓存分集。</p>
      {state.install === 'available' || state.install === 'prompting' ? <button className="primary full app-install-action" disabled={state.install === 'prompting'} onClick={() => void lifecycle.current?.install()}><Download size={17}/>{state.install === 'prompting' ? '等待浏览器确认…' : '立即安装幕间'}</button> : state.install === 'installed' ? <p className="app-installed"><CheckCircle2 size={18}/>当前正在以 App 方式使用或已完成本次安装。</p> : state.install === 'unavailable' ? <p className="app-tool-message" role="status">当前地址无法安装 App，请使用 HTTPS 网站地址。</p> : <p className="app-install-hint">{state.install === 'accepted' ? '安装正在由浏览器处理。' : '没有看到安装按钮？按下方步骤操作即可。'}</p>}
      {state.installMessage && <p className="app-tool-message" role="status">{state.installMessage}</p>}
      {state.install !== 'installed' && <>
        <div className="app-device-tabs" role="group" aria-label="选择安装设备">{(['desktop', 'android', 'ios'] as const).map(key => <button key={key} aria-pressed={key === platform} onClick={() => setPlatform(key)}>{key === 'desktop' ? <Monitor size={15}/> : <Smartphone size={15}/>}{{ desktop: '电脑', android: '安卓', ios: 'iPhone' }[key]}</button>)}</div>
        <h3 className="app-guide-title">{guide.title}</h3><ol className="app-install-steps">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <button className="app-copy-link" onClick={() => void copyLink()}>复制访问链接<ArrowUpRight size={14}/></button>{copyMessage && <p className="app-tool-message" role="status">{copyMessage}</p>}
      </>}
      <div className="app-update-settings"><div><strong>App 更新</strong><p>{hasUpdate ? '新版本已准备好，确认后刷新。' : state.update === 'applying' ? '正在更新，请稍候…' : '检查新版，主动选择何时刷新。'}</p></div><button className="secondary" disabled={state.update === 'checking' || state.update === 'applying' || state.update === 'unavailable'} onClick={() => hasUpdate ? setView('update') : void lifecycle.current?.checkForUpdate()}><RefreshCw size={15}/>{hasUpdate ? '更新并刷新' : state.update === 'checking' ? '正在检查…' : '检查更新'}</button></div>
      {state.updateMessage && <p className="app-tool-message" role="status">{state.updateMessage}</p>}
      <p className="app-install-note">这是可安装的网页 App，无需下载 APK。安装和缓存能力以当前浏览器支持为准。</p>
    </Modal>}
    {view === 'update' && <Modal label="确认更新 App" className="app-tools-modal" onClose={() => { if (state.update !== 'applying') setView(null); }}>
      <span className="app-update-icon"><RefreshCw size={27}/></span><h2>准备好更新了吗？</h2><p className="muted">更新会刷新当前页面。请先完成观看或保存正在编辑的内容，未保存的输入会丢失。已缓存的视频和账号数据会保留。</p>
      {state.updateMessage && <p className="app-tool-message" role="status">{state.updateMessage}</p>}
      <div className="modal-actions"><button className="secondary" disabled={state.update === 'applying'} onClick={() => setView(null)}>返回继续使用</button><button className="primary" disabled={!hasUpdate} onClick={() => lifecycle.current?.applyUpdate()}>{state.update === 'applying' ? '正在更新…' : '确认更新并刷新'}</button></div>
    </Modal>}
  </>;
}
