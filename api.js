// Data layer. Two interchangeable versions with the same functions:
//  - makeSupabaseApi: the real thing (accounts + shared walks in Supabase)
//  - makeDemoApi: a pretend world kept on this phone, with a demo friend

const WALK_COLS = 'id,user_id,title,dog_name,status,started_at,updated_at,ended_at,distance_m,duration_s,route';
const LIVE_WINDOW_MS = 15 * 60 * 1000; // a "live" walk with no update for 15 min is treated as over

function friendly(error) {
  const msg = (error && (error.message || error.error_description)) || 'Something went wrong';
  if (error && error.code === '23505') {
    if (/username/.test(msg)) return 'That username is taken. Try another one.';
    return 'That already exists.';
  }
  if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match. Try again?';
  if (/User already registered/i.test(msg)) return 'There’s already an account with that email. Try logging in.';
  if (/Password should be at least/i.test(msg)) return 'Your password needs at least 6 characters.';
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first (check your inbox), then log in.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No connection right now. Check your signal and try again.';
  return msg;
}

export async function makeSupabaseApi(url, key) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let session = (await sb.auth.getSession()).data.session;
  const listeners = [];
  sb.auth.onAuthStateChange((event, s) => {
    const before = session && session.user && session.user.id;
    session = s;
    const after = s && s.user && s.user.id;
    if (before !== after) listeners.forEach((cb) => cb(event));
  });
  const uid = () => (session && session.user && session.user.id) || null;
  const ok = (res) => { if (res.error) throw new Error(friendly(res.error)); return res.data; };

  return {
    mode: 'live',
    uid,
    email: () => (session && session.user && session.user.email) || '',
    onAuthChange(cb) { listeners.push(cb); },
    async signUp(email, password) {
      const res = await sb.auth.signUp({ email, password });
      ok(res);
      session = res.data.session;
      return { needsConfirm: !res.data.session };
    },
    async signIn(email, password) {
      const res = await sb.auth.signInWithPassword({ email, password });
      ok(res);
      session = res.data.session;
    },
    async signOut() { await sb.auth.signOut(); session = null; },

    async getProfile(id) { return ok(await sb.from('profiles').select('*').eq('id', id).maybeSingle()); },
    async profilesByIds(ids) {
      if (!ids.length) return [];
      return ok(await sb.from('profiles').select('*').in('id', ids));
    },
    async createProfile(p) { return ok(await sb.from('profiles').insert({ ...p, id: uid() }).select().single()); },
    async updateProfile(p) { return ok(await sb.from('profiles').update(p).eq('id', uid()).select().single()); },
    async findByUsername(u) { return ok(await sb.from('profiles').select('*').eq('username', u).maybeSingle()); },

    async friendIds() {
      const me = uid();
      const rows = ok(await sb.from('friendships').select('user_a,user_b'));
      return rows.map((r) => (r.user_a === me ? r.user_b : r.user_a));
    },
    async addFriend(other) {
      const me = uid();
      const [a, b] = me < other ? [me, other] : [other, me];
      ok(await sb.from('friendships').insert({ user_a: a, user_b: b }));
    },
    async removeFriend(other) {
      const me = uid();
      const [a, b] = me < other ? [me, other] : [other, me];
      ok(await sb.from('friendships').delete().eq('user_a', a).eq('user_b', b));
    },

    async startWalk(fields) {
      return ok(await sb.from('walks').insert({ status: 'live', ...fields, user_id: uid() }).select(WALK_COLS).single());
    },
    async updateWalk(id, patch) {
      return ok(await sb.from('walks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select(WALK_COLS).single());
    },
    async deleteWalk(id) { ok(await sb.from('walks').delete().eq('id', id)); },
    async getWalk(id) { return ok(await sb.from('walks').select(WALK_COLS).eq('id', id).maybeSingle()); },
    async walks({ userIds, since, status = 'done', limit = 200 }) {
      if (!userIds.length) return [];
      let q = sb.from('walks').select(WALK_COLS).in('user_id', userIds).eq('status', status);
      if (since) q = q.gte('started_at', since);
      return ok(await q.order('started_at', { ascending: false }).limit(limit));
    },
    async liveWalks(userIds) {
      if (!userIds.length) return [];
      const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      return ok(await sb.from('walks').select(WALK_COLS).in('user_id', userIds).eq('status', 'live').gte('updated_at', since).order('started_at', { ascending: false }));
    },

    async sendCheer(walkId, message) { ok(await sb.from('cheers').insert({ walk_id: walkId, message, from_user: uid() })); },
    async cheers(walkId) { return ok(await sb.from('cheers').select('*').eq('walk_id', walkId).order('created_at', { ascending: true })); },

    async paws(walkIds) {
      const out = {};
      walkIds.forEach((id) => { out[id] = { count: 0, mine: false }; });
      if (!walkIds.length) return out;
      const rows = ok(await sb.from('paws').select('walk_id,user_id').in('walk_id', walkIds));
      const me = uid();
      rows.forEach((r) => { const o = out[r.walk_id]; if (o) { o.count++; if (r.user_id === me) o.mine = true; } });
      return out;
    },
    async setPaw(walkId, on) {
      if (on) ok(await sb.from('paws').insert({ walk_id: walkId, user_id: uid() }));
      else ok(await sb.from('paws').delete().eq('walk_id', walkId).eq('user_id', uid()));
    },
  };
}

// ---------------------------------------------------------------- demo

const DEMO_KEY = 'waggly-demo-v1';
const ME = 'demo-me';

function hav(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function routeLen(r) { let d = 0; for (let i = 1; i < r.length; i++) d += hav(r[i - 1], r[i]); return d; }

function makeLoop(lat, lng, size, seed, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.18 * Math.sin(a * 3 + seed) + 0.08 * Math.cos(a * 5 + seed * 2);
    pts.push([+(lng + Math.cos(a) * size * 1.25 * wob).toFixed(5), +(lat + Math.sin(a) * size * wob).toFixed(5)]);
  }
  return pts;
}

function seedDemo() {
  const now = Date.now();
  const day = 86400000;
  const db = { me: null, profiles: {}, friendships: [], walks: [], cheers: [], paws: [], seq: 1 };
  db.profiles['demo-tonya'] = { id: 'demo-tonya', username: 'tonya', display_name: 'Tonya', dog_name: 'Goose', dog_breed: 'Bernese Mountain Dog', city: 'Atlanta, GA' };
  db.profiles['demo-bianca'] = { id: 'demo-bianca', username: 'bianca', display_name: 'Bianca', dog_name: 'Frank & Beans', dog_breed: 'Dachshunds', city: 'Austin, TX' };
  db.profiles['demo-stef'] = { id: 'demo-stef', username: 'stef', display_name: 'Stef', dog_name: 'Lou & Daisy', dog_breed: 'Basset Hounds', city: 'San Diego, CA' };
  const titles = ['Morning loop', 'Park zoomies', 'Sniff tour', 'Evening stroll', 'Creek walk', 'Quick lap'];
  for (let i = 1; i <= 16; i++) {
    if (i % 4 === 3) continue;
    const start = now - i * day - (7 + (i % 3)) * 3600000;
    const route = makeLoop(33.865, -84.29, 0.0035 + (i % 4) * 0.001, i);
    const dist = routeLen(route);
    db.walks.push({ id: 'dw' + i, user_id: 'demo-tonya', title: titles[i % titles.length], dog_name: 'Goose', status: 'done',
      started_at: new Date(start).toISOString(), updated_at: new Date(start + dist / 1.2 * 1000).toISOString(), ended_at: new Date(start + dist / 1.2 * 1000).toISOString(),
      distance_m: dist, duration_s: Math.round(dist / 1.2), route });
  }
  const liveRoute = makeLoop(33.87, -84.30, 0.004, 9, 60).slice(0, 26);
  db.walks.push({ id: 'dw-live', user_id: 'demo-tonya', title: '', dog_name: 'Goose', status: 'live',
    started_at: new Date(now - 14 * 60000).toISOString(), updated_at: new Date(now).toISOString(), ended_at: null,
    distance_m: routeLen(liveRoute), duration_s: 14 * 60, route: liveRoute });
  return db;
}

export function makeDemoApi() {
  let db;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { db = null; }
  if (!db) db = seedDemo();
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ } };
  save();
  const listeners = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const later = (ms, fn) => setTimeout(() => { fn(); save(); }, ms);
  const wait = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));
  const friendIdsOf = (id) => db.friendships.filter((f) => f.includes(id)).map((f) => (f[0] === id ? f[1] : f[0]));
  const canSee = (w) => w.user_id === ME || friendIdsOf(ME).includes(w.user_id);
  // keep demo Tonya's walk "live" while the demo is open
  const touchLive = () => { const w = db.walks.find((x) => x.id === 'dw-live'); if (w && w.status === 'live') w.updated_at = new Date().toISOString(); };

  return {
    mode: 'demo',
    uid: () => (db.me ? ME : null),
    email: () => (db.me ? 'demo@waggly.app' : ''),
    onAuthChange(cb) { listeners.push(cb); },
    async signUp() { db.me = true; save(); return { needsConfirm: false }; },
    async signIn() { db.me = true; save(); },
    async signOut() { db.me = null; save(); },
    reset() { localStorage.removeItem(DEMO_KEY); },

    async getProfile(id) { return wait(db.profiles[id] || null); },
    async profilesByIds(ids) { return wait(ids.map((i) => db.profiles[i]).filter(Boolean)); },
    async createProfile(p) {
      if (Object.values(db.profiles).some((x) => x.username === p.username)) throw new Error('That username is taken. Try another one.');
      db.profiles[ME] = { ...p, id: ME }; save(); return wait(db.profiles[ME]);
    },
    async updateProfile(p) { db.profiles[ME] = { ...db.profiles[ME], ...p }; save(); return wait(db.profiles[ME]); },
    async findByUsername(u) { return wait(Object.values(db.profiles).find((x) => x.username === u) || null); },

    async friendIds() { return wait(friendIdsOf(ME)); },
    async addFriend(other) {
      if (friendIdsOf(ME).includes(other)) throw new Error('That already exists.');
      db.friendships.push([ME, other]); save(); return wait(true);
    },
    async removeFriend(other) { db.friendships = db.friendships.filter((f) => !(f.includes(ME) && f.includes(other))); save(); return wait(true); },

    async startWalk(fields) {
      const now = new Date().toISOString();
      const w = { id: 'w' + (db.seq++) + '-' + Date.now(), user_id: ME, title: '', dog_name: '', status: 'live', started_at: now, updated_at: now, ended_at: null, distance_m: 0, duration_s: 0, route: [], ...fields };
      db.walks.push(w); save();
      if (friendIdsOf(ME).includes('demo-tonya')) {
        later(20000, () => db.cheers.push({ id: 'c' + Date.now(), walk_id: w.id, from_user: 'demo-tonya', message: 'You got this! Goose says hi', created_at: new Date().toISOString() }));
      }
      return wait(w);
    },
    async updateWalk(id, patch) {
      const w = db.walks.find((x) => x.id === id);
      if (!w) throw new Error('Walk not found');
      const wasLive = w.status === 'live';
      Object.assign(w, patch, { updated_at: new Date().toISOString() });
      save();
      if (wasLive && w.status === 'done' && friendIdsOf(ME).includes('demo-tonya')) {
        later(6000, () => { if (!db.paws.some((p) => p.walk_id === w.id && p.user_id === 'demo-tonya')) db.paws.push({ walk_id: w.id, user_id: 'demo-tonya' }); });
      }
      return wait(w);
    },
    async deleteWalk(id) { db.walks = db.walks.filter((x) => x.id !== id); save(); return wait(true); },
    async getWalk(id) { touchLive(); const w = db.walks.find((x) => x.id === id); return wait(w && canSee(w) ? w : null); },
    async walks({ userIds, since, status = 'done', limit = 200 }) {
      const t = since ? Date.parse(since) : 0;
      return wait(db.walks.filter((w) => canSee(w) && userIds.includes(w.user_id) && w.status === status && Date.parse(w.started_at) >= t)
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, limit));
    },
    async liveWalks(userIds) {
      touchLive();
      const cutoff = Date.now() - LIVE_WINDOW_MS;
      return wait(db.walks.filter((w) => canSee(w) && userIds.includes(w.user_id) && w.status === 'live' && Date.parse(w.updated_at) >= cutoff));
    },

    async sendCheer(walkId, message) { db.cheers.push({ id: 'c' + Date.now(), walk_id: walkId, from_user: ME, message, created_at: new Date().toISOString() }); save(); return wait(true); },
    async cheers(walkId) {
      const w = db.walks.find((x) => x.id === walkId);
      return wait(db.cheers.filter((c) => c.walk_id === walkId && (c.from_user === ME || (w && w.user_id === ME))));
    },
    async paws(walkIds) {
      const out = {};
      walkIds.forEach((id) => { out[id] = { count: 0, mine: false }; });
      db.paws.forEach((p) => { const o = out[p.walk_id]; if (o) { o.count++; if (p.user_id === ME) o.mine = true; } });
      return wait(out);
    },
    async setPaw(walkId, on) {
      db.paws = db.paws.filter((p) => !(p.walk_id === walkId && p.user_id === ME));
      if (on) db.paws.push({ walk_id: walkId, user_id: ME });
      save(); return wait(true);
    },
  };
}
