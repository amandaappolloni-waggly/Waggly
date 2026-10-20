// Waggly test app. Plain JavaScript, no build step.
// Maps: MapLibre + OpenFreeMap (free, no account). BUILD RULE: never call paid Google Maps services.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { makeSupabaseApi, makeDemoApi } from './api.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

const S = {
  api: null,
  me: null,
  friends: [],
  profiles: {},
  raceIdx: 0,
  rec: null,
  timers: [],
  maps: [],
  renderId: 0,
  A: {},
};

const REC_KEY = 'waggly-rec-v1';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const C = { peach: '#FFAE96', peachDeep: '#E8836A', butter: '#FFE49A', pistachio: '#CBE6BE', sky: '#BCDDF4', lavender: '#DCCDF4', berry: '#94456A', cream: '#FFF7F2', ink: '#2D2433', muted: '#6E6271' };

// ------------------------------------------------------------- helpers

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const miles = (m) => (m || 0) / 1609.344;
const fmtMi = (m) => { const v = miles(m); return (v >= 10 ? v.toFixed(1) : v.toFixed(2)); };
const fmtDur = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtDurWords = (s) => { const m = Math.round((s || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const fmtPace = (dist, dur) => { const mi = miles(dist); if (mi < 0.05 || !dur) return '–'; const p = Math.round(dur / mi); return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')}`; };
const estSteps = (dist) => Math.round(miles(dist) * 2100).toLocaleString();
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const monthName = () => new Date().toLocaleString('en-US', { month: 'long' });
const daysLeft = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate(); };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; };
const defaultTitle = (d = new Date()) => { const h = d.getHours(); return h < 11 ? 'Morning walk' : h < 14 ? 'Midday walk' : h < 17 ? 'Afternoon walk' : h < 21 ? 'Evening walk' : 'Night walk'; };
function timeAgo(iso) {
  const t = Date.parse(iso), diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  const d = new Date(t), now = new Date();
  if (dayKey(d) === dayKey(now)) return `${Math.floor(diff / 3600)}h ago`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  if (diff < 6 * 86400) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function hav(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const nameOf = (id) => (id === (S.me && S.me.id) ? 'You' : (S.profiles[id] && S.profiles[id].display_name) || 'A friend');

function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), ms);
}
function every(ms, fn) { const id = setInterval(fn, ms); S.timers.push(id); return id; }
function clearTimers() { S.timers.forEach(clearInterval); S.timers = []; }

// ------------------------------------------------------------- icons & art

const ICON = {
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  walks: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
  friends: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.3a5 5 0 0 1 5.5 5.7"/></svg>',
  packs: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="14" r="5"/><path d="M4.3 10.6 Q1.8 11.6 2.4 15.8 Q4.2 15.6 4.6 13.2"/><path d="M11.7 10.6 Q14.2 11.6 13.6 15.8 Q11.8 15.6 11.4 13.2"/><circle cx="18" cy="11" r="3.4"/><path d="M15.6 8.6 L15.6 5.2 L17.4 7.7"/><path d="M20.4 8.6 L20.4 5.2 L18.6 7.7"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="12.4" r="0.8" fill="currentColor" stroke="none"/></svg>',
  paw: (size = 24, fill = C.ink) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" aria-hidden="true"><ellipse cx="12" cy="16" rx="4.6" ry="3.6"/><circle cx="5.8" cy="10.5" r="2"/><circle cx="9.4" cy="6.6" r="2"/><circle cx="14.6" cy="6.6" r="2"/><circle cx="18.2" cy="10.5" r="2"/></svg>`,
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6E6271" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  pause: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="2"/><rect x="14" y="5" width="4" height="14" rx="2"/></svg>',
  play: '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>',
};

const AV_BG = [C.butter, C.sky, C.lavender, C.pistachio, C.peach];
const AV_FUR = [['#E3B04B', '#B9862F'], ['#5C4033', '#3B2A22'], ['#F2F2F2', '#C9C2B8'], ['#8A7A6E', '#5A4C42'], ['#2B2B2B', '#141118'], ['#C9A27A', '#8A6A48']];
function dogFace(seed, size = 48, ring = '') {
  const h = hash(seed || 'x');
  const bg = AV_BG[h % AV_BG.length];
  const [fur, ear] = AV_FUR[Math.floor(h / 7) % AV_FUR.length];
  const eye = fur === '#2B2B2B' || fur === '#5C4033' ? '#FFF4E0' : C.ink;
  const border = ring ? `border:3px solid ${ring};` : '';
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 40 40" style="background:${bg};${border}" aria-hidden="true"><ellipse cx="9" cy="17" rx="5" ry="9" fill="${ear}" transform="rotate(-18 9 17)"/><ellipse cx="31" cy="17" rx="5" ry="9" fill="${ear}" transform="rotate(18 31 17)"/><circle cx="20" cy="22" r="12" fill="${fur}"/><ellipse cx="20" cy="28" rx="7" ry="5.5" fill="#FFF4E0"/><circle cx="15.5" cy="20" r="1.9" fill="${eye}"/><circle cx="24.5" cy="20" r="1.9" fill="${eye}"/><ellipse cx="20" cy="25.5" rx="2.6" ry="1.9" fill="${C.ink}"/></svg>`;
}

function routeSvg(route, w = 326, h = 130, color = C.berry) {
  const pts = (route || []).filter((p) => Array.isArray(p) && p.length >= 2);
  if (pts.length < 2) {
    return `<svg class="route-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="No route recorded"><rect width="${w}" height="${h}" fill="#EEF1EC"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="13" fill="${C.muted}">No route recorded</text></svg>`;
  }
  const lat0 = pts[0][1] * Math.PI / 180, kx = Math.cos(lat0);
  const xs = pts.map((p) => p[0] * kx), ys = pts.map((p) => -p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 16, sw = Math.max(maxX - minX, 1e-6), sh = Math.max(maxY - minY, 1e-6);
  const sc = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * sc) / 2, oy = (h - sh * sc) / 2;
  const P = xs.map((x, i) => [(x - minX) * sc + ox, (ys[i] - minY) * sc + oy]);
  const d = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const s = P[0], e = P[P.length - 1];
  return `<svg class="route-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Map of the walk route"><rect width="${w}" height="${h}" fill="#EEF1EC"/><path d="M0 ${h * 0.3}H${w}M0 ${h * 0.72}H${w}M${w * 0.25} 0V${h}M${w * 0.7} 0V${h}" stroke="#FFFFFF" stroke-width="6"/><path d="${d}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="6" fill="${C.butter}" stroke="${C.ink}" stroke-width="2.5"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
}

function nav(active) {
  const tab = (key, href, label) => `<a class="tab${active === key ? ' on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${ICON[key]}${label}</a>`;
  return `<nav class="nav" aria-label="Main"><svg class="bar" viewBox="0 0 366 88" preserveAspectRatio="none" aria-hidden="true"><path d="M34 22 H121 C142 22 150 0 183 0 C216 0 224 22 245 22 H332 A33 33 0 0 1 332 88 H34 A33 33 0 0 1 34 22 Z" fill="#FFFFFF"/></svg><div class="tabs">${tab('home', '#/home', 'Home')}${tab('walks', '#/walks', 'Walks')}<a class="paw" href="#/record" aria-label="Start a walk">${ICON.paw(34)}</a>${tab('friends', '#/friends', 'Friends')}${tab('packs', '#/packs', 'Packs')}</div></nav>`;
}

// ------------------------------------------------------------- maps (free: MapLibre + OpenFreeMap)

let mapLibPromise = null;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!mapLibPromise) {
    mapLibPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = MAPLIBRE_CSS; document.head.appendChild(link);
      const s = document.createElement('script'); s.src = MAPLIBRE_JS; s.async = true;
      s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error('map failed')));
      s.onerror = () => reject(new Error('map failed'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('map timeout')), 15000);
    }).catch((e) => { mapLibPromise = null; throw e; });
  }
  return mapLibPromise;
}
function destroyMaps() { S.maps.forEach((m) => { try { m.remove(); } catch (e) { /* ignore */ } }); S.maps = []; recMap = null; }

async function makeMap(el, { center, zoom = 15, interactive = true }) {
  const ml = await loadMapLib();
  if (!el.isConnected) return null;
  const map = new ml.Map({ container: el, style: MAP_STYLE, center, zoom, interactive, attributionControl: { compact: true } });
  S.maps.push(map);
  await new Promise((r) => { if (map.loaded()) r(); else map.once('load', r); });
  map.addSource('route', { type: 'geojson', data: lineGeo([]) });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#FFFFFF', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': C.berry, 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addSource('me', { type: 'geojson', data: pointGeo(null) });
  map.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 16, 'circle-color': C.berry, 'circle-opacity': 0.18 } });
  map.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 7, 'circle-color': C.berry, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
  return map;
}
const lineGeo = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.map((p) => [p[0], p[1]]) }, properties: {} });
const pointGeo = (p) => ({ type: 'FeatureCollection', features: p ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [p[0], p[1]] }, properties: {} }] : [] });
function fitRoute(map, route) {
  if (!map || route.length < 2) return;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  route.forEach((p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
  map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 0, maxZoom: 17 });
}

// ------------------------------------------------------------- data

async function loadFriends() {
  const ids = await S.api.friendIds();
  const ps = await S.api.profilesByIds(ids);
  S.friends = ps.sort((a, b) => a.display_name.localeCompare(b.display_name));
  ps.forEach((p) => { S.profiles[p.id] = p; });
}

// ------------------------------------------------------------- routing

window.addEventListener('hashchange', () => render());
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && S.A[el.dataset.act]) { e.preventDefault(); S.A[el.dataset.act](el, e); }
});
$sheet.addEventListener('click', (e) => {
  if (e.target.classList.contains('sheet-backdrop')) { closeSheet(); return; }
  const el = e.target.closest('[data-act]');
  if (el && S.A[el.dataset.act]) { e.preventDefault(); S.A[el.dataset.act](el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && S.A[f.dataset.form]) { e.preventDefault(); S.A[f.dataset.form](f, e); }
});

function paint(html) {
  $app.innerHTML = html;
  // Only jump to the top when moving to a different screen, not on a refresh.
  if (S.lastHash !== location.hash) { window.scrollTo(0, 0); S.lastHash = location.hash; }
}
function closeSheet() { $sheet.innerHTML = ''; }

async function render() {
  const id = ++S.renderId;
  clearTimers();
  destroyMaps();
  closeSheet();
  S.A = {};
  const stale = () => id !== S.renderId;

  if (!S.api) return setupScreen();
  if (!S.api.uid()) return authScreen();
  if (!S.me) {
    try { S.me = await S.api.getProfile(S.api.uid()); } catch (e) { return errorScreen(e); }
    if (stale()) return;
    if (!S.me) return onboardingScreen();
    S.profiles[S.me.id] = S.me;
  }

  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  // An unfinished walk always comes first.
  if (S.rec && name !== 'record') { location.hash = '#/record'; return; }
  const screens = { home: homeScreen, walks: walksScreen, walk: walkScreen, friends: friendsScreen, friend: friendScreen, packs: packsScreen, me: meScreen, record: recordScreen };
  const fn = screens[name] || homeScreen;
  try { await fn(arg, stale); } catch (e) { if (!stale()) errorScreen(e); }
}

function errorScreen(e) {
  paint(`<main class="screen no-nav"><div class="card stack center"><div class="title-sm">Something went sideways</div><p class="sub">${esc(e && e.message)}</p><button class="btn" data-act="retry">Try again</button></div></main>`);
  S.A.retry = () => render();
}

// ------------------------------------------------------------- setup / auth / onboarding

function setupScreen() {
  paint(`<main class="screen no-nav" style="justify-content:center">
    <div class="center"><div class="big" style="font-size:54px;color:${C.berry}">waggly</div><p class="sub">Walk your dog with your friends, even when they're far away.</p></div>
    <div class="card stack"><div class="title-sm">Not connected yet</div>
    <p class="sub">Waggly's account system isn't hooked up yet. You can explore everything in demo mode with a pretend friend, Tonya.</p>
    <a class="btn block" href="?demo=1">Try the demo</a></div></main>`);
}

function authScreen() {
  let mode = 'signup';
  const draw = (msg = '', isErr = true) => {
    paint(`<main class="screen no-nav" style="justify-content:center">
      <div class="center stack" style="align-items:center">${dogFace('waggly', 88)}<div class="big" style="font-size:54px;color:${C.berry};line-height:1">waggly</div>
      <p class="sub">Walk your dog with your friends, even when they're far away.</p></div>
      <form class="card stack" data-form="auth" novalidate>
        <div class="title-sm">${mode === 'signup' ? 'Create your account' : 'Welcome back'}</div>
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="pw" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required>${mode === 'signup' ? '<span class="hint">At least 6 characters.</span>' : ''}</div>
        ${msg ? `<p class="${isErr ? 'error' : 'sub'}" role="alert">${esc(msg)}</p>` : ''}
        <button class="btn block big" type="submit">${mode === 'signup' ? 'Sign up' : 'Log in'}</button>
        <button class="btn block ghost" type="button" data-act="flip">${mode === 'signup' ? 'I already have an account' : 'I’m new here'}</button>
      </form>
      ${S.api.mode === 'demo' ? '<p class="hint center">Demo mode: any email and password work.</p>' : ''}</main>`);
  };
  S.A.flip = () => { mode = mode === 'signup' ? 'login' : 'signup'; draw(); };
  S.A.auth = async (f) => {
    const email = f.email.value.trim(), pw = f.pw.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return draw('Please enter a valid email.');
    if (pw.length < 6) return draw('Your password needs at least 6 characters.');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'One sec…';
    try {
      if (mode === 'signup') {
        const r = await S.api.signUp(email, pw);
        if (r.needsConfirm) { mode = 'login'; return draw('Almost there! We emailed you a confirmation link. Tap it, then come back here and log in.', false); }
      } else {
        await S.api.signIn(email, pw);
      }
      S.me = null;
      render();
    } catch (e) { draw(e.message); }
  };
  draw();
}

function onboardingScreen() {
  const draw = (vals = {}, msg = '') => {
    paint(`<main class="screen no-nav">
      <div class="stack" style="align-items:center;text-align:center">${dogFace(vals.dog_name || 'new', 96, C.peach)}
      <h1 class="title">Let's meet your pup!</h1><p class="sub">This is how your friends will see you on Waggly.</p></div>
      <form class="card stack" data-form="onboard" novalidate>
        <div class="field"><label for="display_name">Your first name</label><input class="input" id="display_name" name="display_name" maxlength="40" autocomplete="given-name" value="${esc(vals.display_name)}" required></div>
        <div class="field"><label for="username">Pick a username</label><input class="input" id="username" name="username" maxlength="20" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(vals.username)}" required><span class="hint">Friends add you with this. Lowercase letters, numbers, dots or underscores.</span></div>
        <div class="field"><label for="dog_name">Your dog's name</label><input class="input" id="dog_name" name="dog_name" maxlength="40" value="${esc(vals.dog_name)}" required><span class="hint">Two dogs? Write "Frank &amp; Beans".</span></div>
        <div class="field"><label for="dog_breed">Breed (optional)</label><input class="input" id="dog_breed" name="dog_breed" maxlength="40" value="${esc(vals.dog_breed)}"></div>
        <div class="field"><label for="city">City (optional)</label><input class="input" id="city" name="city" maxlength="40" placeholder="Atlanta, GA" value="${esc(vals.city)}"></div>
        ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
        <button class="btn block big" type="submit">Let's go!</button>
      </form>
      <button class="btn ghost block" data-act="signout">Sign out</button></main>`);
  };
  S.A.onboard = async (f) => {
    const vals = Object.fromEntries(new FormData(f).entries());
    Object.keys(vals).forEach((k) => { vals[k] = String(vals[k]).trim(); });
    vals.username = vals.username.toLowerCase().replace(/^@/, '');
    if (!vals.display_name) return draw(vals, 'Please add your first name.');
    if (!/^[a-z0-9_.]{3,20}$/.test(vals.username)) return draw(vals, 'Usernames are 3–20 characters: lowercase letters, numbers, dots or underscores.');
    if (!vals.dog_name) return draw(vals, 'What’s your dog’s name?');
    try { S.me = await S.api.createProfile(vals); S.profiles[S.me.id] = S.me; location.hash = '#/home'; render(); }
    catch (e) { draw(vals, e.message); }
  };
  S.A.signout = signOut;
  draw();
}

async function signOut() {
  if (S.rec) { toast('Finish or discard your walk first.'); return; }
  await S.api.signOut();
  S.me = null; S.friends = []; S.profiles = {};
  location.hash = '#/home';
  render();
}

// ------------------------------------------------------------- home

async function homeScreen(_arg, stale) {
  await loadFriends();
  const fids = S.friends.map((f) => f.id);
  const since = new Date(Math.min(startOfMonth().getTime(), Date.now() - 62 * 86400000)).toISOString();
  const [walks, live] = await Promise.all([S.api.walks({ userIds: [S.me.id, ...fids], since, limit: 500 }), S.api.liveWalks(fids)]);
  if (stale()) return;

  const mine = walks.filter((w) => w.user_id === S.me.id);
  const monthStart = startOfMonth().getTime();
  const days = new Set(mine.map((w) => dayKey(w.started_at)));
  let streak = 0; const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dots = Array.from({ length: dim }, (_, i) => {
    const k = dayKey(new Date(now.getFullYear(), now.getMonth(), i + 1));
    return `<span class="dot${days.has(k) ? ' on' : ''}${i + 1 === now.getDate() ? ' today' : ''}"></span>`;
  }).join('');
  const monthMine = mine.filter((w) => Date.parse(w.started_at) >= monthStart);
  const walkedDays = new Set(monthMine.map((w) => dayKey(w.started_at))).size;
  const myMiles = monthMine.reduce((s, w) => s + w.distance_m, 0);

  const races = S.friends.map((f) => {
    const theirs = walks.filter((w) => w.user_id === f.id && Date.parse(w.started_at) >= monthStart).reduce((s, w) => s + w.distance_m, 0);
    const total = myMiles + theirs;
    const pct = total ? Math.round((myMiles / total) * 100) : 50;
    const diff = miles(Math.abs(myMiles - theirs));
    let line;
    if (!total) line = 'Fresh month! The first walk takes the lead.';
    else if (diff < 0.05) line = 'Dead even! One walk could settle it.';
    else if (myMiles > theirs) line = `You're ahead by ${diff.toFixed(1)} mi. Keep it up!`;
    else line = `${diff.toFixed(1)} mi behind. Time for a long walk?`;
    return { f, theirs, pct, line, gap: Math.abs(myMiles - theirs) };
  }).sort((a, b) => a.gap - b.gap);
  if (S.raceIdx >= races.length) S.raceIdx = 0;
  const bg = [C.peach, C.sky, C.butter, C.lavender, C.pistachio];

  const raceHtml = races.length ? (() => {
    const r = races[S.raceIdx];
    return `<div class="card color stack" style="background:${bg[S.raceIdx % bg.length]}">
      <div class="row between"><span class="chip" style="background:${C.ink};color:#fff;font-size:12px">You vs. ${esc(r.f.display_name)}</span><span style="font-size:13px;font-weight:800">${daysLeft()} days left</span></div>
      <div class="big" style="font-size:26px;line-height:1.05">${esc(monthName())} Showdown</div>
      <div class="stack" style="gap:6px"><div class="row between" style="font-size:14px;font-weight:900"><span>You: ${fmtMi(myMiles)} mi</span><span>${esc(r.f.display_name)}: ${fmtMi(r.theirs)} mi</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%"></div></div></div>
      <div style="font-size:14px;font-weight:800">${esc(r.line)}</div></div>
      ${races.length > 1 ? `<div class="pager">${races.map((x, i) => `<button class="${i === S.raceIdx ? 'on' : ''}" data-act="race" data-i="${i}" aria-label="Show race with ${esc(x.f.display_name)}"><span></span></button>`).join('')}</div>` : ''}`;
  })() : `<a class="empty" href="#/friends" style="text-decoration:none">Add a friend to start a monthly showdown →</a>`;

  const liveHtml = live.map((w) => {
    const p = S.profiles[w.user_id] || {};
    return `<div class="card tight row">${dogFace(p.id, 52, C.peach)}<div class="grow"><div style="font-weight:900;font-size:15px">${esc(p.display_name)} is walking ${esc(w.dog_name || p.dog_name)} now</div><div class="sub" style="font-size:13px">${fmtMi(w.distance_m)} mi so far · started ${esc(timeAgo(w.started_at))}</div></div><button class="btn small" data-act="cheer" data-id="${esc(w.id)}">Cheer</button></div>`;
  }).join('');

  const installTip = !navigator.standalone && /iPhone|iPad/.test(navigator.userAgent) && !localStorage.getItem('waggly-hide-install')
    ? `<div class="card tight row" style="background:${C.butter}"><div class="grow" style="font-size:14px;font-weight:800">Tip: tap <b>Share</b> → <b>Add to Home Screen</b> to open Waggly like an app.</div><button class="icon-btn" style="width:40px;height:40px" data-act="hideInstall" aria-label="Dismiss tip">${ICON.close}</button></div>` : '';

  paint(`<main class="screen">
    <header class="row between"><div><div class="sub">${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))}</div><h1 class="title" style="font-size:30px">${greeting()}, ${esc(S.me.display_name)}!</h1></div>
    <a href="#/me" aria-label="Your profile" style="text-decoration:none">${dogFace(S.me.id, 56, C.peach)}</a></header>
    ${installTip}
    ${liveHtml ? `<section class="stack" aria-label="Friends walking now"><div class="label">Walking now</div>${liveHtml}</section>` : ''}
    <section class="card stack" aria-label="Your streak">
      <div class="row between" style="align-items:flex-end"><div><div class="label">Your ${esc(monthName())}</div><h2 class="title-sm" style="font-size:26px">${streak ? `${streak}-day streak` : 'Start a streak today!'}</h2></div><span class="sub" style="font-size:13px">${walkedDays} / ${dim} days</span></div>
      <div class="dots" aria-hidden="true">${dots}</div>
      <div class="row" style="gap:8px"><span class="chip">${monthMine.length} walks</span><span class="chip">${fmtMi(myMiles)} mi</span><span class="chip">≈ ${estSteps(myMiles)} steps</span></div>
    </section>
    <section class="stack" aria-label="Your races"><div class="row between" style="padding:0 4px"><h2 class="title-sm">Your races</h2>${races.length > 1 ? '<span class="sub" style="font-size:13px">Closest race first</span>' : ''}</div>${raceHtml}</section>
    <a class="banner" href="#/walks" style="background:${C.lavender}"><div class="grow"><div style="font-weight:900;font-size:16px">See everyone's walks</div><div class="sub" style="color:${C.ink}">Recent walks and paws from your friends</div></div>${ICON.chev}</a>
    </main>${nav('home')}`);

  S.A.race = (el) => { S.raceIdx = +el.dataset.i; render(); };
  S.A.cheer = (el) => openCheerSheet(live.find((w) => w.id === el.dataset.id));
  S.A.hideInstall = () => { localStorage.setItem('waggly-hide-install', '1'); render(); };
  every(30000, () => { if (!$sheet.innerHTML) render(); });
}

function openCheerSheet(walk) {
  if (!walk) return;
  const p = S.profiles[walk.user_id] || {};
  const dog = walk.dog_name || p.dog_name || 'the pup';
  const myDog = S.me.dog_name || 'My pup';
  const sweet = ['Have a great walk!', 'You got this!', `Scratch ${dog} for me`];
  const spicy = ['I’ll catch up later', 'Enjoy the lead while it lasts', `${myDog}’s stretching already`];
  const btns = (list, colors) => list.map((m, i) => `<button class="btn" style="background:${colors[i % colors.length]}" data-act="sendCheer" data-msg="${esc(m)}">${esc(m)}</button>`).join('');
  $sheet.innerHTML = `<div class="sheet-backdrop"><section class="sheet" role="dialog" aria-label="Cheer ${esc(p.display_name)} on">
    <span class="grab" aria-hidden="true"></span>
    <div class="row">${dogFace(p.id, 64, C.peach)}<div class="grow"><h2 class="title-sm">Cheer ${esc(p.display_name)} on!</h2><div class="sub">${esc(dog)} · ${fmtMi(walk.distance_m)} mi so far</div></div><button class="icon-btn" data-act="closeSheet" aria-label="Close">${ICON.close}</button></div>
    <div class="label">Sweet</div><div class="row wrap" style="gap:8px">${btns(sweet, [C.butter, C.sky, C.lavender])}</div>
    <div class="label">Spicy</div><div class="row wrap" style="gap:8px">${btns(spicy, [C.peach, C.butter, C.pistachio])}</div>
  </section></div>`;
  S.A.closeSheet = closeSheet;
  S.A.sendCheer = async (el) => {
    el.disabled = true;
    try { await S.api.sendCheer(walk.id, el.dataset.msg); closeSheet(); toast(`Sent! ${p.display_name} will see it on their walk.`); }
    catch (e) { el.disabled = false; toast(e.message); }
  };
}

// ------------------------------------------------------------- walks feed & detail

function walkCard(w, paws) {
  const p = S.profiles[w.user_id] || {};
  const who = w.user_id === S.me.id ? `You walked ${w.dog_name || p.dog_name}` : `${p.display_name} walked ${w.dog_name || p.dog_name}`;
  const pw = paws[w.id] || { count: 0, mine: false };
  return `<article class="feed-card"><a href="#/walk/${esc(w.id)}" style="color:inherit;text-decoration:none;display:block">
    <div class="head row">${dogFace(w.user_id, 44)}<div class="grow"><div style="font-weight:900;font-size:15px">${esc(who)}</div><div class="sub" style="font-size:13px">${esc(timeAgo(w.started_at))}</div></div></div>
    <div class="body"><div class="big" style="font-size:20px">${esc(w.title || defaultTitle(new Date(w.started_at)))}</div>
    <div class="row wrap" style="gap:6px"><span class="chip" style="background:${C.sky}">${fmtMi(w.distance_m)} mi</span><span class="chip" style="background:${C.lavender}">${fmtDurWords(w.duration_s)}</span><span class="chip" style="background:${C.butter}">≈ ${estSteps(w.distance_m)} steps</span></div>
    ${routeSvg(w.route)}</div></a>
    <div class="row" style="padding:0 16px 16px"><button class="btn small ${pw.mine ? '' : 'soft'}" data-act="paw" data-id="${esc(w.id)}" data-on="${pw.mine ? 1 : 0}" aria-pressed="${pw.mine}">${ICON.paw(16, pw.mine ? C.ink : C.peachDeep)} ${pw.count} ${pw.count === 1 ? 'paw' : 'paws'}</button></div>
  </article>`;
}

async function pawAction(el, after) {
  el.disabled = true;
  try { await S.api.setPaw(el.dataset.id, el.dataset.on !== '1'); after(); }
  catch (e) { el.disabled = false; toast(e.message); }
}

async function walksScreen(_arg, stale) {
  await loadFriends();
  const ids = [S.me.id, ...S.friends.map((f) => f.id)];
  const walks = await S.api.walks({ userIds: ids, since: new Date(Date.now() - 45 * 86400000).toISOString(), limit: 60 });
  const paws = await S.api.paws(walks.map((w) => w.id));
  if (stale()) return;
  paint(`<main class="screen"><header><h1 class="title">Walks</h1><p class="sub">Your friends' latest walks, and yours</p></header>
    ${walks.length ? walks.map((w) => walkCard(w, paws)).join('') : `<div class="empty">No walks yet. Tap the paw to start one${S.friends.length ? '' : ', and add a friend to see theirs here'}!</div>`}
    </main>${nav('walks')}`);
  S.A.paw = (el) => pawAction(el, () => render());
}

async function walkScreen(id, stale) {
  const w = await S.api.getWalk(id);
  if (stale()) return;
  if (!w) { paint(`<main class="screen no-nav"><a class="icon-btn" href="#/walks" aria-label="Back">${ICON.back}</a><div class="empty">This walk isn't available.</div></main>`); return; }
  if (!S.profiles[w.user_id]) { const p = await S.api.getProfile(w.user_id); if (p) S.profiles[p.id] = p; }
  const mine = w.user_id === S.me.id;
  const [paws, cheers] = await Promise.all([S.api.paws([w.id]), mine ? S.api.cheers(w.id) : Promise.resolve([])]);
  if (stale()) return;
  const missing = cheers.map((c) => c.from_user).filter((u) => !S.profiles[u]);
  if (missing.length) (await S.api.profilesByIds([...new Set(missing)])).forEach((p) => { S.profiles[p.id] = p; });
  const p = S.profiles[w.user_id] || {};
  const pw = paws[w.id];
  paint(`<main class="screen no-nav">
    <div class="row between"><a class="icon-btn" href="#/walks" aria-label="Back to walks">${ICON.back}</a>${w.status === 'live' ? '<span class="live-pill"><span class="pulse"></span>Walking now</span>' : ''}</div>
    <div class="map" id="walk-map">${routeSvg(w.route, 360, 240)}</div>
    <section class="card stack" style="background:${C.butter}"><div class="row">${dogFace(w.user_id, 64)}<div class="grow"><div class="sub" style="color:${C.ink}">${esc(new Date(w.started_at).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }))}</div>
      <h1 class="big" style="font-size:26px;line-height:1.05">${esc(w.title || defaultTitle(new Date(w.started_at)))}</h1><div style="font-weight:800">${esc(mine ? 'You' : p.display_name)} + ${esc(w.dog_name || p.dog_name)}</div></div></div></section>
    <div class="stat-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="stat" style="background:${C.sky}"><div class="label" style="color:${C.ink}">Distance</div><div class="big">${fmtMi(w.distance_m)} mi</div></div>
      <div class="stat" style="background:${C.lavender}"><div class="label" style="color:${C.ink}">Time</div><div class="big">${fmtDur(w.duration_s)}</div></div>
      <div class="stat" style="background:${C.pistachio}"><div class="label" style="color:${C.ink}">Pace /mi</div><div class="big">${fmtPace(w.distance_m, w.duration_s)}</div></div>
      <div class="stat" style="background:${C.peach}"><div class="label" style="color:${C.ink}">Steps (est.)</div><div class="big">${estSteps(w.distance_m)}</div></div>
    </div>
    <button class="btn ${pw.mine ? '' : 'white'}" data-act="paw" data-id="${esc(w.id)}" data-on="${pw.mine ? 1 : 0}" aria-pressed="${pw.mine}">${ICON.paw(18, pw.mine ? C.ink : C.peachDeep)} ${pw.mine ? 'You gave a paw' : 'Give a paw'} · ${pw.count}</button>
    ${mine && cheers.length ? `<section class="card stack"><h2 class="title-sm">Cheers on this walk</h2>${cheers.map((c) => `<div class="row">${dogFace(c.from_user, 36)}<div class="grow"><b>${esc(nameOf(c.from_user))}:</b> ${esc(c.message)}</div></div>`).join('')}</section>` : ''}
    ${mine && w.status === 'done' ? `<button class="btn danger" data-act="del">Delete this walk</button>` : ''}
  </main>`);
  S.A.paw = (el) => pawAction(el, () => render());
  S.A.del = async (el) => {
    if (!confirm('Delete this walk? This can’t be undone.')) return;
    el.disabled = true;
    try { await S.api.deleteWalk(w.id); toast('Walk deleted'); location.hash = '#/walks'; } catch (e) { el.disabled = false; toast(e.message); }
  };
  const route = w.route || [];
  if (route.length >= 2) {
    const el = document.getElementById('walk-map');
    makeMap(el, { center: route[0], interactive: true }).then((map) => {
      if (!map) return;
      [...el.children].forEach((c) => { if (c.classList.contains('route-svg')) c.remove(); });
      map.getSource('route').setData(lineGeo(route));
      map.getSource('me').setData(pointGeo(route[route.length - 1]));
      fitRoute(map, route);
    }).catch(() => { /* keep the drawn route if the map can't load */ });
  }
}

// ------------------------------------------------------------- friends

async function friendsScreen(_arg, stale) {
  await loadFriends();
  const live = await S.api.liveWalks(S.friends.map((f) => f.id));
  if (stale()) return;
  const draw = (msg = '', isErr = true) => {
    paint(`<main class="screen"><header class="row between"><h1 class="title">Friends</h1></header>
      <form class="card stack" data-form="add" novalidate><h2 class="title-sm">Add a friend</h2>
        <div class="field"><label for="friend-username">Their Waggly username</label><input class="input" id="friend-username" name="u" placeholder="e.g. tonya" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
        ${msg ? `<p class="${isErr ? 'error' : 'sub'}" role="alert">${esc(msg)}</p>` : ''}
        <button class="btn block" type="submit">Add friend</button>
        <div class="row between"><span class="hint">Your username: <b>@${esc(S.me.username)}</b></span><button class="btn small soft" type="button" data-act="copy">Copy</button></div>
        ${S.api.mode === 'demo' ? '<span class="hint">Demo: try adding <b>tonya</b>, <b>bianca</b> or <b>stef</b>.</span>' : ''}
      </form>
      ${live.length ? `<section class="card stack"><h2 style="font-size:17px;font-weight:900;display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:5px;background:${C.peachDeep}"></span>Walking now</h2><p class="sub" style="margin:0">Tap to cheer them on.</p>
        <div class="row wrap" style="gap:18px">${live.map((w) => { const p = S.profiles[w.user_id] || {}; return `<button data-act="cheer" data-id="${esc(w.id)}" style="border:none;background:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:6px;color:${C.ink}">${dogFace(p.id, 64, C.peach)}<span style="font-weight:900">${esc(p.display_name)}</span><span class="hint">${fmtMi(w.distance_m)} mi</span></button>`; }).join('')}</div></section>` : ''}
      <section class="card"><h2 style="font-size:17px;font-weight:900">Your friends · ${S.friends.length}</h2>
        ${S.friends.length ? S.friends.map((f) => `<a class="list-row" href="#/friend/${esc(f.id)}">${dogFace(f.id, 48)}<div class="grow"><div style="font-weight:900">${esc(f.display_name)} <span class="hint">@${esc(f.username)}</span></div><div class="sub" style="font-size:13px">${esc([f.dog_name, f.city].filter(Boolean).join(' · '))}</div></div>${ICON.chev}</a>`).join('') : '<p class="sub">No friends yet. Add one above with their username!</p>'}
      </section></main>${nav('friends')}`);
  };
  S.A.add = async (f) => {
    const u = f.u.value.trim().toLowerCase().replace(/^@/, '');
    if (!u) return draw('Type your friend’s username first.');
    if (u === S.me.username) return draw('That’s you! Try your friend’s username.');
    try {
      const p = await S.api.findByUsername(u);
      if (!p) return draw(`No one called @${u} yet. Double-check the spelling with them.`);
      if (S.friends.some((x) => x.id === p.id)) return draw(`You and ${p.display_name} are already friends.`);
      await S.api.addFriend(p.id);
      toast(`You and ${p.display_name} are now friends!`);
      render();
    } catch (e) { draw(e.message); }
  };
  S.A.copy = async () => { try { await navigator.clipboard.writeText(S.me.username); toast('Username copied!'); } catch (e) { toast(`Your username is @${S.me.username}`); } };
  S.A.cheer = (el) => openCheerSheet(live.find((w) => w.id === el.dataset.id));
  draw();
}

async function friendScreen(id, stale) {
  let p = S.profiles[id] || await S.api.getProfile(id);
  if (stale()) return;
  if (!p) { location.hash = '#/friends'; return; }
  S.profiles[p.id] = p;
  const walks = await S.api.walks({ userIds: [id], since: new Date(Date.now() - 60 * 86400000).toISOString(), limit: 40 });
  if (stale()) return;
  const month = walks.filter((w) => Date.parse(w.started_at) >= startOfMonth().getTime());
  const isFriend = S.friends.some((f) => f.id === id);
  paint(`<main class="screen no-nav"><a class="icon-btn" href="#/friends" aria-label="Back to friends">${ICON.back}</a>
    <section class="stack center" style="align-items:center">${dogFace(p.id, 104, '#FFFFFF')}<h1 class="title">${esc(p.display_name)}</h1><div class="sub">@${esc(p.username)}${p.city ? ' · ' + esc(p.city) : ''}</div><div style="font-weight:800">Walks ${esc(p.dog_name)}${p.dog_breed ? ` (${esc(p.dog_breed)})` : ''}</div></section>
    <section class="card stack"><h2 style="font-size:17px;font-weight:900">This month</h2><div class="stat-grid">
      <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${month.length}</div><div class="label">Walks</div></div>
      <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${fmtMi(month.reduce((s, w) => s + w.distance_m, 0))}</div><div class="label">Miles</div></div>
      <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${new Set(month.map((w) => dayKey(w.started_at))).size}</div><div class="label">Days</div></div></div></section>
    <section class="card"><h2 style="font-size:17px;font-weight:900">Recent walks</h2>${walks.length ? walks.slice(0, 15).map((w) => `<a class="list-row" href="#/walk/${esc(w.id)}"><div style="width:64px;flex:none">${routeSvg(w.route, 64, 64)}</div><div class="grow"><div style="font-weight:900">${esc(w.title || defaultTitle(new Date(w.started_at)))}</div><div class="sub" style="font-size:13px">${fmtMi(w.distance_m)} mi · ${fmtDurWords(w.duration_s)}</div></div><span class="hint">${esc(timeAgo(w.started_at))}</span></a>`).join('') : '<p class="sub">No walks yet.</p>'}</section>
    ${isFriend ? `<button class="btn danger" data-act="unfriend">Remove ${esc(p.display_name)} as a friend</button>` : ''}
  </main>`);
  S.A.unfriend = async (el) => {
    if (!confirm(`Remove ${p.display_name} as a friend? You’ll stop seeing each other’s walks.`)) return;
    el.disabled = true;
    try { await S.api.removeFriend(id); toast('Friend removed'); location.hash = '#/friends'; } catch (e) { el.disabled = false; toast(e.message); }
  };
}

// ------------------------------------------------------------- packs & me

async function packsScreen() {
  paint(`<main class="screen"><h1 class="title">Packs</h1>
    <div class="card stack center" style="align-items:center;background:${C.lavender}">${dogFace('packs', 80, '#FFFFFF')}<h2 class="title-sm">Packs are coming soon!</h2>
    <p class="sub" style="color:${C.ink}">Breed packs, city packs and monthly awards arrive in a later version. For now, challenge friends head-to-head in your monthly showdown on Home.</p>
    <a class="btn dark" href="#/friends">Add friends</a></div></main>${nav('packs')}`);
}

async function meScreen(_arg, stale) {
  const walks = await S.api.walks({ userIds: [S.me.id], since: new Date(Date.now() - 90 * 86400000).toISOString(), limit: 60 });
  if (stale()) return;
  const month = walks.filter((w) => Date.parse(w.started_at) >= startOfMonth().getTime());
  const draw = (msg = '') => {
    const m = S.me;
    paint(`<main class="screen no-nav"><a class="icon-btn" href="#/home" aria-label="Back to home">${ICON.back}</a>
      <section class="stack center" style="align-items:center">${dogFace(m.id, 104, C.peach)}<h1 class="title">${esc(m.display_name)} &amp; ${esc(m.dog_name)}</h1><div class="sub">@${esc(m.username)}${m.city ? ' · ' + esc(m.city) : ''}</div></section>
      <section class="card stack"><h2 style="font-size:17px;font-weight:900">This month</h2><div class="stat-grid">
        <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${month.length}</div><div class="label">Walks</div></div>
        <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${fmtMi(month.reduce((s, w) => s + w.distance_m, 0))}</div><div class="label">Miles</div></div>
        <div class="center"><div class="big" style="font-size:26px;color:${C.berry}">${new Set(month.map((w) => dayKey(w.started_at))).size}</div><div class="label">Days</div></div></div></section>
      <form class="card stack" data-form="save"><h2 class="title-sm">You &amp; your pup</h2>
        <div class="field"><label for="display_name">Your first name</label><input class="input" id="display_name" name="display_name" maxlength="40" value="${esc(m.display_name)}"></div>
        <div class="field"><label for="dog_name">Dog's name</label><input class="input" id="dog_name" name="dog_name" maxlength="40" value="${esc(m.dog_name)}"></div>
        <div class="field"><label for="dog_breed">Breed</label><input class="input" id="dog_breed" name="dog_breed" maxlength="40" value="${esc(m.dog_breed)}"></div>
        <div class="field"><label for="city">City</label><input class="input" id="city" name="city" maxlength="40" value="${esc(m.city)}"></div>
        ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
        <button class="btn block" type="submit">Save changes</button><span class="hint">Photo uploads are coming in a later version.</span></form>
      <section class="card"><h2 style="font-size:17px;font-weight:900">My recent walks</h2>${walks.length ? walks.slice(0, 20).map((w) => `<a class="list-row" href="#/walk/${esc(w.id)}"><div style="width:64px;flex:none">${routeSvg(w.route, 64, 64)}</div><div class="grow"><div style="font-weight:900">${esc(w.title || defaultTitle(new Date(w.started_at)))}</div><div class="sub" style="font-size:13px">${fmtMi(w.distance_m)} mi · ${fmtDurWords(w.duration_s)}</div></div><span class="hint">${esc(timeAgo(w.started_at))}</span></a>`).join('') : '<p class="sub">No walks yet.</p>'}</section>
      <div class="hint center">${esc(S.api.email())}</div>
      <button class="btn ghost" data-act="signout">Sign out</button>
      ${S.api.mode === 'demo' ? '<button class="btn danger" data-act="resetDemo">Reset demo data</button>' : ''}
    </main>`);
  };
  S.A.save = async (f) => {
    const vals = Object.fromEntries(new FormData(f).entries());
    Object.keys(vals).forEach((k) => { vals[k] = String(vals[k]).trim(); });
    if (!vals.display_name || !vals.dog_name) return draw('Your name and your dog’s name can’t be empty.');
    try { S.me = await S.api.updateProfile(vals); S.profiles[S.me.id] = S.me; toast('Saved!'); draw(); } catch (e) { draw(e.message); }
  };
  S.A.signout = signOut;
  S.A.resetDemo = () => { if (!confirm('Reset all demo data?')) return; S.api.reset(); localStorage.removeItem(REC_KEY); location.reload(); };
  draw();
}

// ------------------------------------------------------------- recording

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseAwake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.rec && S.rec.state === 'running') { keepAwake(); syncWalk(); }
  if (document.visibilityState === 'hidden' && S.rec) saveRec();
});

const saveRec = () => { if (S.rec) { const { watchId, ...rest } = S.rec; try { localStorage.setItem(REC_KEY, JSON.stringify(rest)); } catch (e) { /* ignore */ } } };
const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) { return null; } };
const clearRec = () => { stopWatch(); releaseAwake(); S.rec = null; localStorage.removeItem(REC_KEY); };
const elapsed = (r) => Math.max(0, ((r.endedAt || Date.now()) - r.startedAt - r.pausedTotal - (r.state === 'paused' && r.pausedAt ? Date.now() - r.pausedAt : 0)) / 1000);
function thinRoute(points) {
  let pts = points.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]);
  if (pts.length > 1500) { const k = Math.ceil(pts.length / 1500); pts = pts.filter((_, i) => i % k === 0 || i === pts.length - 1); }
  return pts;
}

function startWatch() {
  if (!S.rec || S.rec.watchId != null) return;
  if (!navigator.geolocation) { setGps('This phone can’t share its location with Waggly.'); return; }
  S.rec.watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
}
function stopWatch() { if (S.rec && S.rec.watchId != null) { navigator.geolocation.clearWatch(S.rec.watchId); S.rec.watchId = null; } }

function onPos(pos) {
  const r = S.rec; if (!r) return;
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  const t = pos.timestamp || Date.now();
  r.lastFix = [lng, lat, accuracy];
  setGps(accuracy > 40 ? 'Weak GPS signal. Hang tight…' : '');
  updateRecMap();
  if (r.state !== 'running' || accuracy > 40) return;
  const last = r.points[r.points.length - 1];
  if (!last || r.resumeGap) {
    r.points.push([lng, lat, t]); r.resumeGap = false; saveRec(); updateRecMap(); return;
  }
  const d = hav(last, [lng, lat]);
  const dt = Math.max(0.5, (t - last[2]) / 1000);
  if (d < Math.max(5, accuracy * 0.4)) return; // too small to be real movement
  if (d / dt > 7) return; // faster than any walk: a GPS jump
  r.distance += d;
  r.points.push([lng, lat, t]);
  saveRec();
  updateRecMap();
  updateRecStats();
}
function onPosErr(err) {
  if (err.code === 1) setGps('Location is off for Waggly. In Settings → Privacy → Location Services → Safari Websites, choose “While Using”, then reopen Waggly.');
  else setGps('Looking for GPS…');
}
function setGps(msg) { const el = document.getElementById('gps-msg'); if (el) { el.textContent = msg; el.hidden = !msg; } }

async function syncWalk(final = false) {
  const r = S.rec; if (!r || r.syncing) return;
  r.syncing = true;
  try {
    const fields = { distance_m: Math.round(r.distance), duration_s: Math.round(elapsed(r)), route: thinRoute(r.points), dog_name: r.dog };
    if (!r.walkId) { const w = await S.api.startWalk({ ...fields, started_at: new Date(r.startedAt).toISOString() }); if (S.rec === r) { r.walkId = w.id; saveRec(); } }
    else if (!final) await S.api.updateWalk(r.walkId, fields);
    r.lastSync = Date.now();
  } catch (e) { /* offline: try again on the next tick */ } finally { r.syncing = false; }
}

let recMap = null;
function updateRecMap() {
  const r = S.rec; if (!recMap || !r) return;
  try {
    recMap.getSource('route').setData(lineGeo(r.points));
    if (r.lastFix) { recMap.getSource('me').setData(pointGeo(r.lastFix)); recMap.easeTo({ center: [r.lastFix[0], r.lastFix[1]], duration: 600 }); }
  } catch (e) { /* map not ready */ }
}
function updateRecStats() {
  const r = S.rec; if (!r) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const t = elapsed(r);
  set('st-dist', fmtMi(r.distance)); set('st-time', fmtDur(t)); set('st-pace', fmtPace(r.distance, t));
}

async function recordScreen(_arg, stale) {
  if (!S.rec) {
    paint(`<main class="screen no-nav">
      <div class="row between"><a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a><span class="label">New walk</span><span style="width:48px"></span></div>
      <section class="stack center" style="align-items:center;padding-top:12px">${dogFace(S.me.id, 112, C.peach)}<h1 class="title">Ready, ${esc(S.me.dog_name)}?</h1><p class="sub">Your friends will see you're out walking so they can cheer you on.</p></section>
      <form class="card stack" data-form="go"><div class="field"><label for="dog">Walking with</label><input class="input" id="dog" name="dog" maxlength="40" value="${esc(S.me.dog_name)}"></div>
        <button class="btn block big" type="submit">${ICON.paw(24)} Start walk</button></form>
      <div class="card tight stack" style="background:${C.butter}"><div style="font-weight:900">For the best tracking</div>
        <div class="sub" style="color:${C.ink}">Keep Waggly open on screen while you walk (it keeps your screen awake). If your phone locks, tracking pauses and picks back up when you unlock it.</div></div>
    </main>`);
    S.A.go = async (f) => {
      S.rec = { startedAt: Date.now(), pausedTotal: 0, pausedAt: null, state: 'running', points: [], distance: 0, dog: f.dog.value.trim() || S.me.dog_name, walkId: null, watchId: null };
      saveRec();
      render();
      syncWalk();
    };
    return;
  }

  const r = S.rec;
  if (r.state === 'finished') return finishScreen();
  paint(`<main class="screen no-nav" style="gap:12px">
    <div class="row between"><span class="live-pill"><span class="pulse"></span><span id="pill-text">${r.state === 'paused' ? 'Paused' : 'Walking'}</span></span><span class="sub">with ${esc(r.dog)}</span></div>
    <div class="map tall" id="rec-map"><div class="center sub" style="padding-top:40%">Loading map…</div></div>
    <p id="gps-msg" class="card tight sub" style="background:${C.butter};color:${C.ink};margin:0" hidden></p>
    <div class="stat-grid">
      <div class="stat"><div class="label">Miles</div><div class="big" id="st-dist">${fmtMi(r.distance)}</div></div>
      <div class="stat"><div class="label">Time</div><div class="big" id="st-time">${fmtDur(elapsed(r))}</div></div>
      <div class="stat"><div class="label">Pace /mi</div><div class="big" id="st-pace">${fmtPace(r.distance, elapsed(r))}</div></div>
    </div>
    <section id="cheers" class="stack" aria-label="Cheers from friends"></section>
    <div class="row" style="justify-content:space-between;padding:6px 8px 0">
      <button class="btn ghost" data-act="discard" style="min-width:84px">Discard</button>
      <button data-act="toggle" aria-label="${r.state === 'paused' ? 'Resume walk' : 'Pause walk'}" style="width:84px;height:84px;border-radius:42px;border:4px solid #fff;background:${C.peach};color:${C.ink};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(232,131,106,0.4)">${r.state === 'paused' ? ICON.play : ICON.pause}</button>
      <button class="btn dark" data-act="end" style="min-width:84px">End</button>
    </div></main>`);

  S.A.toggle = () => {
    if (r.state === 'running') { r.state = 'paused'; r.pausedAt = Date.now(); }
    else { r.pausedTotal += Date.now() - (r.pausedAt || Date.now()); r.pausedAt = null; r.state = 'running'; r.resumeGap = true; }
    saveRec(); render();
  };
  S.A.end = () => {
    if (r.state === 'paused') { r.pausedTotal += Date.now() - (r.pausedAt || Date.now()); r.pausedAt = null; }
    r.state = 'finished'; r.endedAt = Date.now(); stopWatch(); releaseAwake(); saveRec(); render();
  };
  S.A.discard = discardWalk;

  startWatch();
  keepAwake();
  every(1000, updateRecStats);
  every(20000, () => syncWalk());
  const seen = new Set();
  const pollCheers = async () => {
    if (!r.walkId) return;
    try {
      const cs = await S.api.cheers(r.walkId);
      const fresh = cs.filter((c) => c.from_user !== S.me.id && !seen.has(c.id));
      const missing = fresh.map((c) => c.from_user).filter((u) => !S.profiles[u]);
      if (missing.length) (await S.api.profilesByIds([...new Set(missing)])).forEach((p) => { S.profiles[p.id] = p; });
      const box = document.getElementById('cheers');
      if (fresh.length && seen.size) toast(`${nameOf(fresh[fresh.length - 1].from_user)}: ${fresh[fresh.length - 1].message}`, 4000);
      fresh.forEach((c) => seen.add(c.id));
      const all = cs.filter((c) => c.from_user !== S.me.id).slice(-3);
      if (box) box.innerHTML = all.map((c) => `<div class="card tight row" style="background:${C.lavender}">${dogFace(c.from_user, 40)}<div class="grow"><b>${esc(nameOf(c.from_user))}</b> cheered: ${esc(c.message)}</div></div>`).join('');
    } catch (e) { /* offline */ }
  };
  pollCheers();
  every(10000, pollCheers);

  const el = document.getElementById('rec-map');
  const center = r.lastFix ? [r.lastFix[0], r.lastFix[1]] : (r.points[0] ? [r.points[0][0], r.points[0][1]] : [-84.39, 33.75]);
  makeMap(el, { center, zoom: r.lastFix || r.points.length ? 16 : 11 }).then((map) => {
    if (stale() || !map) return;
    [...el.children].forEach((c) => { if (!c.classList.contains('maplibregl-canvas-container') && !c.className.includes('maplibregl')) c.remove(); });
    recMap = map; updateRecMap();
  }).catch(() => { el.innerHTML = '<div class="center sub" style="padding-top:35%">Map unavailable right now, but your walk is still being tracked.</div>'; });
}

function finishScreen() {
  const r = S.rec;
  const t = elapsed(r);
  paint(`<main class="screen no-nav">
    <div class="center stack" style="align-items:center">${dogFace(S.me.id, 96, C.butter)}<h1 class="title">${esc(r.dog)} crushed it!</h1></div>
    <div>${routeSvg(r.points, 360, 180)}</div>
    <div class="stat-grid">
      <div class="stat" style="background:${C.sky}"><div class="label" style="color:${C.ink}">Miles</div><div class="big">${fmtMi(r.distance)}</div></div>
      <div class="stat" style="background:${C.lavender}"><div class="label" style="color:${C.ink}">Time</div><div class="big">${fmtDur(t)}</div></div>
      <div class="stat" style="background:${C.pistachio}"><div class="label" style="color:${C.ink}">Steps est.</div><div class="big">${estSteps(r.distance)}</div></div>
    </div>
    <form class="card stack" data-form="saveWalk"><div class="field"><label for="title">Name this walk</label><input class="input" id="title" name="title" maxlength="60" value="${esc(defaultTitle(new Date(r.startedAt)))}"></div>
      <button class="btn block big" type="submit">Save walk</button></form>
    <div class="row" style="gap:10px"><button class="btn ghost grow" data-act="resume">Keep walking</button><button class="btn danger grow" data-act="discard">Discard</button></div>
  </main>`);
  S.A.resume = () => { r.state = 'running'; r.resumeGap = true; r.pausedTotal += Date.now() - r.endedAt; r.endedAt = null; saveRec(); render(); };
  S.A.discard = discardWalk;
  S.A.saveWalk = async (f) => {
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
    const fields = { title: f.title.value.trim() || defaultTitle(new Date(r.startedAt)), dog_name: r.dog, status: 'done', ended_at: new Date(r.endedAt).toISOString(),
      distance_m: Math.round(r.distance), duration_s: Math.round(elapsed(r)), route: thinRoute(r.points) };
    try {
      let w;
      if (r.walkId) w = await S.api.updateWalk(r.walkId, fields);
      else w = await S.api.startWalk({ ...fields, started_at: new Date(r.startedAt).toISOString() });
      clearRec();
      toast('Walk saved! Nice work.');
      location.hash = `#/walk/${w.id}`;
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Save walk';
      toast('Couldn’t save just now. Check your connection and tap Save again.', 4000);
    }
  };
}

async function discardWalk() {
  if (!confirm('Discard this walk? It won’t be saved.')) return;
  const id = S.rec && S.rec.walkId;
  clearRec();
  if (id) { try { await S.api.deleteWalk(id); } catch (e) { /* ignore */ } }
  location.hash = '#/home';
  render();
}

// ------------------------------------------------------------- boot

async function cleanupStaleLiveWalks() {
  try {
    const live = await S.api.walks({ userIds: [S.me.id], status: 'live', limit: 20 });
    for (const w of live) {
      if (S.rec && w.id === S.rec.walkId) continue;
      if (w.distance_m > 20) await S.api.updateWalk(w.id, { status: 'done', ended_at: w.updated_at, title: w.title || defaultTitle(new Date(w.started_at)) });
      else await S.api.deleteWalk(w.id);
    }
  } catch (e) { /* not critical */ }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const wantDemo = params.has('demo') || (!SUPABASE_URL && localStorage.getItem('waggly-mode') === 'demo');
  try {
    if (wantDemo) { localStorage.setItem('waggly-mode', 'demo'); S.api = makeDemoApi(); }
    else if (SUPABASE_URL && SUPABASE_ANON_KEY) S.api = await makeSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    paint(`<main class="screen no-nav" style="justify-content:center"><div class="card stack center"><div class="title-sm">Can't reach Waggly</div><p class="sub">Check your internet connection and try again.</p><button class="btn" onclick="location.reload()">Retry</button></div></main>`);
    return;
  }
  if (S.api && S.api.mode === 'demo') document.body.insertAdjacentHTML('beforeend', '<div class="demo-flag">DEMO</div>');
  if (S.api) S.api.onAuthChange(() => { S.me = null; render(); });
  const saved = loadRec();
  if (saved && S.api && S.api.uid()) { S.rec = { ...saved, watchId: null }; }
  await render();
  if (S.api && S.me) cleanupStaleLiveWalks();
}

boot();
