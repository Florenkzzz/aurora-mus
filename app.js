(function () {
  'use strict';

  // ============================================================
  // 1. СОСТОЯНИЕ И LOCALSTORAGE
  // ============================================================
  const KEY = 'aurora_state_v2';
  const THEME_KEY = 'aurora_theme';
  let state = { favorites: [], history: [] };

  function load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p && Array.isArray(p.favorites)) state = { ...state, ...p };
      }
    } catch (e) { console.warn('load:', e); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save:', e); }
  }

  // ============================================================
  // 2. ТЕМА (ТЁМНАЯ / СВЕТЛАЯ)
  // ============================================================
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#07080c' : '#f5f7fc');
    const row = document.getElementById('themeRow');
    const sub = document.getElementById('themeSub');
    if (row) row.classList.toggle('on', theme === 'dark');
    if (sub) sub.textContent = theme === 'dark' ? 'Включена' : 'Выключена';
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) { applyTheme(saved); return; }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // ============================================================
  // 3. DOM ССЫЛКИ
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const audio = $('audio'), player = $('player'), pCover = $('pCover');
  const pTitle = $('pTitle'), pStatus = $('pStatus'), playBtn = $('playBtn');
  const prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), progressFill = $('progressFill');
  const searchInput = $('searchInput'), searchResults = $('searchResults');
  const trendList = $('trendList'), topList = $('topList'), favList = $('favList');
  const toast = $('toast');

  // ============================================================
  // 4. ДЕМО-ТРЕКИ
  // ============================================================
  const TREND_DEMO = [
    { id: 'demo-1', title: 'Classic Chill', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', tag: 'DEMO' },
    { id: 'demo-2', title: 'Independent Spirit', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', tag: 'DEMO' },
    { id: 'demo-3', title: 'Ambient Cinematic', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', tag: 'DEMO' },
    { id: 'demo-4', title: 'Lo-Fi Beats', artist: 'SoundHelix', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', tag: 'DEMO' }
  ];

  // ============================================================
  // 5. УТИЛИТЫ
  // ============================================================
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
  }
  function isFav(id) { return state.favorites.some(t => t.id === id); }
  function toggleFav(track) {
    const i = state.favorites.findIndex(t => t.id === track.id);
    if (i > -1) state.favorites.splice(i, 1);
    else state.favorites.push(track);
    save();
    renderFavs();
    document.querySelectorAll(`.t-fav[data-id="${CSS.escape(track.id)}"]`).forEach(b => {
      b.classList.toggle('on', isFav(track.id));
      b.textContent = isFav(track.id) ? '★' : '☆';
    });
  }

  // ============================================================
  // 6. РЕНДЕР ТРЕКОВ
  // ============================================================
  function buildTrackEl(t) {
    const active = audio.dataset.currentId === t.id;
    const el = document.createElement('div');
    el.className = 'track' + (active ? ' active' : '');
    el.dataset.id = t.id;
    const coverStyle = t.img ? `style="background-image:url('${esc(t.img)}')" data-img="1"` : '';
    const fav = isFav(t.id);

    el.innerHTML = `
      <div class="t-cover" ${coverStyle}>${t.img ? '' : '🎵'}</div>
      <div class="t-meta">
        <div class="t-name">${esc(t.title)}</div>
        <div class="t-artist">${esc(t.artist)}</div>
        ${t.tag ? `<span class="t-tag ${t.tag === 'API' ? 'api' : ''}">${esc(t.tag)}</span>` : ''}
      </div>
      <div class="eq"><span></span><span></span><span></span><span></span></div>
      <button class="t-fav ${fav ? 'on' : ''}" data-id="${esc(t.id)}">${fav ? '★' : '☆'}</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.t-fav')) return;
      playFromList(t);
    });
    el.querySelector('.t-fav').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(t);
    });
    return el;
  }

  function renderList(container, tracks, emptyMsg) {
    container.innerHTML = '';
    if (!tracks.length) {
      container.innerHTML = `<div class="empty"><span class="e-ico">🎵</span>${emptyMsg || 'Пусто'}</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    tracks.forEach(t => frag.appendChild(buildTrackEl(t)));
    container.appendChild(frag);
  }

  function renderFavs() {
    renderList(favList, state.favorites, 'Пока пусто. Добавляйте треки в избранное звёздочкой.');
  }

  // ============================================================
  // 7. ЛОГИКА ПЛЕЕРА
  // ============================================================
  let queue = [];
  let currentIdx = -1;
  const trackCache = new Map();
  function cacheTrack(t) { trackCache.set(t.id, t); }
  function findTrackById(id) { return trackCache.get(id) || state.favorites.find(t => t.id === id) || null; }

  function setCover(el, img) {
    if (img) { el.style.backgroundImage = `url('${img}')`; el.setAttribute('data-img', '1'); }
    else { el.style.backgroundImage = ''; el.removeAttribute('data-img'); }
  }

  function playFromList(track) {
    const activeSection = document.querySelector('.section.active');
    const allTracks = [];
    if (activeSection) {
      activeSection.querySelectorAll('.track').forEach(el => {
        const found = findTrackById(el.dataset.id);
        if (found) allTracks.push(found);
      });
    }
    queue = allTracks.length ? allTracks : [track];
    currentIdx = queue.findIndex(t => t.id === track.id);
    if (currentIdx < 0) { queue = [track]; currentIdx = 0; }
    playCurrent();
  }

  function playCurrent() {
    const t = queue[currentIdx];
    if (!t) return;
    cacheTrack(t);
    audio.src = t.url;
    audio.dataset.currentId = t.id;
    pTitle.textContent = t.title;
    pStatus.textContent = t.artist;
    setCover(pCover, t.img);
    player.classList.add('show');
    playBtn.textContent = '⏸';

    const p = audio.play();
    if (p && p.catch) p.catch(() => {
      pStatus.textContent = 'Нажмите ▶ для запуска';
      playBtn.textContent = '▶';
    });

    document.querySelectorAll('.track').forEach(el => {
      const isActive = el.dataset.id === t.id;
      el.classList.toggle('active', isActive);
      const cover = el.querySelector('.t-cover');
      if (cover && !t.img) cover.textContent = isActive ? '🎶' : '🎵';
    });

    state.history = [t.id, ...state.history.filter(x => x !== t.id)].slice(0, 50);
    save();
  }

  function next() {
    if (currentIdx + 1 < queue.length) { currentIdx++; playCurrent(); }
    else if (queue.length) { currentIdx = 0; playCurrent(); }
  }
  function prev() {
    if (currentIdx > 0) { currentIdx--; playCurrent(); }
    else { audio.currentTime = 0; }
  }

  playBtn.addEventListener('click', () => {
    if (!audio.dataset.currentId) {
      const first = trendList.querySelector('.track');
      if (first) first.click();
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  audio.addEventListener('play', () => { playBtn.textContent = '⏸'; });
  audio.addEventListener('pause', () => { playBtn.textContent = '▶'; });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  });
  audio.addEventListener('ended', next);
  audio.addEventListener('error', () => {
    pStatus.textContent = 'Ошибка, пропускаем...';
    setTimeout(next, 1200);
  });

  // ============================================================
  // 8. НАВИГАЦИЯ
  // ============================================================
  function goTo(target) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.target === target));
    document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === target));
  }
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => goTo(b.dataset.target));
  });

  // ============================================================
  // 9. ПОИСК (iTunes API)
  // ============================================================
  let searchAbort = null;
  function searchTracks(q) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    searchResults.innerHTML = `<div class="loading-text"><div class="spinner"></div> Поиск по базе...</div>`;

    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=25`, { signal: searchAbort.signal })
      .then(r => r.json())
      .then(data => {
        const items = (data.results || []).filter(r => r.previewUrl).map((r, i) => ({
          id: `itunes-${r.trackId || i}-${Date.now()}`,
          title: r.trackName || 'Без названия',
          artist: r.artistName || 'Неизвестный',
          url: r.previewUrl,
          img: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '200x200') : null,
          tag: 'API'
        }));
        if (!items.length) {
          searchResults.innerHTML = `<div class="empty"><span class="e-ico">🔎</span>Ничего не найдено по запросу «${esc(q)}»</div>`;
          return;
        }
        items.forEach(cacheTrack);
        renderList(searchResults, items, '');
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        searchResults.innerHTML = `<div class="empty"><span class="e-ico">⚠️</span>Ошибка поиска. Проверьте интернет.</div>`;
      });
  }

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearTimeout(searchTimer);
    if (!q) {
      searchResults.innerHTML = `<div class="empty"><span class="e-ico">🎵</span>Введите запрос, чтобы найти миллионы треков мира</div>`;
      return;
    }
    searchTimer = setTimeout(() => searchTracks(q), 500);
  });

  // ============================================================
  // 10. ТОП ЧАРТЫ
  // ============================================================
  function loadTopCharts() {
    fetch('https://itunes.apple.com/us/rss/topsongs/limit=10/json')
      .then(r => r.json())
      .then(data => {
        const entries = (data && data.feed && data.feed.entry) || [];
        const items = entries.map((e, i) => ({
          id: `top-${i}-${(e.id && e.id.attributes && e.id.attributes['im:id']) || i}`,
          title: (e['im:name'] && e['im:name'].label) || 'Без названия',
          artist: (e['im:artist'] && e['im:artist'].label) || 'Неизвестен',
          url: (e.link && e.link.find && e.link.find(l => l.attributes && l.attributes.type === 'audio/x-m4a') && e.link.find(l => l.attributes && l.attributes.type === 'audio/x-m4a').attributes.href) || (e.link && e.link[1] && e.link[1].attributes && e.link[1].attributes.href),
          img: (e['im:image'] && e['im:image'][2] && e['im:image'][2].label) || null,
          tag: 'TOP'
        })).filter(t => t.url);

        if (items.length) {
          items.forEach(cacheTrack);
          renderList(topList, items, '');
        } else {
          topList.innerHTML = `<div class="empty"><span class="e-ico">📊</span>Чарты недоступны</div>`;
        }
      })
      .catch(() => {
        topList.innerHTML = `<div class="empty"><span class="e-ico">📊</span>Чарты недоступны (нет интернета)</div>`;
      });
  }

  // ============================================================
  // 11. ЭКСПОРТ / ИМПОРТ / ОЧИСТКА
  // ============================================================
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aurora-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('Коллекция экспортирована');
  }

  function importData(file) {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const p = JSON.parse(e.target.result);
        if (p && Array.isArray(p.favorites)) {
          state = { ...state, ...p };
          save();
          renderFavs();
          showToast(`Импорт успешен: ${state.favorites.length} треков`);
        } else showToast('Неверный формат файла');
      } catch (err) { showToast('Ошибка: ' + err.message); }
    };
    r.readAsText(file);
  }

  ['exportBtn', 'exportBtn2'].forEach(id => { const el = $(id); if (el) el.addEventListener('click', exportData); });
  ['importBtn', 'importBtn2'].forEach(id => { const el = $(id); if (el) el.addEventListener('click', () => $('importFile').click()); });

  $('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  $('clearBtn').addEventListener('click', () => {
    if (confirm('Удалить все данные? Это действие необратимо.')) {
      state = { favorites: [], history: [] };
      save();
      renderFavs();
      audio.pause();
      audio.removeAttribute('src');
      delete audio.dataset.currentId;
      player.classList.remove('show');
      pTitle.textContent = 'Ничего не играет';
      pStatus.textContent = 'Выберите трек';
      setCover(pCover, null);
      showToast('Все данные удалены');
    }
  });

  $('themeRow').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // ============================================================
  // 12. ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  function init() {
    initTheme();
    load();
    TREND_DEMO.forEach(cacheTrack);
    renderList(trendList, TREND_DEMO, 'Нет демо-треков');
    state.favorites.forEach(cacheTrack);
    renderFavs();
    loadTopCharts();
  }

  init();
})();