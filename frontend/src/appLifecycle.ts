export type InstallState = 'manual' | 'available' | 'prompting' | 'accepted' | 'installed' | 'unavailable';
export type UpdateState = 'idle' | 'checking' | 'ready' | 'applying' | 'reload' | 'error' | 'unavailable';
export type AppState = { install: InstallState; update: UpdateState; installMessage: string; updateMessage: string };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function devicePlatform(userAgent: string, touchPoints: number): 'desktop' | 'android' | 'ios' {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  return /Android/i.test(userAgent) ? 'android' : 'desktop';
}

export function initialAppState(): AppState {
  const installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    install: installed ? 'installed' : window.isSecureContext ? 'manual' : 'unavailable',
    update: window.isSecureContext && 'serviceWorker' in navigator ? 'idle' : 'unavailable',
    installMessage: '', updateMessage: '',
  };
}

// All browser listeners live here so the UI never registers a second worker or consumes a prompt twice.
export function createAppLifecycle(onChange: (state: AppState) => void, development = false) {
  let state = initialAppState(), promptEvent: InstallEvent | null = null;
  let registration: ServiceWorkerRegistration | undefined, disposed = false, confirmed = false;
  let lastCheck = 0, timeout: ReturnType<typeof setTimeout> | undefined;
  let hadController = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
  const cleanups: Array<() => void> = [];
  const isInstalled = () => state.install === 'installed';
  const publish = (patch: Partial<AppState>) => {
    if (disposed) return;
    state = { ...state, ...patch }; onChange(state);
  };
  function listen(target: EventTarget, name: string, handler: EventListener) {
    target.addEventListener(name, handler); cleanups.push(() => target.removeEventListener(name, handler));
  }
  const media = window.matchMedia('(display-mode: standalone)');
  listen(window, 'beforeinstallprompt', event => {
    if (state.install === 'installed') return;
    event.preventDefault(); promptEvent = event as InstallEvent;
    publish({ install: 'available', installMessage: '' });
  });
  const installed = () => { promptEvent = null; publish({ install: 'installed', installMessage: '已安装，可以从桌面图标打开幕间。' }); };
  listen(window, 'appinstalled', installed);
  listen(media, 'change', () => { if (media.matches) installed(); });

  function inspectWaiting() {
    if (registration?.waiting && hadController) publish({ update: 'ready', updateMessage: '' });
  }
  const watched = new WeakSet<ServiceWorker>();
  function watchInstalling() {
    const worker = registration?.installing;
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    listen(worker, 'statechange', () => {
      if (worker.state === 'installed') {
        if (hadController) inspectWaiting();
        else publish({ update: 'idle', updateMessage: '首次准备完成，之后可检查更新。' });
      } else if (worker.state === 'redundant') {
        publish({ update: 'error', updateMessage: '新版本暂时没有准备好，请联网后重试。' });
      }
    });
  }
  const ready = !development && state.update !== 'unavailable'
    ? navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(value => {
      if (disposed) return;
      registration = value; inspectWaiting(); watchInstalling();
      listen(value, 'updatefound', watchInstalling);
    }).catch(() => publish({ update: 'error', updateMessage: '暂时无法准备 App 更新，请联网后重试。' }))
    : Promise.resolve();
  if (development) publish({ update: 'unavailable', updateMessage: '开发预览不启用离线更新。' });
  if ('serviceWorker' in navigator) listen(navigator.serviceWorker, 'controllerchange', () => {
    const wasControlled = hadController;
    hadController = Boolean(navigator.serviceWorker.controller);
    clearTimeout(timeout);
    if (confirmed) { confirmed = false; window.location.reload(); }
    else if (wasControlled) publish({ update: 'reload', updateMessage: '' });
  });

  async function checkForUpdate(automatic = false) {
    if (automatic && (document.visibilityState !== 'visible' || Date.now() - lastCheck < 15 * 60_000)) return;
    if (state.update === 'applying' || state.update === 'checking' || state.update === 'unavailable') return;
    if (!navigator.onLine) { if (!automatic) publish({ updateMessage: '当前没有网络，联网后再检查更新。' }); return; }
    await ready;
    if (disposed) return;
    if (!registration) { if (!automatic) publish({ update: 'error', updateMessage: '更新服务尚未就绪，请刷新页面后重试。' }); return; }
    lastCheck = Date.now();
    const previous = state.update;
    publish({ update: 'checking', updateMessage: '' });
    try {
      await registration.update();
      if (disposed) return;
      if (registration.waiting && hadController) inspectWaiting();
      else if (!registration.installing) publish({ update: previous === 'reload' ? 'reload' : 'idle', updateMessage: '已检查更新，暂未发现待安装的新版本。' });
    } catch {
      publish({ update: previous === 'ready' || previous === 'reload' ? previous : 'error', updateMessage: '检查更新失败，请稍后重试。' });
    }
  }
  listen(window, 'online', () => { void checkForUpdate(true); });
  listen(document, 'visibilitychange', () => { void checkForUpdate(true); });
  const interval = setInterval(() => { void checkForUpdate(true); }, 60 * 60_000);

  return {
    async install() {
      if (state.install === 'prompting' || state.install === 'installed') return;
      const event = promptEvent;
      if (!event) return;
      promptEvent = null;
      publish({ install: 'prompting', installMessage: '' });
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (!isInstalled()) publish({ install: choice.outcome === 'accepted' ? 'accepted' : 'manual', installMessage: choice.outcome === 'accepted' ? '已接受安装，请等待浏览器完成。' : '已取消安装，仍可以继续用网页观看。' });
      } catch {
        if (!isInstalled()) publish({ install: 'manual', installMessage: '安装未完成，请使用下方浏览器菜单步骤重试。' });
      }
    },
    checkForUpdate,
    applyUpdate() {
      if (state.update === 'reload') { window.location.reload(); return; }
      const worker = registration?.waiting;
      if (!worker || worker.state !== 'installed') { publish({ update: 'error', updateMessage: '新版本尚未准备好，请重新检查更新。' }); return; }
      confirmed = true; publish({ update: 'applying', updateMessage: '' });
      timeout = setTimeout(() => {
        confirmed = false; publish({ update: 'ready', updateMessage: '更新尚未完成，请稍后再试。' });
      }, 12_000);
      try { worker.postMessage({ type: 'ACTIVATE_UPDATE' }); }
      catch { clearTimeout(timeout); confirmed = false; publish({ update: 'ready', updateMessage: '暂时无法更新，请稍后再试。' }); }
    },
    dispose() { disposed = true; cleanups.forEach(fn => fn()); clearTimeout(timeout); clearInterval(interval); },
  };
}
