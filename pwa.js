(function () {
  'use strict';

  // ============================================================
  // 1. СОЗДАНИЕ МАНИФЕСТА (ДИНАМИЧЕСКИ)
  // ============================================================
  function createManifest() {
    const manifest = {
      name: 'Aurora Music Player',
      short_name: 'Aurora',
      description: 'Премиальный музыкальный плеер',
      start_url: './index.html',
      scope: './',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#07080c',
      theme_color: '#6a5cff',
      icons: [
        {
          src: 'data:image/svg+xml,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
              <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#6a5cff"/>
                <stop offset="1" stop-color="#00e0ff"/>
              </linearGradient></defs>
              <rect width="512" height="512" rx="112" fill="url(#g)"/>
              <text x="256" y="340" font-size="260" text-anchor="middle" fill="white" font-family="Arial">✦</text>
            </svg>`
          ),
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }
      ]
    };

    try {
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.getElementById('dynamicManifest');
      if (link) link.setAttribute('href', url);
    } catch (e) {
      console.warn('Manifest error:', e);
    }
  }

  // ============================================================
  // 2. РЕГИСТРАЦИЯ SERVICE WORKER
  // ============================================================
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('SW: не поддерживается');
      return;
    }
    
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol !== 'https:' && !isLocal) {
      console.log('SW: нужен https или localhost');
      return;
    }

    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(() => console.log('SW: зарегистрирован'))
      .catch(err => console.warn('SW ошибка:', err));
  }

  // ============================================================
  // 3. УПРАВЛЕНИЕ УСТАНОВКОЙ
  // ============================================================
  let deferredPrompt = null;
  let pwaReady = false;

  // Ссылки на элементы
  const getEl = (id) => document.getElementById(id);
  const banner = getEl('installBanner');
  const topBtn = getEl('installBtnTop');
  const pulse = getEl('installPulse');
  const sub = getEl('pwaSub');

  function showInstallUI() {
    pwaReady = true;
    if (banner && !localStorage.getItem('aurora_install_dismissed')) banner.classList.add('show');
    if (topBtn) topBtn.style.display = 'flex';
    if (pulse) pulse.style.display = 'block';
    if (sub) sub.textContent = 'Готово к установке — нажмите';
  }

  function hideInstallUI() {
    pwaReady = false;
    if (banner) banner.classList.remove('show');
    if (topBtn) topBtn.style.display = 'none';
    if (pulse) pulse.style.display = 'none';
    if (sub) sub.textContent = 'Уже установлено или недоступно';
  }

  async function doInstall() {
    if (!deferredPrompt) {
      // Если это не встроенный PWA-промпт, показываем инструкцию
      showToast('Установка недоступна. Откройте через https:// или localhost.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('Install outcome:', outcome);
    deferredPrompt = null;
    hideInstallUI();
    if (outcome === 'accepted') showToast('Aurora установлена! 🎉');
  }

  // ============================================================
  // 4. СОБЫТИЯ БРАУЗЕРА
  // ============================================================
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    hideInstallUI();
    showToast('Приложение установлено!');
  });

  // Проверка: уже установлено?
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    hideInstallUI();
  }

  // ============================================================
  // 5. ОБРАБОТЧИКИ КЛИКОВ (БАННЕР И КНОПКИ)
  // ============================================================
  ['installBannerBtn', 'installBtnTop', 'pwaRow'].forEach(id => {
    const el = getEl(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (id === 'pwaRow' && !pwaReady) {
          showToast('Установка недоступна. Откройте через https:// или localhost.');
          return;
        }
        doInstall();
      });
    }
  });

  // Закрыть баннер
  const bannerClose = getEl('installBannerClose');
  if (bannerClose) {
    bannerClose.addEventListener('click', (e) => {
      e.stopPropagation();
      if (banner) banner.classList.remove('show');
      localStorage.setItem('aurora_install_dismissed', '1');
    });
  }

  // ============================================================
  // 6. ВСПОМОГАТЕЛЬНЫЙ TOAST (ЕСЛИ НУЖЕН ВНЕ APP.JS)
  // ============================================================
  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ============================================================
  // 7. ЗАПУСК
  // ============================================================
  // Ждем полной загрузки DOM перед созданием манифеста
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createManifest();
      registerServiceWorker();
    });
  } else {
    createManifest();
    registerServiceWorker();
  }
  
})();