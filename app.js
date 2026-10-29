/* =====================================================================
   SIPARIS • STOK • CARI  —  tek dosyalik, kutuphanesiz web uygulamasi
   Veri tabani: Supabase (PostgreSQL). Butun hesaplar veri tabanindaki
   gorunum ve fonksiyonlarda yapilir; bu dosya sadece ekranlari cizer.
   ===================================================================== */
'use strict';

const CFG = window.APP_CONFIG;

/* ------------------------------------------------------------------ */
/* Yardimcilar                                                         */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const fmt2 = (v) => num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PB = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
const PB_AD = { TRY: 'TL', USD: 'USD $', EUR: 'EUR €', GBP: 'GBP £' };
const fmtPB = (v, pb) => (!pb || pb === 'TRY' ? fmtTL(v) : num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + PB[pb]);
const sonKur = (pb) => { try { return JSON.parse(localStorage.getItem('ssc_kur') || '{}')[pb] || ''; } catch { return ''; } };
const kurHatirla = (pb, k) => { try { const o = JSON.parse(localStorage.getItem('ssc_kur') || '{}'); o[pb] = k; localStorage.setItem('ssc_kur', JSON.stringify(o)); } catch {} };
/* Para birimi + kur alanlari. pb TRY iken kur kapali (1). */
function dovizHtml(id, pb = 'TRY', kur = '') {
  return `<div class="grid2">
    <div class="field"><label>Para birimi</label><select class="input" id="${id}-pb">${Object.keys(PB).map((k) => `<option value="${k}" ${k === pb ? 'selected' : ''}>${PB_AD[k]}</option>`).join('')}</select></div>
    <div class="field"><label id="${id}-kl">Kur (1 ${pb === 'TRY' ? 'birim' : pb} = ? ₺)</label><input class="input" id="${id}-kur" inputmode="decimal" value="${pb === 'TRY' ? '' : (kur === '' ? '' : fmtN(kur))}" placeholder="${pb === 'TRY' ? 'TL için gerekmez' : 'örn. 41,25'}" ${pb === 'TRY' ? 'disabled' : ''}></div>
  </div>`;
}
/* get(): {pb, kur} ; kur TRY icin 1, gecersizse NaN */
function bindDoviz(root, id, onChange = () => {}) {
  const sel = $(`#${id}-pb`, root), inp = $(`#${id}-kur`, root), lab = $(`#${id}-kl`, root);
  const get = () => { const pb = sel.value; return { pb, kur: pb === 'TRY' ? 1 : parseNum(inp.value) }; };
  let onceki = get();
  sel.onchange = () => {
    const pb = sel.value;
    inp.disabled = pb === 'TRY'; inp.placeholder = pb === 'TRY' ? 'TL için gerekmez' : 'örn. 41,25';
    inp.value = pb === 'TRY' ? '' : (sonKur(pb) ? fmtN(sonKur(pb)) : '');
    lab.textContent = `Kur (1 ${pb === 'TRY' ? 'birim' : pb} = ? ₺)`;
    const yeni = get(); onChange(yeni, onceki); onceki = yeni;
    if (pb !== 'TRY' && !inp.value) inp.focus();
  };
  inp.oninput = () => { const yeni = get(); onChange(yeni, onceki); onceki = yeni; };
  return { get, check() { const d = get(); if (d.pb !== 'TRY' && !(d.kur > 0)) { toast(`${d.pb} için kur girin`, 'err'); inp.focus(); return null; } if (d.pb !== 'TRY') kurHatirla(d.pb, d.kur); return d; } };
}
const fmtTL = (v) => num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const fmtN = (v) => num(v).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const fmtD = (iso) => { if (!iso) return '–'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const monthStart = () => today().slice(0, 8) + '01';
const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
/* Turkce sayi okuma: "74.340" = 74340 (nokta binlik), "1.250,50" = 1250.5, "41,5" = 41.5; tek nokta ve 3'ten farkli basamak ("41.5") ondalik sayilir */
const parseNum = (s) => {
  if (s === null || s === undefined) return NaN;
  s = String(s).trim().replace(/\s/g, '').replace(/[₺$€£]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
};
const eq = (v) => 'eq.' + encodeURIComponent(v);
const balCls = (v) => (num(v) > 0.005 ? 'pos' : num(v) < -0.005 ? 'neg' : 'zero');

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  order: '<path d="M6 2h9l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.4.2 4.2 1.9 5 4.9"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  truck: '<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ''}</svg>`;

/* ------------------------------------------------------------------ */
/* Supabase istemcisi (kutuphanesiz)                                    */
/* ------------------------------------------------------------------ */
const api = {
  session: null,
  load() { try { this.session = JSON.parse(localStorage.getItem('ssc_session') || 'null'); } catch { this.session = null; } },
  save(s) {
    this.session = s;
    try { s ? localStorage.setItem('ssc_session', JSON.stringify(s)) : localStorage.removeItem('ssc_session'); } catch {}
  },
  async auth(path, body) {
    const r = await fetch(`${CFG.url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(trAuthErr(j.error_description || j.msg || j.message || j.error || 'Giriş yapılamadı'));
    return j;
  },
  keep(j) {
    if (!j.access_token) return false;
    this.save({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: j.user });
    return true;
  },
  async login(email, password) { this.keep(await this.auth('token?grant_type=password', { email, password })); },
  async signup(email, password, ad) { const j = await this.auth('signup', { email, password, data: { ad } }); return this.keep(j); },
  async refresh() {
    if (!this.session?.refresh_token) throw new Error('Oturum süresi doldu');
    if (!this._ref) this._ref = this.auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh_token })
      .then((j) => { this.keep(j); }).finally(() => { this._ref = null; });
    return this._ref;
  },
  async logout() {
    const t = this.session?.access_token;
    this.save(null);
    if (t) fetch(`${CFG.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: CFG.key, Authorization: `Bearer ${t}` } }).catch(() => {});
  },
  async req(method, path, { body, prefer } = {}, retried = false) {
    if (this.session && this.session.expires_at - Date.now() < 60000) {
      try { await this.refresh(); } catch { this.save(null); location.hash = '#/'; render(); throw new Error('Oturum süresi doldu, tekrar giriş yapın'); }
    }
    const headers = { apikey: CFG.key, 'Content-Type': 'application/json' };
    if (this.session) headers.Authorization = `Bearer ${this.session.access_token}`;
    if (prefer) headers.Prefer = prefer;
    let r;
    try { r = await fetch(`${CFG.url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'); }
    if (r.status === 401 && !retried && this.session) { await this.refresh().catch(() => {}); return this.req(method, path, { body, prefer }, true); }
    const txt = await r.text();
    const j = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(trDbErr(j));
    return j;
  },
  get(table, query = 'select=*') { return this.req('GET', `${table}?${query}`); },
  /* Storage / Edge Function istekleri (oturum anahtariyla) */
  async raw(path, opts = {}) {
    if (this.session && this.session.expires_at - Date.now() < 60000) await this.refresh().catch(() => {});
    const headers = { apikey: CFG.key, ...(opts.headers || {}) };
    if (this.session) headers.Authorization = `Bearer ${this.session.access_token}`;
    let r;
    try { r = await fetch(`${CFG.url}/${path}`, { ...opts, headers }); } catch { throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'); }
    if (!r.ok) { const t = await r.text(); let m = t; try { const j = JSON.parse(t); m = j.hata || j.message || j.error || t; } catch {} throw new Error(m || `Hata ${r.status}`); }
    return r;
  },
  insert(table, rows, { upsert = false, onConflict = '' } = {}) {
    const q = onConflict ? `?on_conflict=${onConflict}` : '';
    return this.req('POST', table + q, { body: rows, prefer: 'return=representation' + (upsert ? ',resolution=merge-duplicates' : '') });
  },
  update(table, match, patch) { return this.req('PATCH', `${table}?${match}`, { body: patch, prefer: 'return=representation' }); },
  del(table, match) { return this.req('DELETE', `${table}?${match}`, { prefer: 'return=representation' }); },
  rpc(fn, args = {}) { return this.req('POST', `rpc/${fn}`, { body: args }); }
};

function trAuthErr(m) {
  if (/invalid login credentials/i.test(m)) return 'E-posta veya şifre hatalı.';
  if (/email not confirmed/i.test(m)) return 'E-posta adresi henüz onaylanmamış. Gelen kutunuzdaki onay bağlantısına tıklayın.';
  if (/already registered/i.test(m)) return 'Bu e-posta ile zaten bir hesap var. Giriş yapın.';
  if (/password should be at least/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/signups not allowed/i.test(m)) return 'Yeni kayıt kapalı. Yöneticinizden hesap isteyin.';
  return m;
}
function trDbErr(j) {
  const m = j?.message || 'İşlem yapılamadı';
  if (j?.code === '23505') return 'Bu isim/kod ile zaten bir kayıt var.';
  if (j?.code === '23503') return 'Bu kayıt başka kayıtlarda kullanıldığı için silinemez.';
  if (j?.code === '42501' || /row-level security/i.test(m)) return 'Bu işlem için yetkiniz yok.';
  if (j?.code === '23514') return 'Girilen değer geçersiz (negatif ya da izin verilmeyen bir değer).';
  return m;
}

/* ------------------------------------------------------------------ */
/* Uygulama durumu ve onbellek                                          */
/* ------------------------------------------------------------------ */
const state = { profil: null, ayarlar: null, urunler: null, cariler: null, ui: {} };
const cache = {
  async ayarlar(force) { if (force || !state.ayarlar) state.ayarlar = (await api.get('ayarlar', 'select=*&id=eq.1'))[0]; return state.ayarlar; },
  async urunler(force) { if (force || !state.urunler) state.urunler = await api.get('v_stok', 'select=*&order=ad.asc&limit=10000'); return state.urunler; },
  async cariler(force) { if (force || !state.cariler) state.cariler = await api.get('v_cariler', 'select=*&order=unvan.asc&limit=10000'); return state.cariler; },
  dirty(...k) { k.forEach((x) => { state[x] = null; }); }
};
const isAdmin = () => state.profil?.rol === 'admin';

/* ------------------------------------------------------------------ */
/* Bildirim, modal, onay                                                */
/* ------------------------------------------------------------------ */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 5000 : 2800);
}
function fail(e) { console.error(e); toast(e.message || String(e), 'err'); }

function modal({ title, body, foot = '', onMount, wide = false }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" style="${wide ? 'max-width:900px' : ''}">
      <div class="sh-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.body.style.overflow = ''; };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  $('#modal-root').appendChild(ov);
  document.body.style.overflow = 'hidden';
  const ctx = { el: ov, close };
  onMount && onMount(ctx);
  const f = $('input:not([type=hidden]):not([readonly]), select, textarea', ov);
  if (f && window.matchMedia('(min-width: 700px)').matches) setTimeout(() => f.focus(), 60);
  return ctx;
}
function confirmBox(title, text, okText = 'Onayla', danger = false) {
  return new Promise((res) => {
    modal({
      title, body: `<p style="margin:0 0 6px">${text}</p>`,
      foot: `<button class="btn" data-close>Vazgeç</button><button class="btn ${danger ? 'red' : 'primary'}" id="cfm-ok">${esc(okText)}</button>`,
      onMount: (m) => {
        $('#cfm-ok', m.el).onclick = () => { m.close(); res(true); };
        m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.closest('[data-close]')) res(false); });
      }
    });
  });
}
async function busy(btn, fn) {
  const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Kaydediliyor…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = t; }
}

/* Otomatik tamamlama (cari / urun secici) */
function picker(input, { items, label, sub, onPick, onAdd, addText = 'Yeni ekle', max = 40 }) {
  const wrap = input.closest('.picker');
  let dd = null, hl = -1, list = [];
  const close = () => { dd?.remove(); dd = null; hl = -1; };
  const open = () => {
    const q = norm(input.value);
    const all = typeof items === 'function' ? items() : items;
    list = (q ? all.filter((it) => norm(label(it) + ' ' + (sub ? sub(it) : '')).includes(q)) : all).slice(0, max);
    close();
    dd = document.createElement('div'); dd.className = 'dd';
    dd.innerHTML = list.map((it, i) => `<div class="opt" data-i="${i}"><div class="o1">${esc(label(it))}</div>${sub ? `<div class="o2">${sub(it)}</div>` : ''}</div>`).join('')
      + (onAdd ? `<div class="opt add" data-add>＋ ${esc(addText)}${input.value ? `: “${esc(input.value)}”` : ''}</div>` : '')
      + (!list.length && !onAdd ? '<div class="opt tiny">Sonuç yok</div>' : '');
    dd.addEventListener('mousedown', (e) => e.preventDefault());
    dd.addEventListener('click', (e) => {
      const o = e.target.closest('.opt'); if (!o) return;
      if (o.hasAttribute('data-add')) { const v = input.value; close(); onAdd(v); return; }
      if (o.dataset.i !== undefined) { const it = list[+o.dataset.i]; close(); onPick(it); }
    });
    wrap.appendChild(dd);
  };
  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (!dd) return;
    const opts = $$('.opt[data-i]', dd);
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, opts.length - 1); }
    else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hl >= 0) { const it = list[hl]; close(); onPick(it); } return; }
    else if (e.key === 'Escape') { close(); return; }
    else return;
    e.preventDefault(); opts.forEach((o, i) => o.classList.toggle('hl', i === hl)); opts[hl]?.scrollIntoView({ block: 'nearest' });
  });
}

/* ------------------------------------------------------------------ */
/* Iskelet, menu, yonlendirme                                           */
/* ------------------------------------------------------------------ */
const NAV = [
  { h: '#/', k: 'home', t: 'Ana Sayfa', i: 'home' },
  { h: '#/siparisler', k: 'siparis', t: 'Siparişler', i: 'order' },
  { h: '#/stok', k: 'stok', t: 'Stok', i: 'box' },
  { h: '#/cariler', k: 'cari', t: 'Cariler', i: 'users' },
  { h: '#/raporlar', k: 'rapor', t: 'Raporlar', i: 'chart', side: true },
  { h: '#/ayarlar', k: 'ayar', t: 'Ayarlar', i: 'gear', side: true },
  { h: '#/daha', k: 'daha', t: 'Daha', i: 'more', bottom: true }
];
const ROUTES = [
  [/^#\/?$/, 'home', viewHome],
  [/^#\/siparisler$/, 'siparis', viewSiparisler],
  [/^#\/siparis\/yeni(?:\?cari=(\d+))?$/, 'siparis', viewSiparisYeni],
  [/^#\/siparis\/(\d+)\/duzenle$/, 'siparis', viewSiparisDuzenle],
  [/^#\/siparis\/(\d+)$/, 'siparis', viewSiparisDetay],
  [/^#\/stok$/, 'stok', viewStok],
  [/^#\/stok\/hareketler$/, 'stok', viewStokHareketleri],
  [/^#\/alis\/yeni(?:\?urun=(\d+))?$/, 'stok', viewMalAlisi],
  [/^#\/urun\/(\d+)$/, 'stok', viewUrunDetay],
  [/^#\/cariler$/, 'cari', viewCariler],
  [/^#\/cari\/(\d+)$/, 'cari', viewCariDetay],
  [/^#\/raporlar$/, 'rapor', viewRaporlar],
  [/^#\/ayarlar$/, 'ayar', viewAyarlar],
  [/^#\/daha$/, 'daha', viewDaha]
];

function shell(active) {
  const who = state.profil ? `${esc(state.profil.ad || '')} · ${state.profil.rol === 'admin' ? 'Yönetici' : 'Personel'}` : '';
  $('#app').innerHTML = `
    <div class="shell">
      <nav class="sidebar">
        <div class="brand">${esc(state.ayarlar?.firma_adi || 'Firmam')}<small>Sipariş • Stok • Cari</small></div>
        ${NAV.filter((n) => !n.bottom).map((n) => `<a href="${n.h}" class="${n.k === active ? 'active' : ''}">${icon(n.i)}${n.t}</a>`).join('')}
        <div class="spacer"></div><div class="who">${who}</div>
      </nav>
      <div class="main">
        <header class="topbar" id="topbar"></header>
        <main class="view" id="view"><div class="loading"><div class="spinner"></div>Yükleniyor…</div></main>
      </div>
      <nav class="bottomnav">
        ${NAV.filter((n) => !n.side).map((n) => `<a href="${n.h}" class="${n.k === active || (n.k === 'daha' && ['rapor', 'ayar'].includes(active)) ? 'active' : ''}">${icon(n.i)}${n.t}</a>`).join('')}
      </nav>
    </div>`;
}
function topbar(title, { back = false, actions = '' } = {}) {
  $('#topbar').innerHTML = `${back ? `<button class="back" onclick="history.length > 1 ? history.back() : (location.hash='#/')">${icon('back')}</button>` : ''}<h1>${esc(title)}</h1>${actions}`;
  document.title = `${title} · ${state.ayarlar?.firma_adi || 'Stok Cari'}`;
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  $('#modal-root').innerHTML = ''; document.body.style.overflow = '';
  if (!api.session) return viewLogin();
  try {
    if (!state.profil) {
      const uid = api.session.user?.id;
      state.profil = (await api.get('profiller', `select=*&id=eq.${uid}`))[0] || { rol: 'personel' };
      await cache.ayarlar();
    }
  } catch (e) { if (!api.session) return viewLogin(); fail(e); }
  const h = location.hash || '#/';
  const r = ROUTES.find(([re]) => re.test(h)) || ROUTES[0];
  const m = h.match(r[0]) || [];
  shell(r[1]);
  try { await r[2](...m.slice(1)); }
  catch (e) { if (seq === renderSeq) { $('#view').innerHTML = `<div class="card empty">Bir hata oluştu: ${esc(e.message)}<br><br><button class="btn" onclick="render()">Tekrar dene</button></div>`; } fail(e); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

/* ------------------------------------------------------------------ */
/* GIRIS                                                               */
/* ------------------------------------------------------------------ */
function viewLogin() {
  let mode = 'login';
  const draw = () => {
    $('#app').innerHTML = `
    <div class="login"><form class="box" id="lf">
      <img class="logo" src="icons/icon-192-v4.png" alt="">
      <h1>${esc(CFG.appName)}</h1>
      <p class="sub">${mode === 'login' ? 'Devam etmek için giriş yapın' : 'İlk kurulum: hesabınızı oluşturun'}</p>
      ${mode === 'signup' ? `<div class="field"><label>Adınız</label><input class="input" name="ad" required autocomplete="name"></div>` : ''}
      <div class="field"><label>E-posta</label><input class="input" name="email" type="email" required autocomplete="email" autocapitalize="off"></div>
      <div class="field"><label>Şifre</label><input class="input" name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>
      <button class="btn primary block" id="lbtn">${mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}</button>
      <p class="tiny" style="text-align:center;margin-top:16px">
        ${mode === 'login' ? 'Hesabınız yok mu? <a href="#" id="sw">Hesap oluştur</a>' : 'Hesabınız var mı? <a href="#" id="sw">Giriş yap</a>'}
      </p>
      ${mode === 'signup' ? '<p class="tiny" style="text-align:center">Programa ilk kaydolan kişi otomatik olarak yönetici olur.</p>' : ''}
    </form></div>`;
    $('#sw').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'signup' : 'login'; draw(); };
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $('#lbtn');
      try {
        await busy(btn, async () => {
          if (mode === 'login') await api.login(f.get('email').trim(), f.get('password'));
          else {
            const ok = await api.signup(f.get('email').trim(), f.get('password'), f.get('ad').trim());
            if (!ok) { toast('Hesap oluşturuldu. E-postanıza gelen onay bağlantısına tıklayıp giriş yapın.', 'ok'); mode = 'login'; draw(); return; }
          }
        });
        if (api.session) { state.profil = null; location.hash = '#/'; render(); }
      } catch (err) { fail(err); }
    };
  };
  draw();
}

/* ------------------------------------------------------------------ */
/* ANA SAYFA                                                           */
/* ------------------------------------------------------------------ */
async function viewHome() {
  topbar(state.ayarlar?.firma_adi || 'Ana Sayfa', { actions: `<button class="tb-btn" onclick="go('#/siparis/yeni')">${icon('plus')}Sipariş</button>` });
  const [oz, bek, urun, alacakli] = await Promise.all([
    api.rpc('panel_ozet'),
    api.get('v_siparisler', `select=*&durum=${eq('Beklemede')}&order=tarih.asc,fis_no.asc&limit=50`),
    cache.urunler(true),
    api.get('v_cariler', 'select=*&bakiye=gt.0.005&aktif=is.true&order=bakiye.desc&limit=10')
  ]);
  const eksi = urun.filter((u) => u.aktif && (num(u.sevk_sonrasi_stok) < 0 || num(u.real_stok) < 0));
  const alacak10 = alacakli.filter((c) => num(c.bakiye) > 0.005).sort((a, b) => num(b.bakiye) - num(a.bakiye)).slice(0, 10);
  $('#view').innerHTML = `
    <div class="quick">
      <button class="q-blue" onclick="go('#/siparis/yeni')">${icon('order')}Yeni Sipariş</button>
      <button class="q-green" onclick="malAlisi()">${icon('inbox')}Mal Alışı</button>
      <button class="q-orange" onclick="tahsilat()">${icon('cash')}Tahsilat</button>
      <button class="q-purple" onclick="go('#/stok')">${icon('box')}Stok Durumu</button>
    </div>
    <div class="section-title">Özet</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Bu ay satış</div><div class="v num">${fmtTL(oz.bu_ay_satis)}</div><div class="s">KDV dahil, iptaller hariç</div></div>
      <div class="kpi orange"><div class="l">Açık alacak</div><div class="v num">${fmtTL(oz.acik_alacak)}</div><div class="s">R ${fmtTL(oz.acik_alacak_r)} · GR ${fmtTL(oz.acik_alacak_gr)}</div></div>
      <div class="kpi purple"><div class="l">Bekleyen sipariş</div><div class="v num">${oz.bekleyen_siparis}</div><div class="s">sevk edilmeyi bekliyor</div></div>
      <div class="kpi ${eksi.length ? 'red' : 'green'}"><div class="l">Eksi stok</div><div class="v num">${eksi.length}</div><div class="s">ürün</div></div>
    </div>
    <div class="section-title">Sevk bekleyen siparişler <a href="#/siparisler">Tümü</a></div>
    <div class="list">${bek.length ? bek.map((s) => siparisRow(s, true)).join('') : '<div class="empty">Bekleyen sipariş yok 🎉</div>'}</div>
    <div class="section-title">En çok alacaklı olduğumuz cariler <a href="#" id="tum-alacak">Tümü</a></div>
    <div class="list">${alacak10.length ? alacak10.map(cariRow).join('') : '<div class="empty">Açık alacak yok</div>'}</div>
    <div class="section-title">Eksi stoktaki ürünler <a href="#/stok">Stok</a></div>
    <div class="list">${eksi.length ? eksi.map(urunRow).join('') : '<div class="empty">Eksi stokta ürün yok</div>'}</div>`;
  bindRows();
  $('#tum-alacak').onclick = (e) => { e.preventDefault(); state.ui.cari = { f: 'Bakiyesi olan', q: '', sirala: 'bakiye' }; go('#/cariler'); };
}

/* ------------------------------------------------------------------ */
/* SIPARISLER                                                          */
/* ------------------------------------------------------------------ */
const durumBadge = (d) => `<span class="badge ${d === 'Beklemede' ? 'b-orange' : d === 'Sevk Edildi' ? 'b-green' : 'b-red'}">${esc(d)}</span>`;
const tipBadge = (t) => `<span class="badge ${t === 'R' ? 'b-blue' : 'b-purple'}">${esc(t)}</span>`;
function siparisRow(s, sevkBtn = false) {
  return `<div class="row" data-go="#/siparis/${s.id}">
    <div class="main-col"><div class="t">${esc(s.cari_unvan)}</div>
      <div class="st"><span class="num">Fiş ${s.fis_no}</span>· ${fmtD(s.tarih)} ${tipBadge(s.fatura_tipi)} ${durumBadge(s.durum)} ${s.gonderim_sekli ? `<span class="tiny">${esc(s.gonderim_sekli)}</span>` : ''}</div></div>
    <div class="end"><div class="amt">${fmtTL(s.genel_toplam)}</div>
      ${sevkBtn && s.durum === 'Beklemede' ? `<button class="btn sm green" style="margin-top:6px" data-sevk="${s.id}" data-fis="${s.fis_no}">${icon('truck')}Sevk et</button>` : ''}</div>
  </div>`;
}
function bindRows(root = document) {
  $$('[data-go]', root).forEach((el) => el.addEventListener('click', (e) => { if (e.target.closest('button,input,a')) return; go(el.dataset.go); }));
  $$('[data-sevk]', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sevkEt(+b.dataset.sevk, b.dataset.fis); }));
}

async function viewSiparisler() {
  topbar('Siparişler', { actions: `<button class="tb-btn" onclick="go('#/siparis/yeni')">${icon('plus')}Yeni</button>` });
  const ui = state.ui.sip ||= { durum: 'Tümü', tip: 'Tümü', q: '' };
  const data = await api.get('v_siparisler', 'select=*&order=fis_no.desc&limit=5000');
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" placeholder="Cari, fiş no, şehir ara…" value="${esc(ui.q)}"></div></div>
    <div class="chips" id="c1">${['Tümü', 'Beklemede', 'Sevk Edildi', 'İptal'].map((d) => `<button class="chip ${ui.durum === d ? 'on' : ''}" data-d="${d}">${d}</button>`).join('')}
      <span style="width:8px"></span>${['Tümü', 'R', 'GR'].map((t) => `<button class="chip ${ui.tip === t ? 'on' : ''}" data-t="${t}">${t === 'Tümü' ? 'R + GR' : t}</button>`).join('')}</div>
    <div id="sum" class="tiny" style="margin:0 4px 8px"></div>
    <div class="list" id="lst"></div>`;
  const draw = () => {
    const q = norm(ui.q);
    const f = data.filter((s) => (ui.durum === 'Tümü' || s.durum === ui.durum) && (ui.tip === 'Tümü' || s.fatura_tipi === ui.tip)
      && (!q || norm(`${s.cari_unvan} ${s.fis_no} ${s.sevk_sehri || ''} ${s.gonderim_sekli || ''} ${s.aciklama || ''}`).includes(q)));
    const tot = f.filter((s) => s.durum !== 'İptal').reduce((a, s) => a + num(s.genel_toplam), 0);
    $('#sum').textContent = `${f.length} sipariş · toplam ${fmtTL(tot)}`;
    $('#lst').innerHTML = f.length ? f.slice(0, 400).map((s) => siparisRow(s)).join('') + (f.length > 400 ? '<div class="empty">İlk 400 sipariş gösteriliyor, aramayı daraltın</div>' : '') : '<div class="empty">Sipariş bulunamadı</div>';
    bindRows($('#lst'));
  };
  $('#q').oninput = (e) => { ui.q = e.target.value; draw(); };
  $('#c1').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.d) ui.durum = b.dataset.d; if (b.dataset.t) ui.tip = b.dataset.t;
    $$('#c1 .chip').forEach((c) => c.classList.toggle('on', (c.dataset.d && c.dataset.d === ui.durum) || (c.dataset.t && c.dataset.t === ui.tip)));
    draw();
  };
  draw();
}

async function viewSiparisDetay(id) {
  topbar('Sipariş', { back: true });
  const [[s], kal] = await Promise.all([
    api.get('v_siparisler', `select=*&id=eq.${id}`),
    api.get('siparis_kalemleri', `select=*,urunler(ad,kod,birim)&siparis_id=eq.${id}&order=id.asc`)
  ]);
  if (!s) { $('#view').innerHTML = '<div class="card empty">Sipariş bulunamadı</div>'; return; }
  topbar(`Fiş ${s.fis_no}`, { back: true, actions: `<button class="tb-btn" id="prt">${icon('print')}</button>` });
  $('#view').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><div style="font-size:19px;font-weight:800"><a href="#/cari/${s.cari_id}">${esc(s.cari_unvan)}</a></div>
          <div class="st muted small" style="margin-top:4px">${tipBadge(s.fatura_tipi)} ${durumBadge(s.durum)} ${s.cari_tip === 'Perakende' ? '<span class="badge">Perakende</span>' : ''}</div></div>
        <div class="right"><div class="tiny">Genel toplam</div><div style="font-size:21px;font-weight:800" class="num">${fmtTL(s.genel_toplam)}</div></div>
      </div>
      <div class="kv" style="margin-top:14px">
        <span class="k">Sipariş tarihi</span><span>${fmtD(s.tarih)}</span>
        <span class="k">Sevk tarihi</span><span>${fmtD(s.sevk_tarihi)}</span>
        <span class="k">Gönderim</span><span>${esc(s.gonderim_sekli || '–')}</span>
        <span class="k">Sevk şehri</span><span>${esc(s.sevk_sehri || '–')}</span>
        ${s.para_birimi && s.para_birimi !== 'TRY' ? `<span class="k">Para birimi</span><span><b>${s.para_birimi}</b> · kur ${fmtN(s.kur)} ₺ · döviz toplamı <b>${fmtPB(num(s.genel_toplam) / num(s.kur), s.para_birimi)}</b></span>` : ''}
        <span class="k">Kâr yöntemi</span><span><span class="seg" id="d-yon" style="display:inline-flex;padding:2px"><button type="button" data-v="FIFO" style="padding:4px 12px">FIFO</button><button type="button" data-v="LIFO" style="padding:4px 12px">LIFO</button></span></span>
        ${s.aciklama ? `<span class="k">Açıklama</span><span>${esc(s.aciklama)}</span>` : ''}
      </div>
    </div>
    <div class="list"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th class="r">Tutar</th></tr></thead>
      <tbody>${kal.map((k) => `<tr><td>${esc(k.urunler?.ad)}<div class="tiny">${esc(k.urunler?.kod)}</div></td><td class="r">${fmtN(k.miktar)} ${esc(k.urunler?.birim || '')}</td><td class="r">${fmtTL(k.birim_fiyat)}${k.doviz_fiyat !== null && k.doviz_fiyat !== undefined && s.para_birimi !== 'TRY' ? `<div class="tiny">${fmtPB(k.doviz_fiyat, s.para_birimi)}</div>` : ''}</td><td class="r">${fmtTL(k.tutar)}${k.doviz_fiyat !== null && k.doviz_fiyat !== undefined && s.para_birimi !== 'TRY' ? `<div class="tiny">${fmtPB(num(k.doviz_fiyat) * num(k.miktar), s.para_birimi)}</div>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="3" class="r">Ara toplam</td><td class="r">${fmtTL(s.ara_toplam)}</td></tr>
        ${s.fatura_tipi === 'R' ? `<tr><td colspan="3" class="r">KDV (%${fmtN(num(s.kdv_orani) * 100)})</td><td class="r">${fmtTL(s.kdv_tutari)}</td></tr>` : ''}
        <tr><td colspan="3" class="r">Genel toplam</td><td class="r">${fmtTL(s.genel_toplam)}</td></tr>
      </tfoot></table></div></div>
    <div id="kar-kart"></div>
    <div class="btn-row">
      ${s.durum === 'Beklemede' ? `<button class="btn green" id="b-sevk">${icon('truck')}Sevk et</button>` : ''}
      ${s.durum !== 'İptal' ? `<button class="btn primary" id="b-duz">${icon('edit')}Düzenle</button>` : ''}
      ${s.durum !== 'İptal' ? `<button class="btn red" id="b-iptal">${icon('x')}Siparişi iptal et</button>` : ''}
    </div>`;
  $('#b-sevk')?.addEventListener('click', () => sevkEt(s.id, s.fis_no));
  $('#b-duz')?.addEventListener('click', () => go(`#/siparis/${s.id}/duzenle`));
  $('#b-iptal')?.addEventListener('click', async () => {
    const msg = s.durum === 'Sevk Edildi'
      ? 'Bu sipariş sevk edilmiş. İptal edilirse ürünler stoğa <b>iade</b> olarak geri girer ve carinin borcu ters kayıtla kapatılır.'
      : 'Sipariş iptal edilecek ve carinin borcu ters kayıtla kapatılacak.';
    if (!await confirmBox(`Fiş ${s.fis_no} iptal edilsin mi?`, msg, 'İptal et', true)) return;
    try { await api.rpc('siparis_iptal', { p_siparis_id: s.id }); cache.dirty('urunler', 'cariler'); toast(`Fiş ${s.fis_no} iptal edildi`, 'ok'); render(); } catch (e) { fail(e); }
  });
  $('#prt').onclick = () => printFis(s, kal);
  $$('#d-yon button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.maliyet_yontemi));
  $('#d-yon').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === s.maliyet_yontemi) return;
    try { await api.update('siparisler', `id=eq.${s.id}`, { maliyet_yontemi: b.dataset.v }); toast(`Kâr yöntemi ${b.dataset.v} yapıldı`, 'ok'); render(); } catch (err) { fail(err); }
  };
  if (s.durum === 'Sevk Edildi') {
    api.rpc('kar_raporu', { p_baslangic: null, p_bitis: null, p_yontem: null }).then((rows) => {
      const r = rows.filter((x) => x.siparis_id === s.id); if (!r.length || !$('#kar-kart')) return;
      const sat = r.reduce((a, x) => a + num(x.satis_tutari), 0), mal = r.reduce((a, x) => a + num(x.maliyet), 0), ek = r.reduce((a, x) => a + num(x.maliyetsiz_miktar), 0);
      $('#kar-kart').innerHTML = `<div class="card"><h2>Kâr (${esc(s.maliyet_yontemi)})</h2><div class="stats">
        <div class="stat"><div class="l">Satış</div><div class="v">${fmtTL(sat)}</div></div>
        <div class="stat"><div class="l">Maliyet</div><div class="v">${fmtTL(mal)}</div></div>
        <div class="stat"><div class="l">Kâr</div><div class="v zero">${fmtTL(sat - mal)}</div></div></div>
        ${ek > 0 ? `<p class="tiny" style="margin:8px 0 0;color:var(--orange)">${fmtN(ek)} birimin alış maliyeti girilmemiş; kâr olduğundan yüksek görünür. <a href="#/stok/hareketler">Maliyet gir →</a></p>` : ''}</div>`;
    }).catch(() => {});
  }
}

function sevkEt(id, fis) {
  modal({
    title: `Fiş ${fis} sevk edilsin mi?`,
    body: `<p class="muted small" style="margin-top:0">Sevk edilince ürünler real stoktan düşer.</p>
      <div class="field"><label>Sevk tarihi</label><input class="input" type="date" id="sv-t" value="${today()}"></div>`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn green" id="sv-ok">${icon('truck')}Sevk et</button>`,
    onMount: (m) => {
      $('#sv-ok', m.el).onclick = async (e) => {
        try {
          await busy(e.currentTarget, () => api.rpc('siparis_sevk', { p_siparis_id: id, p_sevk_tarihi: $('#sv-t', m.el).value || today() }));
          m.close(); cache.dirty('urunler'); toast(`Fiş ${fis} sevk edildi`, 'ok'); render();
        } catch (err) { fail(err); }
      };
    }
  });
}

function printFis(s, kal) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const ad = `Fis-${s.fis_no}.png`;
  modal({
    title: `Fiş ${s.fis_no} · yazdır / paylaş`,
    body: `<p class="small muted" style="margin-top:0">${ios ? 'iPhone/iPad: “Paylaş”a basın, açılan menüden <b>Yazdır</b>, WhatsApp veya Dosyalar’a Kaydet’i seçin.' : 'Yazıcıya göndermek için “Yazdır”, görsel olarak göndermek için “Paylaş” ya da “İndir”.'}</p>
      <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff"><img id="fis-img" style="width:100%;display:block" alt="Fiş"></div>`,
    foot: `${!(ios && standalone) ? '<button class="btn" id="fp-print">' + icon('print') + 'Yazdır</button>' : ''}
      <button class="btn" id="fp-dl">${icon('download')}İndir</button>
      ${navigator.canShare ? '<button class="btn primary" id="fp-share">Paylaş' + (ios ? ' / Yazdır' : '') + '</button>' : ''}`,
    onMount: (m) => {
      const cv = fisCanvas(s, kal);
      $('#fis-img', m.el).src = cv.toDataURL('image/png');
      const blobP = new Promise((res) => cv.toBlob(res, 'image/png'));
      $('#fp-print', m.el)?.addEventListener('click', () => {
        $('#print-root').innerHTML = `<img src="${cv.toDataURL('image/png')}" style="width:100%">`;
        setTimeout(() => window.print(), 50);
      });
      $('#fp-dl', m.el).onclick = async () => {
        const b = await blobP; const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = ad; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      };
      $('#fp-share', m.el)?.addEventListener('click', async () => {
        try {
          const file = new File([await blobP], ad, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Fiş ${s.fis_no}` });
          else $('#fp-dl', m.el).click();
        } catch (e) { if (e.name !== 'AbortError') fail(e); }
      });
    }
  });
}

/* Fisi A5 benzeri bir gorsele cizer (Turkce karakterler sorunsuz) */
function fisCanvas(s, kal) {
  const W = 1240, pad = 70, rowH = 52;
  const H = 560 + kal.length * rowH + (s.aciklama ? 80 : 0) + 260;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const F = (w, sz) => `${w} ${sz}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#16213a'; c.fillRect(0, 0, W, 150);
  c.fillStyle = '#fff'; c.font = F(800, 46); c.textBaseline = 'middle';
  c.fillText(state.ayarlar?.firma_adi || 'Firmam', pad, 62);
  c.font = F(500, 26); c.fillStyle = '#c9d2e6'; c.fillText('Sipariş Fişi', pad, 112);
  c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = F(800, 44); c.fillText(`#${s.fis_no}`, W - pad, 62);
  c.font = F(600, 26); c.fillStyle = '#c9d2e6'; c.fillText(`${fmtD(s.tarih)} · ${s.fatura_tipi}`, W - pad, 112);
  c.textAlign = 'left';
  let y = 210;
  c.fillStyle = '#5b6578'; c.font = F(600, 24); c.fillText('MÜŞTERİ', pad, y);
  c.fillStyle = '#16213a'; c.font = F(800, 36); c.fillText(s.cari_unvan || '', pad, y + 44);
  c.fillStyle = '#5b6578'; c.font = F(500, 26);
  c.fillText([s.sevk_sehri, s.gonderim_sekli, s.durum].filter(Boolean).join('  ·  '), pad, y + 90);
  y = 370;
  const cols = [pad, 690, 900, W - pad];
  c.fillStyle = '#f1f4f9'; c.fillRect(pad - 10, y - 30, W - 2 * pad + 20, 60);
  c.fillStyle = '#5b6578'; c.font = F(700, 24);
  c.fillText('ÜRÜN', cols[0], y); c.textAlign = 'right';
  c.fillText('MİKTAR', cols[1] + 60, y); c.fillText('BİRİM FİYAT', cols[2] + 90, y); c.fillText('TUTAR', cols[3], y); c.textAlign = 'left';
  y += 58;
  kal.forEach((k) => {
    c.fillStyle = '#16213a'; c.font = F(600, 28);
    let ad = k.urunler?.ad || ''; while (c.measureText(ad).width > 520 && ad.length > 3) ad = ad.slice(0, -2);
    c.fillText(ad, cols[0], y);
    c.textAlign = 'right'; c.font = F(500, 28);
    c.fillText(`${fmtN(k.miktar)} ${k.urunler?.birim || ''}`, cols[1] + 60, y);
    c.fillText(fmtTL(k.birim_fiyat), cols[2] + 90, y);
    c.font = F(700, 28); c.fillText(fmtTL(k.tutar), cols[3], y); c.textAlign = 'left';
    c.strokeStyle = '#e3e7ef'; c.lineWidth = 2; c.beginPath(); c.moveTo(pad - 10, y + 26); c.lineTo(W - pad + 10, y + 26); c.stroke();
    y += rowH;
  });
  y += 30;
  const tr = (l, v, big) => { c.textAlign = 'right'; c.fillStyle = big ? '#16213a' : '#5b6578'; c.font = F(big ? 800 : 600, big ? 36 : 28); c.fillText(l, 880, y); c.fillText(v, W - pad, y); c.textAlign = 'left'; y += big ? 60 : 46; };
  tr('Ara toplam', fmtTL(s.ara_toplam));
  if (s.fatura_tipi === 'R') tr(`KDV (%${fmtN(num(s.kdv_orani) * 100)})`, fmtTL(s.kdv_tutari));
  c.strokeStyle = '#16213a'; c.lineWidth = 3; c.beginPath(); c.moveTo(620, y - 22); c.lineTo(W - pad, y - 22); c.stroke(); y += 12;
  tr('GENEL TOPLAM', fmtTL(s.genel_toplam), true);
  if (s.para_birimi && s.para_birimi !== 'TRY') tr(`${s.para_birimi} karşılığı (kur ${fmtN(s.kur)})`, fmtPB(num(s.genel_toplam) / num(s.kur), s.para_birimi));
  if (s.aciklama) { y += 10; c.fillStyle = '#5b6578'; c.font = F(500, 26); c.fillText('Not: ' + s.aciklama, pad, y); y += 40; }
  const out = document.createElement('canvas'); out.width = W; out.height = Math.min(H, y + 40);
  out.getContext('2d').drawImage(cv, 0, 0);
  return out;
}

/* ---------- Yeni siparis ---------- */
async function viewSiparisDuzenle(id) { return viewSiparisYeni(null, id); }
async function viewSiparisYeni(cariId, editId = null) {
  topbar(editId ? 'Siparişi Düzenle' : 'Yeni Sipariş', { back: true });
  const [ayar, urunler, cariler] = await Promise.all([cache.ayarlar(), cache.urunler(true), cache.cariler()]);
  const f = { pb: 'TRY', kur: 1, yon: ayar.maliyet_yontemi || 'FIFO', cari: null, tip: 'R', gonderim: '', tarih: today(), kdv: num(ayar.kdv_orani) * 100, aciklama: '', sevk: false, fiyatKaydet: true, lines: [], mf: {}, orig: {} };
  let es = null, ekal = [];
  if (editId) {
    [[es], ekal] = await Promise.all([api.get('v_siparisler', `select=*&id=eq.${editId}`), api.get('siparis_kalemleri', `select=*&siparis_id=eq.${editId}&order=id.asc`)]);
    if (!es) { $('#view').innerHTML = '<div class="card empty">Sipariş bulunamadı</div>'; return; }
    if (es.durum === 'İptal') { $('#view').innerHTML = '<div class="card empty">İptal edilmiş sipariş düzenlenemez</div>'; return; }
    topbar(`Fiş ${es.fis_no} · düzenle`, { back: true });
    Object.assign(f, { pb: es.para_birimi || 'TRY', kur: num(es.kur) || 1, yon: es.maliyet_yontemi || f.yon, tip: es.fatura_tipi, tarih: es.tarih, kdv: es.fatura_tipi === 'R' ? num(es.kdv_orani) * 100 : f.kdv, aciklama: es.aciklama || '' });
    ekal.forEach((k) => { f.orig[k.urun_id] = (f.orig[k.urun_id] || 0) + num(k.miktar); });
  }
  const avail = (u) => num(u.sevk_sonrasi_stok) + (f.orig[u.id] || 0);
  const aktifUrun = () => urunler.filter((u) => u.aktif);
  $('#view').innerHTML = `
    <div class="card">
      <div class="field picker"><label>Cari</label>
        <input class="input" id="f-cari" placeholder="Cari ara veya yeni ekle…" autocomplete="off" ${editId ? 'readonly style="background:var(--surface-2)"' : ''}>
        <div class="hint" id="cari-info"></div></div>
      <div class="grid2">
        <div class="field"><label>Fatura tipi</label><div class="seg" id="f-tip"><button type="button" data-v="R" class="r">R</button><button type="button" data-v="GR" class="gr">GR</button></div></div>
        <div class="field" id="kdv-f"><label>KDV oranı (%)</label><input class="input" id="f-kdv" inputmode="decimal" value="${fmtN(f.kdv)}"></div>
      </div>
      ${dovizHtml('f-dv', f.pb, f.pb === 'TRY' ? '' : f.kur)}
      <div class="grid2">
        <div class="field"><label>Gönderim şekli</label><select class="input" id="f-gon"><option value="">Seçin…</option>${(ayar.gonderim_sekilleri || []).map((g) => `<option>${esc(g)}</option>`).join('')}</select></div>
        <div class="field"><label>Sipariş tarihi</label><input class="input" type="date" id="f-tarih" value="${f.tarih}"></div>
      </div>
      <div class="field" style="margin-bottom:0"><label>Kâr hesabı yöntemi</label><div class="seg" id="f-yon"><button type="button" data-v="FIFO">FIFO</button><button type="button" data-v="LIFO">LIFO</button></div>
        <div class="hint">FIFO: önce en eski alış partisinin maliyeti düşülür · LIFO: önce en son alışın maliyeti düşülür</div></div>
    </div>
    <div class="section-title">Ürünler</div>
    <div class="lines" id="lines"></div>
    <button class="btn block" id="add-line" style="margin-bottom:14px">${icon('plus')}Ürün ekle</button>
    <div class="card">
      <div class="totals" id="totals"></div>
      <div class="field" style="margin-top:12px"><label>Açıklama</label><textarea class="input" id="f-acik" placeholder="İsteğe bağlı not"></textarea></div>
      ${editId ? `<p class="tiny" style="margin:4px 0">Durum: <b>${esc(es.durum)}</b>${es.durum === 'Sevk Edildi' ? ' · stok çıkışları yeni miktarlara göre düzeltilir' : ''}. Cari değiştirmek için siparişi iptal edip yenisini açın.</p>` : '<label class="check"><input type="checkbox" id="f-sevk"> Sevk edildi olarak kaydet (stoktan hemen düşer)</label>'}
      <label class="check"><input type="checkbox" id="f-mf" checked> Değişen fiyatları bu müşterinin fiyatı olarak kaydet</label>
    </div>
    <button class="btn primary block" id="save" style="padding:14px;font-size:16px">${editId ? 'Değişiklikleri kaydet' : 'Siparişi kaydet'}</button>`;

  const setTip = (t) => { f.tip = t; $$('#f-tip button').forEach((b) => b.classList.toggle('on', b.dataset.v === t)); $('#kdv-f').style.opacity = t === 'R' ? 1 : 0.35; $('#f-kdv').disabled = t !== 'R'; drawTotals(); };
  $('#f-tip').onclick = (e) => { const b = e.target.closest('button'); if (b) setTip(b.dataset.v); };
  const setYon = (v) => { f.yon = v; $$('#f-yon button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
  setYon(f.yon); $('#f-yon').onclick = (e) => { const b = e.target.closest('button'); if (b) setYon(b.dataset.v); };
  const dvz = bindDoviz($('#view'), 'f-dv', (yeni, eski) => {
    if (yeni.pb !== eski.pb) {
      // birim degisti: satir fiyatlarini TL uzerinden yeni birime cevir
      f.lines.forEach((l) => {
        if (!l.urun || l.fiyat === '') return;
        if (!l.manuel) { f.pb = yeni.pb; f.kur = yeni.kur; l.fiyat = priceFor(l.urun); return; }
        const tl = num(l.fiyat) * (eski.pb === 'TRY' ? 1 : (eski.kur > 0 ? eski.kur : NaN));
        l.fiyat = yeni.pb === 'TRY' ? Math.round(tl * 100) / 100 : (yeni.kur > 0 && !isNaN(tl) ? Math.round((tl / yeni.kur) * 100) / 100 : l.fiyat);
      });
      f.pb = yeni.pb; f.kur = yeni.kur; drawLines();
    } else { f.pb = yeni.pb; f.kur = yeni.kur; drawTotals(); }
  });

  const setCari = async (c) => {
    f.cari = c;
    $('#f-cari').value = c.unvan;
    $('#cari-info').innerHTML = `${c.tip === 'Perakende' ? '<span class="badge">Perakende · otomatik tahsilat</span>' : '<span class="badge b-blue">Toptan</span>'} ${esc(c.sehir || '')} · Bakiye <b class="${balCls(c.bakiye)}">${fmtTL(c.bakiye)}</b> (R ${fmtTL(c.bakiye_r)} · GR ${fmtTL(c.bakiye_gr)})`;
    if (c.tip === 'Perakende') { $('#f-mf').checked = false; if (!$('#f-gon').value && ayar.perakende_gonderimler?.[0]) $('#f-gon').value = ayar.perakende_gonderimler[0]; }
    else $('#f-mf').checked = true;
    try {
      const mf = await api.get('musteri_fiyatlari', `select=urun_id,fiyat,para_birimi&cari_id=eq.${c.id}`);
      f.mf = Object.fromEntries(mf.map((x) => [x.urun_id, { fiyat: num(x.fiyat), pb: x.para_birimi || 'TRY' }]));
      f.lines.forEach((l) => { if (l.urun && !l.manuel) l.fiyat = priceFor(l.urun); });
      drawLines();
    } catch (e) { fail(e); }
  };
  /* Secili para biriminde fiyat: ayni birimde musteri fiyati varsa o, yoksa TL fiyat / kur */
  const priceFor = (u) => {
    const m = f.mf[u.id];
    if (m && m.pb === f.pb) return m.fiyat;
    let tl = m ? (m.pb === 'TRY' ? m.fiyat : (num(sonKur(m.pb)) > 0 ? m.fiyat * num(sonKur(m.pb)) : null)) : null;
    if (tl === null) tl = num(u.satis_fiyati);
    return f.pb === 'TRY' ? tl : (f.kur > 0 ? Math.round((tl / f.kur) * 100) / 100 : '');
  };
  const mfTxt = (u) => (f.mf[u.id] ? fmtPB(f.mf[u.id].fiyat, f.mf[u.id].pb) : '');

  if (!editId) picker($('#f-cari'), {
    items: () => cariler.filter((c) => c.aktif), label: (c) => c.unvan,
    sub: (c) => `${esc(c.kod)} · ${esc(c.sehir || '')} · ${c.tip} · bakiye ${fmtTL(c.bakiye)}`,
    onPick: setCari, addText: 'Yeni cari ekle',
    onAdd: (v) => cariForm(null, { unvan: v }, async (c) => { cache.dirty('cariler'); const all = await cache.cariler(); cariler.splice(0, cariler.length, ...all); setCari(all.find((x) => x.id === c.id) || c); })
  });

  const drawLines = () => {
    $('#lines').innerHTML = f.lines.map((l, i) => {
      const u = l.urun;
      const stokUyari = u && num(l.miktar) > avail(u);
      return `<div class="line" data-i="${i}">
        <div class="picker" style="display:flex;gap:6px"><input class="input l-urun" placeholder="Ürün ara…" value="${esc(u?.ad || '')}" autocomplete="off"><button class="icon-btn l-del" title="Kaldır">${icon('trash')}</button></div>
        <div class="lr">
          <div class="field"><label>Miktar</label><input class="input l-mik" inputmode="decimal" value="${l.miktar === '' ? '' : fmtN(l.miktar)}"></div>
          <div class="field"><label>Birim fiyat ${PB[f.pb]}</label><input class="input l-fiy" inputmode="decimal" value="${l.fiyat === '' ? '' : fmtN(l.fiyat)}"></div>
          <div class="field"><label>Tutar</label><input class="input l-tut" readonly value="${fmt2(num(l.miktar) * num(l.fiyat))}" style="background:var(--surface-2)"></div>
        </div>
        ${u ? `<div class="info"><span>Real: <b>${fmtN(u.real_stok)}</b></span><span>${f.orig[u.id] ? 'Kullanılabilir' : 'Sevk sonrası'}: <b class="${stokUyari ? 'pos' : ''}">${fmtN(avail(u))}</b> ${esc(u.birim)}</span>
          ${f.mf[u.id] ? `<span class="badge b-green">Müşteri fiyatı ${mfTxt(u)}</span>` : `<span class="tiny">Liste fiyatı ${fmtTL(u.satis_fiyati)}</span>`}
          <span class="badge b-orange l-warn ${stokUyari ? '' : 'hidden'}">Stok yetersiz</span></div>` : ''}
      </div>`;
    }).join('');
    $$('#lines .line').forEach((el) => {
      const i = +el.dataset.i, l = f.lines[i];
      picker($('.l-urun', el), {
        items: aktifUrun, label: (u) => u.ad, sub: (u) => `${esc(u.kod)} · sevk sonrası ${fmtN(u.sevk_sonrasi_stok)} ${esc(u.birim)}${f.mf[u.id] ? ' · müşteri fiyatı ' + mfTxt(u) : ''}`,
        onPick: (u) => { l.urun = u; l.manuel = false; l.fiyat = priceFor(u); if (l.miktar === '') l.miktar = 1; if (i === f.lines.length - 1) f.lines.push({ urun: null, miktar: '', fiyat: '' }); drawLines(); setTimeout(() => $(`.line[data-i="${i}"] .l-mik`)?.select(), 30); },
        addText: 'Yeni ürün ekle',
        onAdd: (v) => urunForm(null, { ad: v }, async (u) => { cache.dirty('urunler'); const all = await cache.urunler(); urunler.splice(0, urunler.length, ...all); l.urun = all.find((x) => x.id === u.id); l.fiyat = priceFor(l.urun); l.miktar = 1; drawLines(); })
      });
      const upd = () => {
        $('.l-tut', el).value = fmt2(num(l.miktar) * num(l.fiyat));
        const w = $('.l-warn', el); if (w && l.urun) w.classList.toggle('hidden', !(num(l.miktar) > avail(l.urun)));
        drawTotals();
      };
      $('.l-mik', el).oninput = (e) => { const v = parseNum(e.target.value); l.miktar = isNaN(v) ? '' : v; upd(); };
      $('.l-fiy', el).oninput = (e) => { const v = parseNum(e.target.value); l.fiyat = isNaN(v) ? '' : v; l.manuel = true; upd(); };
      $('.l-del', el).onclick = () => { f.lines.splice(i, 1); if (!f.lines.length) f.lines.push({ urun: null, miktar: '', fiyat: '' }); drawLines(); };
    });
    drawTotals();
  };
  const drawTotals = () => {
    const kur = f.pb === 'TRY' ? 1 : f.kur;
    const araD = f.lines.reduce((a, l) => a + num(l.miktar) * num(l.fiyat), 0);
    const ara = f.lines.reduce((a, l) => a + Math.round(num(l.miktar) * Math.round(num(l.fiyat) * kur * 100) / 100 * 100) / 100, 0);
    const kdvO = f.tip === 'R' ? (parseNum($('#f-kdv')?.value) || 0) / 100 : 0;
    const kdv = Math.round(ara * kdvO * 100) / 100;
    const dv = f.pb !== 'TRY';
    $('#totals').innerHTML = `${dv ? `<div class="tr"><span class="muted">Döviz toplamı (KDV hariç)</span><span>${fmtPB(araD, f.pb)}</span></div>` : ''}
      <div class="tr"><span class="muted">Ara toplam${dv ? ' (TL)' : ''}</span><span>${f.pb !== 'TRY' && !(f.kur > 0) ? '<span class="tiny" style="color:var(--red)">kur girin</span>' : fmtTL(ara)}</span></div>
      ${f.tip === 'R' ? `<div class="tr"><span class="muted">KDV (%${fmtN(kdvO * 100)})</span><span>${fmtTL(kdv)}</span></div>` : '<div class="tr"><span class="muted">KDV</span><span class="tiny">GR — KDV eklenmez</span></div>'}
      <div class="tr big"><span>Genel toplam</span><span>${fmtTL(ara + kdv)}</span></div>
      ${dv ? `<div class="tiny">${fmtPB(araD * (1 + kdvO), f.pb)} × ${fmtN(f.kur)} = ${fmtTL(ara + kdv)} cariye TL olarak işlenir</div>` : ''}
      ${f.cari?.tip === 'Perakende' ? '<div class="tiny">Perakende cari: aynı tutarda tahsilat otomatik girilir, bakiye sıfır kalır.</div>' : ''}`;
  };
  $('#f-kdv').oninput = drawTotals;
  $('#add-line').onclick = () => { if (f.lines[f.lines.length - 1]?.urun) f.lines.push({ urun: null, miktar: '', fiyat: '' }); drawLines(); setTimeout(() => $$('#lines .l-urun').pop()?.focus(), 30); };

  if (editId) {
    ekal.forEach((k) => { const u = urunler.find((x) => x.id === k.urun_id); if (u) f.lines.push({ urun: u, miktar: num(k.miktar), fiyat: f.pb !== 'TRY' && k.doviz_fiyat !== null ? num(k.doviz_fiyat) : num(k.birim_fiyat), manuel: true }); });
    const g = $('#f-gon'); if (es.gonderim_sekli && ![...g.options].some((o) => o.value === es.gonderim_sekli)) g.insertAdjacentHTML('beforeend', `<option>${esc(es.gonderim_sekli)}</option>`);
    g.value = es.gonderim_sekli || ''; $('#f-acik').value = f.aciklama;
  }
  f.lines.push({ urun: null, miktar: '', fiyat: '' });
  setTip(f.tip); drawLines();
  if (editId) { const c = cariler.find((x) => x.id === es.cari_id); if (c) { await setCari(c); $('#f-mf').checked = false; } }
  if (cariId) { const c = cariler.find((x) => x.id === +cariId); if (c) setCari(c); }

  $('#save').onclick = async (e) => {
    const lines = f.lines.filter((l) => l.urun);
    if (!f.cari) return toast('Önce cari seçin', 'err');
    if (!lines.length) return toast('En az bir ürün ekleyin', 'err');
    const bad = lines.find((l) => !(num(l.miktar) > 0) || l.fiyat === '' || num(l.fiyat) < 0);
    if (bad) return toast(`${bad.urun.ad}: miktar ve fiyatı kontrol edin`, 'err');
    const kdvO = (parseNum($('#f-kdv').value) || 0) / 100;
    if (f.tip === 'R' && (kdvO < 0 || kdvO >= 1)) return toast('KDV oranı 0 ile 99 arasında olmalı', 'err');
    const dv = dvz.check(); if (!dv) return;
    const tlF = (l) => Math.round(num(l.fiyat) * dv.kur * 100) / 100;
    const eksik = lines.filter((l) => num(l.miktar) > avail(l.urun));
    if (eksik.length && !await confirmBox('Stok yetersiz', `Şu ürünlerde yeterli stok yok:<br>${eksik.map((l) => `• ${esc(l.urun.ad)} (kullanılabilir ${fmtN(avail(l.urun))}, istenen ${fmtN(l.miktar)})`).join('<br>')}<br><br>Yine de kaydedilsin mi?`, 'Kaydet')) return;
    const sevk = !editId && $('#f-sevk').checked;
    try {
      const r = await busy(e.currentTarget, async () => {
        const ortak = {
          p_kalemler: lines.map((l) => ({ urun_id: l.urun.id, miktar: num(l.miktar), birim_fiyat: tlF(l) })),
          p_fatura_tipi: f.tip, p_gonderim_sekli: $('#f-gon').value || null, p_tarih: $('#f-tarih').value || today(),
          p_kdv_orani: f.tip === 'R' ? kdvO : 0, p_aciklama: $('#f-acik').value || null, p_sevk_sehri: null, p_maliyet_yontemi: f.yon
        };
        const res = editId ? await api.rpc('siparis_guncelle', { p_siparis_id: +editId, ...ortak }) : await api.rpc('siparis_kaydet', { p_cari_id: f.cari.id, ...ortak });
        if (dv.pb !== 'TRY' || (editId && es.para_birimi !== 'TRY')) await api.rpc('siparis_doviz', { p_siparis_id: res.id, p_para_birimi: dv.pb, p_kur: dv.kur, p_fiyatlar: lines.map((l) => num(l.fiyat)) });
        if (sevk) await api.rpc('siparis_sevk', { p_siparis_id: res.id, p_sevk_tarihi: $('#f-tarih').value || today() });
        if ($('#f-mf').checked) {
          const ups = lines.filter((l) => { const m = f.mf[l.urun.id]; return !m ? !(dv.pb === 'TRY' && num(l.fiyat) === num(l.urun.satis_fiyati)) : (m.pb !== dv.pb || num(l.fiyat) !== m.fiyat); })
            .map((l) => ({ cari_id: f.cari.id, urun_id: l.urun.id, fiyat: num(l.fiyat), para_birimi: dv.pb, tarih: today() }));
          const uniq = Object.values(Object.fromEntries(ups.map((x) => [x.urun_id, x])));
          if (uniq.length) await api.insert('musteri_fiyatlari', uniq, { upsert: true, onConflict: 'cari_id,urun_id' });
        }
        return res;
      });
      cache.dirty('urunler', 'cariler');
      toast(`Fiş ${r.fis_no} ${editId ? 'güncellendi' : 'kaydedildi'} · ${fmtTL(r.genel_toplam)}`, 'ok');
      go(`#/siparis/${r.id}`);
    } catch (err) { fail(err); }
  };
}

/* ------------------------------------------------------------------ */
/* STOK                                                                */
/* ------------------------------------------------------------------ */
const stokBadge = (d) => `<span class="badge ${d === 'Yeterli' ? 'b-green' : d === 'KRİTİK' ? 'b-orange' : 'b-red'}">${esc(d)}</span>`;
function urunRow(u) {
  return `<div class="row" data-go="#/urun/${u.id}">
    <div class="main-col"><div class="t">${esc(u.ad)}</div>
      <div class="st"><span class="tiny">${esc(u.kod)}</span>${stokBadge(u.durum)}${num(u.bekleyen_siparis) ? `<span class="badge b-purple">${fmtN(u.bekleyen_siparis)} bekleyen</span>` : ''}</div></div>
    <div class="end"><div class="amt">${fmtN(u.sevk_sonrasi_stok)} <span class="tiny">${esc(u.birim)}</span></div><div class="tiny">real ${fmtN(u.real_stok)}</div></div>
  </div>`;
}

async function viewStok() {
  topbar('Stok', { actions: `<button class="tb-btn" onclick="malAlisi()">${icon('inbox')}Mal alışı</button>` });
  const ui = state.ui.stok ||= { f: 'Hareketli', q: '' };
  const data = await cache.urunler(true);
  const wide = window.matchMedia('(min-width: 900px)').matches;
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" placeholder="Ürün adı veya kod ara…" value="${esc(ui.q)}"></div>
      <button class="btn sm" onclick="urunForm()">${icon('plus')}Yeni ürün</button>
      <button class="btn sm" onclick="stokDuzelt()">${icon('edit')}Sayım / fire</button>
      <button class="btn sm" onclick="go('#/stok/hareketler')">${icon('list')}Hareketler</button></div>
    <div class="chips" id="c1">${['Hareketli', 'Kritik', 'Tümü', 'Pasif'].map((d) => `<button class="chip ${ui.f === d ? 'on' : ''}" data-f="${d}">${d === 'Hareketli' ? 'Stokta / hareketli' : d}</button>`).join('')}</div>
    <p class="tiny" style="margin:0 4px 10px"><b>Real</b>: depoda fiilen olan. <b>Sevk sonrası</b>: bekleyen siparişler gönderildikten sonra kalacak miktar.</p>
    <div id="lst"></div>`;
  const draw = () => {
    const q = norm(ui.q);
    const f = data.filter((u) => {
      if (ui.f === 'Pasif') { if (u.aktif) return false; } else if (!u.aktif) return false;
      if (ui.f === 'Hareketli' && !(num(u.toplam_giris) || num(u.toplam_cikis) || num(u.bekleyen_siparis))) return false;
      if (ui.f === 'Kritik' && u.durum === 'Yeterli') return false;
      return !q || norm(`${u.ad} ${u.kod} ${u.kategori || ''}`).includes(q);
    });
    if (!f.length) { $('#lst').innerHTML = '<div class="list"><div class="empty">Ürün bulunamadı</div></div>'; return; }
    $('#lst').innerHTML = wide
      ? `<div class="list"><div class="table-wrap"><table class="tbl"><thead><tr><th>Kod</th><th>Ürün</th><th class="r">Giriş</th><th class="r">Sevk edilen</th><th class="r">Real</th><th class="r">Bekleyen</th><th class="r">Sevk sonrası</th><th class="r">Son alış</th><th>Durum</th></tr></thead>
        <tbody>${f.map((u) => `<tr class="click" data-go="#/urun/${u.id}"><td class="tiny">${esc(u.kod)}</td><td><b>${esc(u.ad)}</b></td><td class="r">${fmtN(u.toplam_giris)}</td><td class="r">${fmtN(u.toplam_cikis)}</td><td class="r"><b>${fmtN(u.real_stok)}</b></td><td class="r">${num(u.bekleyen_siparis) ? fmtN(u.bekleyen_siparis) : '–'}</td><td class="r"><b>${fmtN(u.sevk_sonrasi_stok)}</b> <span class="tiny">${esc(u.birim)}</span></td><td class="r">${u.son_alis_fiyati !== null ? fmtTL(u.son_alis_fiyati) : '<span class="tiny">–</span>'}</td><td>${stokBadge(u.durum)}</td></tr>`).join('')}</tbody></table></div></div>`
      : `<div class="list">${f.map(urunRow).join('')}</div>`;
    bindRows($('#lst'));
  };
  $('#q').oninput = (e) => { ui.q = e.target.value; draw(); };
  $('#c1').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; ui.f = b.dataset.f; $$('#c1 .chip').forEach((c) => c.classList.toggle('on', c === b)); draw(); };
  draw();
}

const islemBadge = (h) => `<span class="badge ${h.tur === 'Giriş' ? 'b-green' : 'b-red'}">${esc(h.islem)}</span>`;
async function viewUrunDetay(id) {
  topbar('Ürün', { back: true });
  const [[u], har] = await Promise.all([
    api.get('v_stok', `select=*&id=eq.${id}`),
    api.get('stok_hareketleri', `select=*,siparisler(fis_no,cariler(unvan))&urun_id=eq.${id}&order=tarih.desc,id.desc&limit=1000`)
  ]);
  if (!u) { $('#view').innerHTML = '<div class="card empty">Ürün bulunamadı</div>'; return; }
  topbar(u.ad, { back: true, actions: `<button class="tb-btn" id="ed">${icon('edit')}Düzenle</button>` });
  $('#view').innerHTML = `
    <div class="card">
      <div class="st small muted" style="margin-bottom:10px">${esc(u.kod)} · ${esc(u.kategori || 'Kategorisiz')} · ${esc(u.birim)} ${stokBadge(u.durum)} ${u.aktif ? '' : '<span class="badge b-red">Pasif</span>'}</div>
      <div class="stats">
        <div class="stat"><div class="l">Real stok</div><div class="v">${fmtN(u.real_stok)}</div></div>
        <div class="stat"><div class="l">Bekleyen</div><div class="v">${fmtN(u.bekleyen_siparis)}</div></div>
        <div class="stat"><div class="l">Sevk sonrası</div><div class="v ${num(u.sevk_sonrasi_stok) < 0 ? 'pos' : ''}">${fmtN(u.sevk_sonrasi_stok)}</div></div>
      </div>
      <div class="kv" style="margin-top:12px">
        <span class="k">Liste satış fiyatı</span><span>${fmtTL(u.satis_fiyati)}</span>
        <span class="k">Son alış fiyatı</span><span>${u.son_alis_fiyati !== null ? fmtTL(u.son_alis_fiyati) : '–'}</span>
        <span class="k">Minimum stok</span><span>${fmtN(u.min_stok)}</span>
        ${u.notlar ? `<span class="k">Not</span><span>${esc(u.notlar)}</span>` : ''}
      </div>
    </div>
    <div class="btn-row" style="margin-bottom:6px">
      <button class="btn green" id="b-al">${icon('inbox')}Mal alışı</button>
      <button class="btn" id="b-dz">${icon('edit')}Sayım / fire</button>
    </div>
    <div class="section-title">Stok hareketleri</div>
    <div class="list">${hareketTable(har, false)}</div>`;
  $('#ed').onclick = () => urunForm(u, null, () => { cache.dirty('urunler'); render(); });
  $('#b-al').onclick = () => malAlisi(u);
  $('#b-dz').onclick = () => stokDuzelt(u);
  bindHareketEdit();
}

function hareketTable(har, showUrun) {
  if (!har.length) return '<div class="empty">Hareket yok</div>';
  return `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Tarih</th>${showUrun ? '<th>Ürün</th>' : ''}<th>İşlem</th><th class="r">Miktar</th><th class="r">Birim maliyet</th><th>Belge / açıklama</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
    <tbody>${har.map((h) => `<tr>
      <td class="num">${fmtD(h.tarih)}</td>
      ${showUrun ? `<td class="w"><a href="#/urun/${h.urun_id}"><b>${esc(h.urunler?.ad)}</b></a></td>` : ''}
      <td>${islemBadge(h)}${h.fatura_tipi ? ' ' + tipBadge(h.fatura_tipi) : ''}</td>
      <td class="r ${h.tur === 'Giriş' ? '' : 'pos'}"><b>${h.tur === 'Giriş' ? '+' : '−'}${fmtN(h.miktar)}</b></td>
      <td class="r" ${h.tur === 'Giriş' ? 'data-l="Maliyet"' : ''}>${h.tur === 'Giriş'
        ? (isAdmin() ? `<input class="input mal-in" data-id="${h.id}" inputmode="decimal" style="width:110px;padding:6px 8px;text-align:right;font-size:14px" placeholder="girin" value="${h.birim_maliyet !== null ? fmtN(h.birim_maliyet) : ''}">` : (h.birim_maliyet !== null ? fmtTL(h.birim_maliyet) : '–'))
        : ''}${h.para_birimi && h.para_birimi !== 'TRY' && h.doviz_maliyet !== null ? `<div class="tiny">${fmtPB(h.doviz_maliyet, h.para_birimi)} × ${fmtN(h.kur)}</div>` : ''}</td>
      <td class="small w">${h.siparisler ? `<a href="#/siparis/${h.siparis_id}">Fiş ${h.siparisler.fis_no}</a> · ${esc(h.siparisler.cariler?.unvan || '')}` : esc([h.tedarikci, h.belge_no, h.aciklama].filter(Boolean).join(' · ') || '')}</td>
      ${isAdmin() ? `<td class="push">${!h.siparis_id ? `<button class="icon-btn h-del" data-id="${h.id}" title="Sil">${icon('trash')}</button>` : ''}</td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}
function bindHareketEdit() {
  $$('.mal-in').forEach((inp) => inp.addEventListener('change', async () => {
    const v = inp.value.trim() === '' ? null : parseNum(inp.value);
    if (v !== null && (isNaN(v) || v < 0)) { toast('Geçerli bir maliyet girin', 'err'); return; }
    try { await api.update('stok_hareketleri', `id=eq.${inp.dataset.id}`, { birim_maliyet: v }); inp.style.borderColor = 'var(--green)'; toast('Maliyet kaydedildi', 'ok'); cache.dirty('urunler'); }
    catch (e) { fail(e); }
  }));
  $$('.h-del').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmBox('Hareket silinsin mi?', 'Bu stok hareketi kalıcı olarak silinecek ve stok miktarı buna göre değişecek.', 'Sil', true)) return;
    try { await api.del('stok_hareketleri', `id=eq.${b.dataset.id}`); cache.dirty('urunler'); toast('Silindi', 'ok'); render(); } catch (e) { fail(e); }
  }));
}

async function viewStokHareketleri() {
  topbar('Stok Hareketleri', { back: true, actions: `<button class="tb-btn" onclick="malAlisi()">${icon('inbox')}Mal alışı</button>` });
  const ui = state.ui.har ||= { f: 'Tümü', q: '' };
  const data = await api.get('stok_hareketleri', 'select=*,urunler(ad,kod),siparisler(fis_no,cariler(unvan))&order=tarih.desc,id.desc&limit=3000');
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" placeholder="Ürün, fiş, tedarikçi ara…" value="${esc(ui.q)}"></div></div>
    <div class="chips" id="c1">${['Tümü', 'Girişler', 'R alışlar', 'GR alışlar', 'Maliyeti eksik', 'Sevkler', 'Sayım / fire'].map((d) => `<button class="chip ${ui.f === d ? 'on' : ''}" data-f="${d}">${d}</button>`).join('')}</div>
    <p class="tiny" style="margin:0 4px 10px">Alış maliyetini girişlerin “Birim maliyet” kutusuna yazın; kâr raporu bu maliyetlerle FIFO/LIFO hesaplanır.</p>
    <div class="list" id="lst"></div>`;
  const draw = () => {
    const q = norm(ui.q);
    const f = data.filter((h) => (ui.f === 'Tümü' || (ui.f === 'Girişler' && h.tur === 'Giriş') || (ui.f === 'R alışlar' && h.islem === 'Alış' && h.fatura_tipi === 'R') || (ui.f === 'GR alışlar' && h.islem === 'Alış' && h.fatura_tipi === 'GR') || (ui.f === 'Maliyeti eksik' && h.tur === 'Giriş' && h.birim_maliyet === null)
      || (ui.f === 'Sevkler' && h.islem === 'Sevk') || (ui.f === 'Sayım / fire' && ['Sayım', 'Fire'].includes(h.islem)))
      && (!q || norm(`${h.urunler?.ad} ${h.urunler?.kod} ${h.siparisler?.fis_no || ''} ${h.siparisler?.cariler?.unvan || ''} ${h.tedarikci || ''} ${h.belge_no || ''} ${h.aciklama || ''}`).includes(q)));
    $('#lst').innerHTML = hareketTable(f.slice(0, 500), true) + (f.length > 500 ? '<div class="empty">İlk 500 hareket gösteriliyor</div>' : '');
    bindHareketEdit();
  };
  $('#q').oninput = (e) => { ui.q = e.target.value; draw(); };
  $('#c1').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; ui.f = b.dataset.f; $$('#c1 .chip').forEach((c) => c.classList.toggle('on', c === b)); draw(); };
  draw();
}

/* Mal alisi: tek fiste cok kalem, alis fiyatiyla stok girisi */
function malAlisi(urun = null) { go(urun ? `#/alis/yeni?urun=${urun.id}` : '#/alis/yeni'); }

async function viewMalAlisi(urunId) {
  topbar('Mal Alışı', { back: true });
  const [ayar, urunler, gecmis] = await Promise.all([
    cache.ayarlar(),
    cache.urunler(),
    api.get('stok_hareketleri', 'select=tedarikci&islem=eq.' + encodeURIComponent('Alış') + '&tedarikci=not.is.null&order=id.desc&limit=2000').catch(() => [])
  ]);
  const tedarikciler = [...new Set(gecmis.map((x) => x.tedarikci).filter(Boolean))];
  const lines = [];
  let tip = 'R';
  let adv = null;
  const bos = () => ({ urun: null, miktar: '', maliyet: '' });
  if (urunId) { const u = urunler.find((x) => x.id === +urunId); if (u) lines.push({ urun: u, miktar: '', maliyet: '' }); }
  lines.push(bos());
  $('#view').innerHTML = `
    <div class="card">
      <div class="grid2">
        <div class="field"><label>Tarih</label><input class="input" type="date" id="a-t" value="${today()}"></div>
        <div class="field"><label>Belge / fatura no</label><input class="input" id="a-bel" placeholder="İsteğe bağlı"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Fatura tipi</label><div class="seg" id="a-tip"><button type="button" data-v="R" class="r">R</button><button type="button" data-v="GR" class="gr">GR</button></div></div>
        <div class="field" id="a-kdvf"><label>KDV oranı (%)</label><input class="input" id="a-kdv" inputmode="decimal" value="${fmtN(num(ayar.kdv_orani) * 100)}"></div>
      </div>
      ${dovizHtml('a-dv')}
      <div class="field"><label>Tedarikçi</label><input class="input" id="a-ted" list="ted-list" placeholder="İsteğe bağlı"><datalist id="ted-list">${tedarikciler.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div class="field" style="margin-bottom:0"><label>Açıklama</label><input class="input" id="a-ac" placeholder="İsteğe bağlı"></div>
    </div>
    <div class="section-title">Ürünler <span class="tiny" style="text-transform:none;letter-spacing:0">Ürün seçince altına yeni satır açılır · fiyatlar KDV hariç</span></div>
    <div class="lines" id="a-lines"></div>
    <button class="btn block" id="a-add" style="margin-bottom:14px">${icon('plus')}Satır ekle</button>
    <div class="card"><div class="totals" id="a-tot"></div></div>
    <button class="btn green block" id="a-save" style="padding:14px;font-size:16px">${icon('inbox')}Alış fişini kaydet</button>`;

  const draw = (focusIdx = null, focusSel = '.a-mik') => {
    $('#a-lines').innerHTML = lines.map((l, i) => {
      const u = l.urun;
      return `<div class="line" data-i="${i}">
        <div class="picker" style="display:flex;gap:6px"><input class="input a-urun" placeholder="${i + 1}. ürün ara…" value="${esc(u?.ad || '')}" autocomplete="off"><button class="icon-btn a-del" title="Kaldır">${icon('trash')}</button></div>
        <div class="lr">
          <div class="field"><label>Miktar</label><input class="input a-mik" inputmode="decimal" value="${l.miktar === '' ? '' : fmtN(l.miktar)}"></div>
          <div class="field"><label>Alış fiyatı <span class="a-pbs">${PB[adv ? adv.get().pb : 'TRY']}</span></label><input class="input a-mal" inputmode="decimal" placeholder="${u && u.son_alis_fiyati !== null ? fmtN(u.son_alis_fiyati) : 'sonra da girilebilir'}" value="${l.maliyet === '' ? '' : fmtN(l.maliyet)}"></div>
          <div class="field"><label>Tutar</label><input class="input a-tut" readonly value="${l.maliyet === '' ? '–' : fmt2(num(l.miktar) * num(l.maliyet))}" style="background:var(--surface-2)"></div>
        </div>
        ${u ? `<div class="info"><span>Real stok: <b>${fmtN(u.real_stok)}</b> ${esc(u.birim)}</span>${u.son_alis_fiyati !== null ? `<span>Son alış: <b>${fmtTL(u.son_alis_fiyati)}</b></span>` : ''}<span class="a-sonra">${num(l.miktar) > 0 ? `Giriş sonrası: <b>${fmtN(num(u.real_stok) + num(l.miktar))}</b>` : ''}</span></div>` : ''}
      </div>`;
    }).join('');
    $$('#a-lines .line').forEach((el) => {
      const i = +el.dataset.i, l = lines[i];
      const pick = (u) => {
        l.urun = u;
        if (i === lines.length - 1) lines.push(bos());
        draw(i, '.a-mik');
      };
      picker($('.a-urun', el), {
        items: () => urunler.filter((u) => u.aktif), label: (u) => u.ad, sub: (u) => `${esc(u.kod)} · real ${fmtN(u.real_stok)} ${esc(u.birim)}${u.son_alis_fiyati !== null ? ' · son alış ' + fmtTL(u.son_alis_fiyati) : ''}`,
        onPick: pick, addText: 'Yeni ürün ekle',
        onAdd: (v) => urunForm(null, { ad: v }, async (u) => { cache.dirty('urunler'); const all = await cache.urunler(); urunler.splice(0, urunler.length, ...all); pick(all.find((x) => x.id === u.id)); })
      });
      const upd = () => {
        $('.a-tut', el).value = l.maliyet === '' ? '–' : fmt2(num(l.miktar) * num(l.maliyet));
        const so = $('.a-sonra', el); if (so) so.innerHTML = num(l.miktar) > 0 ? `Giriş sonrası: <b>${fmtN(num(l.urun.real_stok) + num(l.miktar))}</b>` : '';
        tot();
      };
      $('.a-mik', el).oninput = (e) => { const v = parseNum(e.target.value); l.miktar = isNaN(v) ? '' : v; upd(); };
      $('.a-mal', el).oninput = (e) => { const v = parseNum(e.target.value); l.maliyet = isNaN(v) ? '' : v; upd(); };
      $('.a-mal', el).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); const nx = $(`#a-lines .line[data-i="${i + 1}"] .a-urun`); nx && nx.focus(); } };
      $('.a-mik', el).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('.a-mal', el).focus(); } };
      $('.a-del', el).onclick = () => { lines.splice(i, 1); if (!lines.length || lines[lines.length - 1].urun) lines.push(bos()); draw(); };
    });
    tot();
    if (focusIdx !== null) setTimeout(() => $(`#a-lines .line[data-i="${focusIdx}"] ${focusSel}`)?.focus(), 30);
  };
  const tot = () => {
    const dolu = lines.filter((l) => l.urun);
    const top = dolu.reduce((a, l) => a + (l.maliyet === '' ? 0 : Math.round(num(l.miktar) * num(l.maliyet) * 100) / 100), 0);
    const eksik = dolu.filter((l) => l.maliyet === '').length;
    const kdvO = tip === 'R' ? (parseNum($('#a-kdv')?.value) || 0) / 100 : 0;
    const d = adv ? adv.get() : { pb: 'TRY', kur: 1 };
    const kdv = Math.round(top * kdvO * 100) / 100;
    const tlx = (v) => (d.pb === 'TRY' ? fmtTL(v) : `${fmtPB(v, d.pb)}${d.kur > 0 ? ` <span class="tiny">≈ ${fmtTL(v * d.kur)}</span>` : ''}`);
    $('#a-tot').innerHTML = `<div class="tr"><span class="muted">Kalem sayısı</span><span>${dolu.length}</span></div>
      <div class="tr"><span class="muted">Toplam miktar</span><span>${fmtN(dolu.reduce((a, l) => a + num(l.miktar), 0))}</span></div>
      <div class="tr"><span class="muted">Ara toplam (KDV hariç)</span><span>${tlx(top)}</span></div>
      ${tip === 'R' ? `<div class="tr"><span class="muted">KDV (%${fmtN(kdvO * 100)})</span><span>${tlx(kdv)}</span></div>` : '<div class="tr"><span class="muted">KDV</span><span class="tiny">GR — KDV yok</span></div>'}
      <div class="tr big"><span>Fiş toplamı</span><span>${tlx(top + kdv)}</span></div>
      ${d.pb !== 'TRY' ? `<div class="tiny">Stoğa ve kâr hesabına kur ile çevrilmiş TL maliyet işlenir${d.kur > 0 ? '' : ' — <b style="color:var(--red)">kur girin</b>'}.</div>` : ''}
      ${eksik ? `<div class="tiny">${eksik} kalemde alış fiyatı boş; sonra Stok → Hareketler'den girebilirsiniz.</div>` : ''}`;
  };
  adv = bindDoviz($('#view'), 'a-dv', (y) => { $$('.a-pbs').forEach((x) => { x.textContent = PB[y.pb]; }); tot(); });
  const setTip = (t) => { tip = t; $$('#a-tip button').forEach((b) => b.classList.toggle('on', b.dataset.v === t)); $('#a-kdvf').style.opacity = t === 'R' ? 1 : 0.35; $('#a-kdv').disabled = t !== 'R'; tot(); };
  $('#a-tip').onclick = (e) => { const b = e.target.closest('button'); if (b) setTip(b.dataset.v); };
  $('#a-kdv').oninput = () => tot();
  $('#a-add').onclick = () => { if (lines[lines.length - 1].urun) lines.push(bos()); draw(lines.length - 1, '.a-urun'); };
  draw(urunId ? 0 : null, urunId ? '.a-mik' : '.a-urun');
  setTip('R');

  $('#a-save').onclick = async (e) => {
    const dolu = lines.filter((l) => l.urun);
    if (!dolu.length) return toast('En az bir ürün seçin', 'err');
    const bad = dolu.find((l) => !(num(l.miktar) > 0));
    if (bad) return toast(`${bad.urun.ad}: miktar girin`, 'err');
    const badM = dolu.find((l) => l.maliyet !== '' && num(l.maliyet) < 0);
    if (badM) return toast(`${badM.urun.ad}: alış fiyatı geçersiz`, 'err');
    const kdvO = tip === 'R' ? (parseNum($('#a-kdv').value) || 0) / 100 : 0;
    if (kdvO < 0 || kdvO >= 1) return toast('KDV oranı 0 ile 99 arasında olmalı', 'err');
    const d = adv.check(); if (!d) return;
    const ortak = { tarih: $('#a-t').value || today(), tur: 'Giriş', islem: 'Alış', fatura_tipi: tip, kdv_orani: kdvO, para_birimi: d.pb, kur: d.kur, tedarikci: $('#a-ted').value.trim() || null, belge_no: $('#a-bel').value.trim() || null, aciklama: $('#a-ac').value.trim() || null };
    try {
      await busy(e.currentTarget, () => api.insert('stok_hareketleri', dolu.map((l) => ({ ...ortak, urun_id: l.urun.id, miktar: num(l.miktar), birim_maliyet: l.maliyet === '' ? null : Math.round(num(l.maliyet) * d.kur * 10000) / 10000, doviz_maliyet: l.maliyet === '' || d.pb === 'TRY' ? null : num(l.maliyet) }))));
      cache.dirty('urunler');
      toast(`${tip} alış fişi kaydedildi · ${dolu.length} kalem`, 'ok');
      go('#/stok/hareketler');
    } catch (err) { fail(err); }
  };
}

/* Sayim / fire duzeltmesi */
async function stokDuzelt(urun = null) {
  let urunler;
  try { urunler = await cache.urunler(); } catch (e) { return fail(e); }
  let sel = urun;
  modal({
    title: 'Sayım / fire',
    body: `
      <div class="field picker"><label>Ürün</label><input class="input" id="d-u" placeholder="Ürün ara…" autocomplete="off" value="${esc(urun?.ad || '')}"><div class="hint" id="d-ui"></div></div>
      <div class="field"><label>İşlem</label><div class="seg" id="d-tip"><button type="button" data-v="sayim" class="on">Sayım sonucu</button><button type="button" data-v="fire">Fire / zayi çıkışı</button></div></div>
      <div class="field"><label id="d-ml">Sayılan gerçek miktar</label><input class="input" id="d-mik" inputmode="decimal"><div class="hint" id="d-h"></div></div>
      <div class="grid2"><div class="field"><label>Tarih</label><input class="input" type="date" id="d-t" value="${today()}"></div>
      <div class="field"><label>Açıklama</label><input class="input" id="d-ac"></div></div>`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="d-ok">Kaydet</button>`,
    onMount: (m) => {
      let tip = 'sayim';
      const info = () => {
        $('#d-ui', m.el).innerHTML = sel ? `Sistemdeki real stok: <b>${fmtN(sel.real_stok)}</b> ${esc(sel.birim)}` : '';
        const v = parseNum($('#d-mik', m.el).value);
        $('#d-h', m.el).innerHTML = tip === 'sayim' && sel && !isNaN(v) ? `Fark: <b>${v - num(sel.real_stok) >= 0 ? '+' : ''}${fmtN(v - num(sel.real_stok))}</b> (${v - num(sel.real_stok) >= 0 ? 'giriş' : 'çıkış'} olarak işlenir)` : '';
      };
      info();
      $('#d-tip', m.el).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tip = b.dataset.v; $$('#d-tip button', m.el).forEach((x) => x.classList.toggle('on', x === b)); $('#d-ml', m.el).textContent = tip === 'sayim' ? 'Sayılan gerçek miktar' : 'Fire miktarı'; info(); };
      $('#d-mik', m.el).oninput = info;
      picker($('#d-u', m.el), { items: () => urunler.filter((u) => u.aktif), label: (u) => u.ad, sub: (u) => `${esc(u.kod)} · real ${fmtN(u.real_stok)}`, onPick: (u) => { sel = u; $('#d-u', m.el).value = u.ad; info(); } });
      $('#d-ok', m.el).onclick = async (e) => {
        if (!sel) return toast('Ürün seçin', 'err');
        const v = parseNum($('#d-mik', m.el).value);
        if (isNaN(v) || v < 0) return toast('Miktar girin', 'err');
        let row;
        if (tip === 'sayim') {
          const fark = Math.round((v - num(sel.real_stok)) * 1000) / 1000;
          if (!fark) return toast('Fark yok, kayıt gerekmiyor', 'ok');
          row = { tur: fark > 0 ? 'Giriş' : 'Çıkış', islem: 'Sayım', miktar: Math.abs(fark) };
        } else {
          if (!(v > 0)) return toast('Fire miktarı girin', 'err');
          row = { tur: 'Çıkış', islem: 'Fire', miktar: v };
        }
        try {
          await busy(e.currentTarget, () => api.insert('stok_hareketleri', [{ ...row, tarih: $('#d-t', m.el).value || today(), urun_id: sel.id, aciklama: $('#d-ac', m.el).value || null }]));
          cache.dirty('urunler'); m.close(); toast('Stok düzeltildi', 'ok'); render();
        } catch (err) { fail(err); }
      };
    }
  });
}

/* Urun ekle / duzenle */
function urunForm(u = null, preset = null, onSaved = null) {
  const d = u || { ad: preset?.ad || '', kategori: '', birim: 'Adet', satis_fiyati: 0, min_stok: 0, aktif: true, notlar: '' };
  modal({
    title: u ? 'Ürünü düzenle' : 'Yeni ürün',
    body: `
      <div class="field"><label>Ürün adı</label><input class="input" id="u-ad" value="${esc(d.ad)}"></div>
      <div class="grid2"><div class="field"><label>Kategori</label><input class="input" id="u-kat" value="${esc(d.kategori || '')}"></div>
        <div class="field"><label>Birim</label><input class="input" id="u-bir" value="${esc(d.birim)}" list="birimler"><datalist id="birimler"><option>Adet</option><option>Kg</option><option>Mt</option><option>Koli</option><option>Paket</option><option>Takım</option></datalist></div></div>
      <div class="grid2"><div class="field"><label>Liste satış fiyatı (₺)</label><input class="input" id="u-fy" inputmode="decimal" value="${fmtN(d.satis_fiyati)}"><div class="hint">Müşteri fiyatı yoksa bu kullanılır</div></div>
        <div class="field"><label>Minimum stok</label><input class="input" id="u-min" inputmode="decimal" value="${fmtN(d.min_stok)}"><div class="hint">Altına düşünce KRİTİK görünür</div></div></div>
      <div class="field"><label>Not</label><input class="input" id="u-not" value="${esc(d.notlar || '')}"></div>
      ${u ? `<label class="check"><input type="checkbox" id="u-akt" ${d.aktif ? 'checked' : ''}> Aktif (pasif ürünler listelerde görünmez)</label>` : ''}`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="u-ok">Kaydet</button>`,
    onMount: (m) => {
      $('#u-ok', m.el).onclick = async (e) => {
        const row = { ad: $('#u-ad', m.el).value.trim(), kategori: $('#u-kat', m.el).value.trim() || null, birim: $('#u-bir', m.el).value.trim() || 'Adet',
          satis_fiyati: parseNum($('#u-fy', m.el).value) || 0, min_stok: parseNum($('#u-min', m.el).value) || 0, notlar: $('#u-not', m.el).value.trim() || null };
        if (u) row.aktif = $('#u-akt', m.el).checked;
        if (!row.ad) return toast('Ürün adı girin', 'err');
        try {
          const [saved] = await busy(e.currentTarget, () => (u ? api.update('urunler', `id=eq.${u.id}`, row) : api.insert('urunler', [row])));
          m.close(); cache.dirty('urunler'); toast(u ? 'Ürün güncellendi' : `Ürün eklendi: ${saved.kod}`, 'ok');
          onSaved ? onSaved(saved) : render();
        } catch (err) { fail(err); }
      };
    }
  });
}

/* ------------------------------------------------------------------ */
/* CARILER                                                             */
/* ------------------------------------------------------------------ */
function cariRow(c) {
  return `<div class="row" data-go="#/cari/${c.id}">
    <div class="main-col"><div class="t">${esc(c.unvan)}</div>
      <div class="st"><span class="tiny">${esc(c.kod)}</span>${c.sehir ? `<span class="tiny">· ${esc(c.sehir)}</span>` : ''}${c.tip === 'Perakende' ? '<span class="badge">Perakende</span>' : ''}</div></div>
    <div class="end"><div class="amt ${balCls(c.bakiye)}">${fmtTL(c.bakiye)}</div>
      ${num(c.bakiye_r) || num(c.bakiye_gr) ? `<div class="tiny">R ${fmtTL(c.bakiye_r)} · GR ${fmtTL(c.bakiye_gr)}</div>` : ''}</div>
  </div>`;
}
async function viewCariler() {
  topbar('Cariler', { actions: `<button class="tb-btn" onclick="cariForm()">${icon('plus')}Yeni</button>` });
  const ui = state.ui.cari ||= { f: 'Toptan', q: '', sirala: 'ad' };
  const data = await cache.cariler(true);
  $('#view').innerHTML = `
    <div class="toolbar"><div class="search">${icon('search')}<input id="q" placeholder="Cari adı, kod, şehir ara…" value="${esc(ui.q)}"></div>
      <select class="input" id="srt" style="width:auto;padding:9px 30px 9px 12px;font-size:14px"><option value="ad">A → Z</option><option value="bakiye">Bakiye ↓</option><option value="son">Son hareket</option></select></div>
    <div class="chips" id="c1">${['Toptan', 'Perakende', 'Bakiyesi olan', 'Tümü'].map((d) => `<button class="chip ${ui.f === d ? 'on' : ''}" data-f="${d}">${d}</button>`).join('')}</div>
    <div class="card" id="sum" style="padding:12px"></div>
    <div class="list" id="lst"></div>`;
  $('#srt').value = ui.sirala;
  const draw = () => {
    const q = norm(ui.q);
    let f = data.filter((c) => c.aktif && (ui.f === 'Tümü' || (ui.f === 'Bakiyesi olan' ? Math.abs(num(c.bakiye)) > 0.005 : c.tip === ui.f))
      && (!q || norm(`${c.unvan} ${c.kod} ${c.sehir || ''} ${c.yetkili || ''} ${c.telefon || ''}`).includes(q)));
    if (ui.sirala === 'bakiye') f.sort((a, b) => num(b.bakiye) - num(a.bakiye));
    if (ui.sirala === 'son') f.sort((a, b) => String(b.son_hareket || '').localeCompare(String(a.son_hareket || '')));
    const tr = f.reduce((a, c) => a + num(c.bakiye_r), 0), tg = f.reduce((a, c) => a + num(c.bakiye_gr), 0);
    $('#sum').innerHTML = `<div class="stats stats4">
      <div class="stat"><div class="l">${esc(ui.f)} · ${f.length} cari</div><div class="v ${balCls(tr + tg)}">${fmtTL(tr + tg)}</div></div>
      <div class="stat"><div class="l">R toplam</div><div class="v ${balCls(tr)}">${fmtTL(tr)}</div></div>
      <div class="stat"><div class="l">GR toplam</div><div class="v ${balCls(tg)}">${fmtTL(tg)}</div></div>
      <div class="stat"><div class="l">Alacak / borç</div><div class="v small" style="font-size:13px;white-space:normal"><span class="pos">${fmtTL(f.reduce((a, c) => a + Math.max(num(c.bakiye), 0), 0))}</span><br><span class="neg">${fmtTL(f.reduce((a, c) => a + Math.min(num(c.bakiye), 0), 0))}</span></div></div>
    </div>${ui.q ? `<div class="tiny" style="margin-top:6px">“${esc(ui.q)}” aramasına göre</div>` : ''}`;
    $('#lst').innerHTML = f.length ? f.slice(0, 500).map(cariRow).join('') : '<div class="empty">Cari bulunamadı</div>';
    bindRows($('#lst'));
  };
  $('#q').oninput = (e) => { ui.q = e.target.value; draw(); };
  $('#srt').onchange = (e) => { ui.sirala = e.target.value; draw(); };
  $('#c1').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; ui.f = b.dataset.f; $$('#c1 .chip').forEach((c) => c.classList.toggle('on', c === b)); draw(); };
  draw();
}

async function viewCariDetay(id) {
  topbar('Cari', { back: true });
  const ui = state.ui.ekstre ||= { tip: 'Tümü' };
  const [[c], eks, mf] = await Promise.all([
    api.get('v_cariler', `select=*&id=eq.${id}`),
    api.get('v_cari_ekstre', `select=*&cari_id=eq.${id}&order=tarih.asc,id.asc&limit=5000`),
    api.get('musteri_fiyatlari', `select=*,urunler(ad,kod,satis_fiyati)&cari_id=eq.${id}&order=tarih.desc`)
  ]);
  if (!c) { $('#view').innerHTML = '<div class="card empty">Cari bulunamadı</div>'; return; }
  topbar(c.unvan, { back: true, actions: `<button class="tb-btn" id="ed">${icon('edit')}Düzenle</button>` });
  $('#view').innerHTML = `
    <div class="card">
      <div class="st small muted" style="margin-bottom:10px">${esc(c.kod)} · ${c.tip === 'Perakende' ? '<span class="badge">Perakende</span>' : '<span class="badge b-blue">Toptan</span>'}
        ${c.sehir ? '· ' + esc(c.sehir) : ''} ${c.telefon ? `· <a href="tel:${esc(c.telefon)}">${esc(c.telefon)}</a>` : ''} ${c.yetkili ? '· ' + esc(c.yetkili) : ''}</div>
      <div class="stats">
        <div class="stat"><div class="l">R bakiye</div><div class="v ${balCls(c.bakiye_r)}">${fmtTL(c.bakiye_r)}</div></div>
        <div class="stat"><div class="l">GR bakiye</div><div class="v ${balCls(c.bakiye_gr)}">${fmtTL(c.bakiye_gr)}</div></div>
        <div class="stat"><div class="l">Toplam</div><div class="v ${balCls(c.bakiye)}">${fmtTL(c.bakiye)}</div></div>
      </div>
      <p class="tiny" style="margin:8px 0 0">Pozitif bakiye: müşteri size borçlu. Negatif: siz müşteriye borçlusunuz.</p>
    </div>
    <div class="btn-row" style="margin-bottom:6px">
      <button class="btn orange" id="b-tah">${icon('cash')}Tahsilat</button>
      <button class="btn primary" id="b-sip">${icon('order')}Yeni sipariş</button>
      <button class="btn" id="b-acl">Açılış / düzeltme</button>
    </div>
    <div class="section-title">Cari ekstre</div>
    <div class="chips" id="c1">${['Tümü', 'R', 'GR'].map((t) => `<button class="chip ${ui.tip === t ? 'on' : ''}" data-t="${t}">${t === 'Tümü' ? 'R + GR' : t + ' hareketleri'}</button>`).join('')}</div>
    <div class="list" id="eks"></div>
    <div class="section-title">Müşteriye özel fiyatlar <a href="#" id="mf-add">+ Fiyat ekle</a></div>
    <div class="list">${mf.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Ürün</th><th class="r">Müşteri fiyatı</th><th class="r">Liste fiyatı</th><th>Koşul</th><th>Tarih</th><th></th></tr></thead>
      <tbody>${mf.map((x) => `<tr><td class="w"><b>${esc(x.urunler?.ad)}</b></td><td class="r" data-l="Fiyat"><b>${fmtPB(x.fiyat, x.para_birimi)}</b></td><td class="r tiny" data-l="Liste">${fmtTL(x.urunler?.satis_fiyati)}</td><td class="small">${esc(x.odeme_kosulu || '')}</td><td class="num small">${fmtD(x.tarih)}</td>
        <td class="push" style="white-space:nowrap"><button class="icon-btn mf-ed" data-id="${x.id}">${icon('edit')}</button>${isAdmin() ? `<button class="icon-btn mf-del" data-id="${x.id}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Bu müşteri için özel fiyat yok. Siparişte girdiğiniz fiyatlar burada otomatik birikir.</div>'}</div>`;

  const dvzNot = (h) => (h.para_birimi && h.para_birimi !== 'TRY' && h.doviz_tutar !== null ? `<div class="tiny">${fmtPB(h.doviz_tutar, h.para_birimi)} × ${fmtN(h.kur)}</div>` : '');
  const drawEks = () => {
    const rows = eks.filter((h) => ui.tip === 'Tümü' || h.fatura_tipi === ui.tip);
    const yb = (h) => (ui.tip === 'Tümü' ? h.yuruyen_bakiye : h.yuruyen_bakiye_tip);
    const tb = rows.reduce((a, h) => a + num(h.borc), 0), ta = rows.reduce((a, h) => a + num(h.alacak), 0);
    $('#eks').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th class="r">Matrah</th><th class="r">KDV</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.slice().reverse().map((h) => `<tr class="click" data-hid="${h.id}">
        <td class="num">${fmtD(h.tarih)}</td>
        <td>${esc(h.islem)} ${tipBadge(h.fatura_tipi)}${h.odeme_sekli ? `<div class="tiny">${esc(h.odeme_sekli)}</div>` : ''}${h.aciklama ? `<div class="tiny">${esc(h.aciklama)}</div>` : ''}</td>
        <td class="small">${h.siparis_id ? `<a href="#/siparis/${h.siparis_id}">${esc(h.belge_no || '')}</a>` : esc(h.belge_no || '')}</td>
        <td class="r small" ${num(h.matrah) ? 'data-l="Matrah"' : ''}>${num(h.matrah) ? fmtTL(h.matrah) : ''}</td><td class="r small" ${num(h.kdv_tutari) ? 'data-l="KDV"' : ''}>${num(h.kdv_tutari) ? fmtTL(h.kdv_tutari) : ''}</td>
        <td class="r" ${num(h.borc) ? 'data-l="Borç"' : ''}>${num(h.borc) ? fmtTL(h.borc) + dvzNot(h) : ''}</td><td class="r" ${num(h.alacak) ? 'data-l="Alacak"' : ''}>${num(h.alacak) ? fmtTL(h.alacak) + dvzNot(h) : ''}</td>
        <td class="r push" data-l="Bakiye"><b class="${balCls(yb(h))}">${fmtTL(yb(h))}</b></td>
        ${isAdmin() ? `<td>${!h.otomatik ? `<button class="icon-btn ch-del" data-id="${h.id}">${icon('trash')}</button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5" class="r"><b>Toplam</b></td><td class="r" data-l="Borç">${fmtTL(tb)}</td><td class="r" data-l="Alacak">${fmtTL(ta)}</td><td class="r push" data-l="Bakiye">${fmtTL(tb - ta)}</td>${isAdmin() ? '<td></td>' : ''}</tr></tfoot></table></div>`
      : '<div class="empty">Hareket yok</div>';
    $$('#eks tr[data-hid]').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('button,a')) return;
      cariHareketDuzenle(eks.find((x) => x.id === +tr.dataset.hid), c);
    }));
    $$('.ch-del').forEach((b) => b.onclick = async () => {
      if (!await confirmBox('Hareket silinsin mi?', 'Bu cari hareketi kalıcı olarak silinecek.', 'Sil', true)) return;
      try { await api.del('cari_hareketler', `id=eq.${b.dataset.id}`); cache.dirty('cariler'); toast('Silindi', 'ok'); render(); } catch (e) { fail(e); }
    });
  };
  $('#c1').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; ui.tip = b.dataset.t; $$('#c1 .chip').forEach((x) => x.classList.toggle('on', x === b)); drawEks(); };
  drawEks();
  $('#ed').onclick = () => cariForm(c, null, () => { cache.dirty('cariler'); render(); });
  $('#b-tah').onclick = () => tahsilat(c);
  $('#b-sip').onclick = () => go(`#/siparis/yeni?cari=${c.id}`);
  $('#b-acl').onclick = () => acilisBakiye(c);
  $('#mf-add').onclick = (e) => { e.preventDefault(); musteriFiyat(c); };
  $$('.mf-ed').forEach((b) => b.onclick = () => musteriFiyat(c, mf.find((x) => x.id === +b.dataset.id)));
  $$('.mf-del').forEach((b) => b.onclick = async () => {
    if (!await confirmBox('Özel fiyat silinsin mi?', 'Bu ürün için liste fiyatı kullanılmaya başlanır.', 'Sil', true)) return;
    try { await api.del('musteri_fiyatlari', `id=eq.${b.dataset.id}`); render(); } catch (e) { fail(e); }
  });
}

/* Cari hareketi duzenle: elle girilen kayitlar (tahsilat, acilis, duzeltme) duzenlenir;
   siparisten otomatik gelen kayitlar siparis uzerinden duzenlenir. */
function cariHareketDuzenle(h, c) {
  if (!h) return;
  if (h.otomatik || h.siparis_id) {
    modal({
      title: `${h.islem} · ${fmtD(h.tarih)}`,
      body: `<p style="margin-top:0">Bu kayıt <b>${esc(h.belge_no || 'siparişten')}</b> otomatik oluştu (${esc(h.islem)} · ${fmtTL(num(h.borc) || num(h.alacak))}).</p>
        <p class="small muted">Tutarı değiştirmek için siparişi düzenleyin; stok ve cari birlikte düzelir. Siparişi tamamen geri almak için siparişi iptal edin.</p>`,
      foot: `<button class="btn" data-close>Kapat</button>${h.siparis_id ? `<button class="btn primary" id="hd-sip">${icon('order')}Siparişe git</button>` : ''}`,
      onMount: (m) => { $('#hd-sip', m.el)?.addEventListener('click', () => { m.close(); go(`#/siparis/${h.siparis_id}`); }); }
    });
    return;
  }
  const pb = h.para_birimi || 'TRY';
  const tutar0 = pb !== 'TRY' && h.doviz_tutar !== null ? num(h.doviz_tutar) : num(h.borc) || num(h.alacak);
  modal({
    title: 'Cari hareketi düzenle',
    body: `<div class="field"><label>Cari</label><input class="input" value="${esc(c.unvan)}" readonly style="background:var(--surface-2)"></div>
      <div class="field"><label>Kayıt türü</label><div class="seg" id="hd-is">${['Tahsilat', 'Açılış', 'Düzeltme'].map((x) => `<button type="button" data-v="${x}">${x === 'Açılış' ? 'Açılış bakiyesi' : x}</button>`).join('')}</div></div>
      <div class="field"><label>Hesap</label><div class="seg" id="hd-tip"><button type="button" data-v="R" class="r">R</button><button type="button" data-v="GR" class="gr">GR</button></div></div>
      <div class="field" id="hd-yonf"><label>Yön</label><div class="seg" id="hd-yon"><button type="button" data-v="borc">Müşteri bize borçlu</button><button type="button" data-v="alacak">Biz müşteriye borçluyuz</button></div></div>
      ${dovizHtml('hd-dv', pb, pb === 'TRY' ? '' : num(h.kur))}
      <div class="grid2"><div class="field"><label>Tutar (<span id="hd-pbs">${PB[pb]}</span>)</label><input class="input" id="hd-tut" inputmode="decimal" value="${fmtN(tutar0)}"><div class="hint" id="hd-tl"></div></div>
        <div class="field"><label>Tarih</label><input class="input" type="date" id="hd-t" value="${esc(String(h.tarih).slice(0, 10))}"></div></div>
      <div class="grid2"><div class="field" id="hd-osf"><label>Ödeme şekli</label><select class="input" id="hd-os">${['Nakit', 'Havale / EFT', 'Kredi kartı', 'Çek', 'Senet', 'Diğer'].map((o) => `<option ${o === h.odeme_sekli ? 'selected' : ''}>${o}</option>`).join('')}${h.odeme_sekli && !['Nakit', 'Havale / EFT', 'Kredi kartı', 'Çek', 'Senet', 'Diğer'].includes(h.odeme_sekli) ? `<option selected>${esc(h.odeme_sekli)}</option>` : ''}</select></div>
        <div class="field"><label>Belge no</label><input class="input" id="hd-bel" value="${esc(h.belge_no || '')}"></div></div>
      <div class="field"><label>Açıklama</label><input class="input" id="hd-ac" value="${esc(h.aciklama || '')}"></div>`,
    foot: `${isAdmin() ? `<button class="btn red" id="hd-sil">${icon('trash')}Sil</button>` : ''}<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="hd-ok">Kaydet</button>`,
    onMount: (m) => {
      const v = { is: h.islem, tip: h.fatura_tipi, yon: num(h.borc) > 0 ? 'borc' : 'alacak' };
      const ui = () => {
        $$('#hd-is button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v.is));
        $$('#hd-tip button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v.tip));
        $$('#hd-yon button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v.yon));
        $('#hd-yonf', m.el).classList.toggle('hidden', v.is === 'Tahsilat');
        $('#hd-osf', m.el).style.visibility = v.is === 'Tahsilat' ? 'visible' : 'hidden';
      };
      ['is', 'tip', 'yon'].forEach((k) => { $(`#hd-${k}`, m.el).onclick = (e) => { const b = e.target.closest('button'); if (b) { v[k] = b.dataset.v; if (k === 'is' && v.is === 'Tahsilat') v.yon = 'alacak'; ui(); } }; });
      ui();
      const dv = bindDoviz(m.el, 'hd-dv', () => tlG());
      const tlG = () => { const d = dv.get(); $('#hd-pbs', m.el).textContent = PB[d.pb]; const t = parseNum($('#hd-tut', m.el).value); $('#hd-tl', m.el).innerHTML = d.pb !== 'TRY' && t > 0 && d.kur > 0 ? `= <b>${fmtTL(t * d.kur)}</b>` : ''; };
      $('#hd-tut', m.el).oninput = tlG; tlG();
      $('#hd-ok', m.el).onclick = async (e) => {
        const t0 = parseNum($('#hd-tut', m.el).value);
        if (!(t0 > 0)) return toast('Tutar girin', 'err');
        const d = dv.check(); if (!d) return;
        const t = Math.round(t0 * d.kur * 100) / 100;
        const yon = v.is === 'Tahsilat' ? 'alacak' : v.yon;
        const patch = { tarih: $('#hd-t', m.el).value || h.tarih, islem: v.is, fatura_tipi: v.tip, borc: yon === 'borc' ? t : 0, alacak: yon === 'alacak' ? t : 0,
          para_birimi: d.pb, kur: d.kur, doviz_tutar: d.pb === 'TRY' ? null : t0, odeme_sekli: v.is === 'Tahsilat' ? $('#hd-os', m.el).value : null,
          belge_no: $('#hd-bel', m.el).value.trim() || null, aciklama: $('#hd-ac', m.el).value.trim() || null };
        try {
          await busy(e.currentTarget, () => api.update('cari_hareketler', `id=eq.${h.id}`, patch));
          m.close(); cache.dirty('cariler'); toast('Hareket güncellendi', 'ok'); render();
        } catch (err) { fail(err); }
      };
      $('#hd-sil', m.el)?.addEventListener('click', async () => {
        m.close();
        if (!await confirmBox('Hareket silinsin mi?', `${esc(h.islem)} · ${fmtD(h.tarih)} · ${fmtTL(num(h.borc) || num(h.alacak))} kalıcı olarak silinecek.`, 'Sil', true)) return;
        try { await api.del('cari_hareketler', `id=eq.${h.id}`); cache.dirty('cariler'); toast('Silindi', 'ok'); render(); } catch (err) { fail(err); }
      });
    }
  });
}

function cariForm(c = null, preset = null, onSaved = null) {
  const d = c || { unvan: preset?.unvan || '', tip: 'Toptan', yetkili: '', telefon: '', eposta: '', sehir: '', adres: '', vergi_no: '', notlar: '', aktif: true };
  modal({
    title: c ? 'Cariyi düzenle' : 'Yeni cari',
    body: `
      <div class="field"><label>Ünvan / ad soyad</label><input class="input" id="c-un" value="${esc(d.unvan)}"></div>
      <div class="field"><label>Tip</label><div class="seg" id="c-tip"><button type="button" data-v="Toptan">Toptan</button><button type="button" data-v="Perakende">Perakende</button></div>
        <div class="hint">Perakende: her satışta aynı tutarda tahsilat otomatik girilir, bakiye sıfır kalır.</div></div>
      <div class="grid2"><div class="field"><label>Yetkili</label><input class="input" id="c-yet" value="${esc(d.yetkili || '')}"></div>
        <div class="field"><label>Telefon</label><input class="input" id="c-tel" type="tel" value="${esc(d.telefon || '')}"></div></div>
      <div class="grid2"><div class="field"><label>Şehir</label><input class="input" id="c-seh" value="${esc(d.sehir || '')}"></div>
        <div class="field"><label>E-posta</label><input class="input" id="c-ep" type="email" value="${esc(d.eposta || '')}"></div></div>
      <div class="field"><label>Adres</label><input class="input" id="c-adr" value="${esc(d.adres || '')}"></div>
      <div class="grid2"><div class="field"><label>Vergi no / TCKN</label><input class="input" id="c-vn" value="${esc(d.vergi_no || '')}"></div>
        <div class="field"><label>Not</label><input class="input" id="c-not" value="${esc(d.notlar || '')}"></div></div>
      ${c ? `<label class="check"><input type="checkbox" id="c-akt" ${d.aktif ? 'checked' : ''}> Aktif</label>` : ''}`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="c-ok">Kaydet</button>`,
    onMount: (m) => {
      let tip = d.tip;
      const st = () => $$('#c-tip button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === tip));
      st(); $('#c-tip', m.el).onclick = (e) => { const b = e.target.closest('button'); if (b) { tip = b.dataset.v; st(); } };
      $('#c-ok', m.el).onclick = async (e) => {
        const v = (s) => $(s, m.el).value.trim() || null;
        const row = { unvan: $('#c-un', m.el).value.trim(), tip, yetkili: v('#c-yet'), telefon: v('#c-tel'), sehir: v('#c-seh'), eposta: v('#c-ep'), adres: v('#c-adr'), vergi_no: v('#c-vn'), notlar: v('#c-not') };
        if (c) row.aktif = $('#c-akt', m.el).checked;
        if (!row.unvan) return toast('Ünvan girin', 'err');
        try {
          const [saved] = await busy(e.currentTarget, () => (c ? api.update('cariler', `id=eq.${c.id}`, row) : api.insert('cariler', [row])));
          m.close(); cache.dirty('cariler'); toast(c ? 'Cari güncellendi' : `Cari eklendi: ${saved.kod}`, 'ok');
          onSaved ? onSaved(saved) : render();
        } catch (err) { fail(err); }
      };
    }
  });
}

/* Ortak: cari secimi gerektiren formlar icin */
function cariSecField(c) {
  return c ? `<div class="field"><label>Cari</label><input class="input" value="${esc(c.unvan)}" readonly style="background:var(--surface-2)"></div>`
    : `<div class="field picker"><label>Cari</label><input class="input" id="x-cari" placeholder="Cari ara…" autocomplete="off"><div class="hint" id="x-ci"></div></div>`;
}
async function bindCariSec(m, c, onSel) {
  if (c) return;
  const cariler = await cache.cariler();
  picker($('#x-cari', m.el), { items: () => cariler.filter((x) => x.aktif), label: (x) => x.unvan, sub: (x) => `${esc(x.kod)} · R ${fmtTL(x.bakiye_r)} · GR ${fmtTL(x.bakiye_gr)}`,
    onPick: (x) => { $('#x-cari', m.el).value = x.unvan; $('#x-ci', m.el).innerHTML = `Bakiye: R <b>${fmtTL(x.bakiye_r)}</b> · GR <b>${fmtTL(x.bakiye_gr)}</b>`; onSel(x); } });
}

function tahsilat(c = null) {
  let sel = c;
  modal({
    title: 'Tahsilat',
    body: `${cariSecField(c)}
      ${c ? `<p class="small muted" style="margin-top:-4px">Bakiye: R <b>${fmtTL(c.bakiye_r)}</b> · GR <b>${fmtTL(c.bakiye_gr)}</b></p>` : ''}
      <div class="field"><label>Hangi hesaba?</label><div class="seg" id="t-tip"><button type="button" data-v="R" class="r">R</button><button type="button" data-v="GR" class="gr">GR</button></div></div>
      ${dovizHtml('t-dv')}
      <div class="grid2"><div class="field"><label>Tutar (<span id="t-pbs">₺</span>)</label><input class="input" id="t-tut" inputmode="decimal"><div class="hint" id="t-tl"></div></div>
        <div class="field"><label>Tarih</label><input class="input" type="date" id="t-t" value="${today()}"></div></div>
      <div class="grid2"><div class="field"><label>Ödeme şekli</label><select class="input" id="t-os"><option>Nakit</option><option>Havale / EFT</option><option>Kredi kartı</option><option>Çek</option><option>Senet</option><option>Diğer</option></select></div>
        <div class="field"><label>Belge no</label><input class="input" id="t-bel"></div></div>
      <div class="field"><label>Açıklama</label><input class="input" id="t-ac"></div>`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn orange" id="t-ok">${icon('cash')}Tahsilatı kaydet</button>`,
    onMount: async (m) => {
      let tip = c && num(c.bakiye_gr) > num(c.bakiye_r) ? 'GR' : 'R';
      const st = () => $$('#t-tip button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === tip));
      st(); $('#t-tip', m.el).onclick = (e) => { const b = e.target.closest('button'); if (b) { tip = b.dataset.v; st(); } };
      const tdv = bindDoviz(m.el, 't-dv', () => tlGoster());
      const tlGoster = () => { const d = tdv.get(); $('#t-pbs', m.el).textContent = PB[d.pb]; const t = parseNum($('#t-tut', m.el).value); $('#t-tl', m.el).innerHTML = d.pb !== 'TRY' && t > 0 && d.kur > 0 ? `= <b>${fmtTL(t * d.kur)}</b> cariye işlenir` : ''; };
      $('#t-tut', m.el).oninput = tlGoster;
      $('#t-ok', m.el).onclick = async (e) => {
        if (!sel) return toast('Cari seçin', 'err');
        const t = parseNum($('#t-tut', m.el).value);
        if (!(t > 0)) return toast('Tutar girin', 'err');
        const d = tdv.check(); if (!d) return;
        const tl = Math.round(t * d.kur * 100) / 100;
        try {
          await busy(e.currentTarget, () => api.insert('cari_hareketler', [{ tarih: $('#t-t', m.el).value || today(), cari_id: sel.id, islem: 'Tahsilat', fatura_tipi: tip, alacak: tl, para_birimi: d.pb, kur: d.kur, doviz_tutar: d.pb === 'TRY' ? null : t, odeme_sekli: $('#t-os', m.el).value, belge_no: $('#t-bel', m.el).value || null, aciklama: $('#t-ac', m.el).value || null }]));
          m.close(); cache.dirty('cariler'); toast(`${sel.unvan}: ${d.pb !== 'TRY' ? fmtPB(t, d.pb) + ' = ' : ''}${fmtTL(tl)} tahsilat (${tip})`, 'ok'); render();
        } catch (err) { fail(err); }
      };
      try { await bindCariSec(m, c, (x) => { sel = x; tip = num(x.bakiye_gr) > num(x.bakiye_r) ? 'GR' : 'R'; st(); }); } catch (e) { fail(e); }
    }
  });
}

function acilisBakiye(c = null) {
  let sel = c;
  modal({
    title: 'Açılış bakiyesi / düzeltme',
    body: `${cariSecField(c)}
      <div class="field"><label>Kayıt türü</label><div class="seg" id="a-is"><button type="button" data-v="Açılış">Açılış bakiyesi</button><button type="button" data-v="Düzeltme">Düzeltme</button></div></div>
      <div class="field"><label>Hesap</label><div class="seg" id="a-tip"><button type="button" data-v="R" class="r">R</button><button type="button" data-v="GR" class="gr">GR</button></div></div>
      <div class="field"><label>Yön</label><div class="seg" id="a-yon"><button type="button" data-v="borc">Müşteri bize borçlu</button><button type="button" data-v="alacak">Biz müşteriye borçluyuz</button></div></div>
      ${dovizHtml('ab-dv')}
      <div class="grid2"><div class="field"><label>Tutar (<span id="ab-pbs">₺</span>)</label><input class="input" id="a-tut" inputmode="decimal"><div class="hint" id="ab-tl"></div></div>
        <div class="field"><label>Tarih</label><input class="input" type="date" id="a-t" value="${today()}"></div></div>
      <div class="field"><label>Açıklama</label><input class="input" id="a-ac" placeholder="Örn. 29.10.2026 itibarıyla devreden bakiye"></div>
      <p class="tiny">R ve GR bakiyesi olan müşteri için iki ayrı kayıt girin.</p>`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="a-ok">Kaydet</button>`,
    onMount: async (m) => {
      const v = { is: 'Açılış', tip: 'R', yon: 'borc' };
      const seg = (id, k) => { const st = () => $$(`#${id} button`, m.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v[k])); st(); $(`#${id}`, m.el).onclick = (e) => { const b = e.target.closest('button'); if (b) { v[k] = b.dataset.v; st(); } }; };
      seg('a-is', 'is'); seg('a-tip', 'tip'); seg('a-yon', 'yon');
      const adv2 = bindDoviz(m.el, 'ab-dv', () => tlG());
      const tlG = () => { const d = adv2.get(); $('#ab-pbs', m.el).textContent = PB[d.pb]; const t = parseNum($('#a-tut', m.el).value); $('#ab-tl', m.el).innerHTML = d.pb !== 'TRY' && t > 0 && d.kur > 0 ? `= <b>${fmtTL(t * d.kur)}</b> cariye işlenir` : ''; };
      $('#a-tut', m.el).oninput = tlG;
      $('#a-ok', m.el).onclick = async (e) => {
        if (!sel) return toast('Cari seçin', 'err');
        const t0 = parseNum($('#a-tut', m.el).value);
        if (!(t0 > 0)) return toast('Tutar girin', 'err');
        const d = adv2.check(); if (!d) return;
        const t = Math.round(t0 * d.kur * 100) / 100;
        try {
          await busy(e.currentTarget, () => api.insert('cari_hareketler', [{ tarih: $('#a-t', m.el).value || today(), cari_id: sel.id, islem: v.is, fatura_tipi: v.tip, para_birimi: d.pb, kur: d.kur, doviz_tutar: d.pb === 'TRY' ? null : t0,
            borc: v.yon === 'borc' ? t : 0, alacak: v.yon === 'alacak' ? t : 0, aciklama: $('#a-ac', m.el).value || (v.is === 'Açılış' ? 'Açılış bakiyesi' : null) }]));
          m.close(); cache.dirty('cariler'); toast('Kaydedildi', 'ok'); render();
        } catch (err) { fail(err); }
      };
      try { await bindCariSec(m, c, (x) => { sel = x; }); } catch (e) { fail(e); }
    }
  });
}

async function musteriFiyat(c, x = null) {
  let urunler; try { urunler = await cache.urunler(); } catch (e) { return fail(e); }
  let sel = x ? urunler.find((u) => u.id === x.urun_id) : null;
  modal({
    title: x ? 'Müşteri fiyatını düzenle' : 'Müşteri fiyatı ekle',
    body: `<div class="field picker"><label>Ürün</label><input class="input" id="f-u" autocomplete="off" placeholder="Ürün ara…" value="${esc(sel?.ad || '')}" ${x ? 'readonly' : ''}></div>
      <div class="grid3"><div class="field"><label>Fiyat (KDV hariç)</label><input class="input" id="f-fy" inputmode="decimal" value="${x ? fmtN(x.fiyat) : ''}"></div>
        <div class="field"><label>Para birimi</label><select class="input" id="f-pb">${Object.keys(PB).map((k) => `<option value="${k}" ${k === (x?.para_birimi || 'TRY') ? 'selected' : ''}>${PB_AD[k]}</option>`).join('')}</select></div>
        <div class="field"><label>Tarih</label><input class="input" type="date" id="f-t" value="${today()}"></div></div>
      <div class="field"><label>Ödeme koşulu / not</label><input class="input" id="f-k" value="${esc(x?.odeme_kosulu || '')}" placeholder="Örn. 90 gün çek, nakliye hariç"></div>`,
    foot: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="f-ok">Kaydet</button>`,
    onMount: (m) => {
      if (!x) picker($('#f-u', m.el), { items: () => urunler.filter((u) => u.aktif), label: (u) => u.ad, sub: (u) => `${esc(u.kod)} · liste ${fmtTL(u.satis_fiyati)}`, onPick: (u) => { sel = u; $('#f-u', m.el).value = u.ad; $('#f-fy', m.el).focus(); } });
      $('#f-ok', m.el).onclick = async (e) => {
        if (!sel) return toast('Ürün seçin', 'err');
        const fy = parseNum($('#f-fy', m.el).value);
        if (isNaN(fy) || fy < 0) return toast('Fiyat girin', 'err');
        try {
          await busy(e.currentTarget, () => api.insert('musteri_fiyatlari', [{ cari_id: c.id, urun_id: sel.id, fiyat: fy, para_birimi: $('#f-pb', m.el).value, tarih: $('#f-t', m.el).value || today(), odeme_kosulu: $('#f-k', m.el).value || null }], { upsert: true, onConflict: 'cari_id,urun_id' }));
          m.close(); toast('Fiyat kaydedildi', 'ok'); render();
        } catch (err) { fail(err); }
      };
    }
  });
}

/* ------------------------------------------------------------------ */
/* RAPORLAR                                                            */
/* ------------------------------------------------------------------ */
async function viewRaporlar() {
  topbar('Raporlar', { back: !window.matchMedia('(min-width: 900px)').matches });
  const ayar = await cache.ayarlar();
  const ui = state.ui.rapor ||= { bas: monthStart(), bit: today(), yontem: 'SIP' };
  $('#view').innerHTML = `
    <div class="card">
      <h2>Kâr raporu</h2>
      <div class="grid3">
        <div class="field"><label>Başlangıç</label><input class="input" type="date" id="r-b" value="${ui.bas}"></div>
        <div class="field"><label>Bitiş</label><input class="input" type="date" id="r-e" value="${ui.bit}"></div>
        <div class="field"><label>Maliyet yöntemi</label><div class="seg" id="r-y"><button type="button" data-v="SIP">Siparişe göre</button><button type="button" data-v="FIFO">FIFO</button><button type="button" data-v="LIFO">LIFO</button></div></div>
      </div>
      <div class="chips" id="r-p" style="margin-bottom:0"><button class="chip" data-p="ay">Bu ay</button><button class="chip" data-p="gecen">Geçen ay</button><button class="chip" data-p="yil">Bu yıl</button><button class="chip" data-p="hepsi">Tümü</button></div>
    </div>
    <div id="r-out"><div class="loading"><div class="spinner"></div></div></div>
    <div class="section-title">Aylık satış özeti</div>
    <div class="list" id="r-ay"><div class="loading"><div class="spinner"></div></div></div>`;
  const segY = () => $$('#r-y button').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.yontem));
  segY();
  const run = async () => {
    $('#r-out').innerHTML = '<div class="loading"><div class="spinner"></div>Hesaplanıyor…</div>';
    try {
      const rows = await api.rpc('kar_raporu', { p_baslangic: ui.bas || null, p_bitis: ui.bit || null, p_yontem: ui.yontem === 'SIP' ? null : ui.yontem });
      const S = (k, arr = rows) => arr.reduce((a, r) => a + num(r[k]), 0);
      const satis = S('satis_tutari'), mal = S('maliyet'), kar = S('kar'), eksik = S('maliyetsiz_miktar');
      const byU = {};
      rows.forEach((r) => { const o = byU[r.urun_ad] ||= { ad: r.urun_ad, id: r.urun_id, miktar: 0, satis: 0, maliyet: 0, kar: 0, eksik: 0 }; o.miktar += num(r.miktar); o.satis += num(r.satis_tutari); o.maliyet += num(r.maliyet); o.kar += num(r.kar); o.eksik += num(r.maliyetsiz_miktar); });
      const tipT = (t) => { const a = rows.filter((r) => r.fatura_tipi === t); return { s: S('satis_tutari', a), k: S('kar', a) }; };
      const R = tipT('R'), G = tipT('GR');
      $('#r-out').innerHTML = `
        <div class="kpis">
          <div class="kpi"><div class="l">Satış (KDV hariç)</div><div class="v num">${fmtTL(satis)}</div><div class="s">R ${fmtTL(R.s)} · GR ${fmtTL(G.s)}</div></div>
          <div class="kpi orange"><div class="l">Maliyet (${ui.yontem === 'SIP' ? 'siparişe göre' : ui.yontem})</div><div class="v num">${fmtTL(mal)}</div><div class="s">${rows.length} sevk satırı</div></div>
          <div class="kpi green"><div class="l">Brüt kâr</div><div class="v num">${fmtTL(kar)}</div><div class="s">R ${fmtTL(R.k)} · GR ${fmtTL(G.k)}</div></div>
          <div class="kpi purple"><div class="l">Kâr marjı</div><div class="v num">${satis ? fmtN(Math.round((kar / satis) * 1000) / 10) + '%' : '–'}</div><div class="s">kâr / satış</div></div>
        </div>
        ${eksik > 0 ? `<div class="card" style="border-left:4px solid var(--orange)"><b>${fmtN(eksik)} birim satışın maliyeti bilinmiyor.</b> <span class="muted">Bu satışların maliyeti 0 sayıldığı için kâr olduğundan yüksek görünür. <a href="#/stok/hareketler">Stok girişlerine alış fiyatı girin →</a></span></div>` : ''}
        <div class="list"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Satış</th><th class="r">Maliyet</th><th class="r">Kâr</th><th class="r">Marj</th></tr></thead>
          <tbody>${Object.values(byU).sort((a, b) => b.satis - a.satis).map((o) => `<tr><td class="w"><a href="#/urun/${o.id}"><b>${esc(o.ad)}</b></a>${o.eksik ? ` <span class="tiny" style="color:var(--orange)">· ${fmtN(o.eksik)} birim maliyetsiz</span>` : ''}</td><td class="r" data-l="Miktar">${fmtN(o.miktar)}</td><td class="r" data-l="Satış">${fmtTL(o.satis)}</td><td class="r" data-l="Maliyet">${fmtTL(o.maliyet)}</td><td class="r" data-l="Kâr"><b>${fmtTL(o.kar)}</b></td><td class="r" data-l="Marj">${o.satis ? fmtN(Math.round((o.kar / o.satis) * 1000) / 10) + '%' : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Bu aralıkta sevk edilmiş satış yok</td></tr>'}</tbody>
          ${rows.length ? `<tfoot><tr><td class="w">Toplam</td><td></td><td class="r" data-l="Satış">${fmtTL(satis)}</td><td class="r" data-l="Maliyet">${fmtTL(mal)}</td><td class="r" data-l="Kâr">${fmtTL(kar)}</td><td class="r">${satis ? fmtN(Math.round((kar / satis) * 1000) / 10) + '%' : ''}</td></tr></tfoot>` : ''}
        </table></div></div>
        <p class="tiny" style="margin:0 4px 10px">Kâr, sevk tarihine göre ve sevk edilmiş satışlar üzerinden hesaplanır. Satış tutarları KDV hariçtir. “Siparişe göre”: her satış kendi siparişinde seçilen FIFO/LIFO ile hesaplanır; FIFO veya LIFO seçerseniz tüm satışlar o yöntemle yeniden hesaplanır (karşılaştırma için).</p>`;
    } catch (e) { $('#r-out').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  };
  $('#r-b').onchange = (e) => { ui.bas = e.target.value; run(); };
  $('#r-e').onchange = (e) => { ui.bit = e.target.value; run(); };
  $('#r-y').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ui.yontem = b.dataset.v; segY(); run(); };
  $('#r-p').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const d = new Date(); const y = d.getFullYear(), mo = d.getMonth();
    const iso = (dt) => { dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset()); return dt.toISOString().slice(0, 10); };
    if (b.dataset.p === 'ay') { ui.bas = monthStart(); ui.bit = today(); }
    if (b.dataset.p === 'gecen') { ui.bas = iso(new Date(y, mo - 1, 1)); ui.bit = iso(new Date(y, mo, 0)); }
    if (b.dataset.p === 'yil') { ui.bas = `${y}-01-01`; ui.bit = today(); }
    if (b.dataset.p === 'hepsi') { ui.bas = ''; ui.bit = ''; }
    $('#r-b').value = ui.bas; $('#r-e').value = ui.bit; run();
  };
  run();
  try {
    const sp = await api.get('siparisler', `select=tarih,fatura_tipi,ara_toplam,kdv_tutari,genel_toplam&durum=neq.${encodeURIComponent('İptal')}&limit=20000`);
    const by = {};
    sp.forEach((s) => { const k = s.tarih.slice(0, 7); const o = by[k] ||= { n: 0, r: 0, gr: 0, kdv: 0, top: 0 }; o.n++; o[s.fatura_tipi === 'R' ? 'r' : 'gr'] += num(s.ara_toplam); o.kdv += num(s.kdv_tutari); o.top += num(s.genel_toplam); });
    const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    $('#r-ay').innerHTML = `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Ay</th><th class="r">Sipariş</th><th class="r">R (KDV hariç)</th><th class="r">GR</th><th class="r">KDV</th><th class="r">Toplam</th></tr></thead>
      <tbody>${Object.keys(by).sort().reverse().map((k) => `<tr><td class="w"><b>${AY[+k.slice(5) - 1]} ${k.slice(0, 4)}</b> <span class="tiny show-m">· ${by[k].n} sipariş</span></td><td class="r hidden-m">${by[k].n}</td><td class="r" data-l="R">${fmtTL(by[k].r)}</td><td class="r" data-l="GR">${fmtTL(by[k].gr)}</td><td class="r" data-l="KDV">${fmtTL(by[k].kdv)}</td><td class="r" data-l="Toplam"><b>${fmtTL(by[k].top)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Satış yok</td></tr>'}</tbody></table></div>`;
  } catch (e) { $('#r-ay').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------ */
/* AYARLAR + DAHA                                                      */
/* ------------------------------------------------------------------ */
async function viewDaha() {
  topbar('Daha fazla');
  $('#view').innerHTML = `
    <div class="list">
      <div class="row" data-go="#/raporlar"><div class="main-col"><div class="t">Raporlar</div><div class="st">Kâr (FIFO/LIFO), aylık satış özeti</div></div></div>
      <div class="row" data-go="#/stok/hareketler"><div class="main-col"><div class="t">Stok hareketleri</div><div class="st">Girişler, sevkler, alış maliyetleri</div></div></div>
      <div class="row" data-go="#/ayarlar"><div class="main-col"><div class="t">Ayarlar</div><div class="st">Firma, KDV, maliyet yöntemi, yedek</div></div></div>
    </div>
    <div class="list">
      <div class="row" id="d-tah"><div class="main-col"><div class="t">Tahsilat gir</div></div></div>
      <div class="row" id="d-acl"><div class="main-col"><div class="t">Açılış bakiyesi gir</div></div></div>
      <div class="row" id="d-mal"><div class="main-col"><div class="t">Mal alışı gir</div></div></div>
    </div>`;
  bindRows();
  $('#d-tah').onclick = () => tahsilat(); $('#d-acl').onclick = () => acilisBakiye(); $('#d-mal').onclick = () => malAlisi();
}

async function viewAyarlar() {
  topbar('Ayarlar', { back: !window.matchMedia('(min-width: 900px)').matches });
  const a = await cache.ayarlar(true);
  const ad = isAdmin();
  $('#view').innerHTML = `
    <div class="card">
      <h2>Firma ve hesaplama</h2>
      <div class="field"><label>Firma adı</label><input class="input" id="s-f" value="${esc(a.firma_adi)}" ${ad ? '' : 'disabled'}></div>
      <div class="grid2">
        <div class="field"><label>Varsayılan KDV oranı (%)</label><input class="input" id="s-k" inputmode="decimal" value="${fmtN(num(a.kdv_orani) * 100)}" ${ad ? '' : 'disabled'}><div class="hint">R siparişlerde kullanılır, siparişte değiştirilebilir</div></div>
        <div class="field"><label>Varsayılan kâr yöntemi</label><div class="seg" id="s-y"><button type="button" data-v="FIFO">FIFO</button><button type="button" data-v="LIFO">LIFO</button></div><div class="hint">Yeni siparişte önceden seçili gelir; her siparişte değiştirilebilir</div></div>
      </div>
      <div class="field"><label>Gönderim şekilleri (her satıra bir tane)</label><textarea class="input" id="s-g" rows="6" ${ad ? '' : 'disabled'}>${esc((a.gonderim_sekilleri || []).join('\n'))}</textarea></div>
      <div class="field"><label>Perakende varsayılan gönderimler (her satıra bir tane)</label><textarea class="input" id="s-p" rows="2" ${ad ? '' : 'disabled'}>${esc((a.perakende_gonderimler || []).join('\n'))}</textarea><div class="hint">Perakende cariye sipariş açılınca ilki otomatik seçilir</div></div>
      ${ad ? '<button class="btn primary" id="s-ok">Ayarları kaydet</button>' : '<p class="tiny">Ayarları sadece yönetici değiştirebilir.</p>'}
    </div>
    <div class="card">
      <h2>Yedekler</h2>
      <p class="small muted" style="margin-top:0">Her gece 03:00'te tüm veriler otomatik olarak Excel'e yedeklenir. Son 7 günün yedeği saklanır, daha eskileri kendiliğinden silinir.</p>
      <div id="yd-list"><div class="loading" style="padding:14px"><div class="spinner"></div></div></div>
      <div class="btn-row" style="margin-top:10px">
        ${ad ? `<button class="btn" id="s-now">${icon('inbox')}Şimdi yedek al</button>` : ''}
        <button class="btn green" id="s-bk">${icon('download')}Anlık Excel indir</button>
      </div>
    </div>
    <div class="card">
      <h2>Hesap</h2>
      <div class="kv"><span class="k">Kullanıcı</span><span>${esc(state.profil?.ad || '')}</span><span class="k">E-posta</span><span>${esc(api.session?.user?.email || '')}</span><span class="k">Yetki</span><span>${ad ? 'Yönetici' : 'Personel'}</span></div>
      <button class="btn red" id="s-out" style="margin-top:14px">${icon('logout')}Çıkış yap</button>
    </div>
    <p class="tiny" style="text-align:center">Sipariş • Stok • Cari · v1.10</p>`;
  let yon = a.maliyet_yontemi;
  const sy = () => $$('#s-y button').forEach((b) => b.classList.toggle('on', b.dataset.v === yon));
  sy(); $('#s-y').onclick = (e) => { if (!ad) return; const b = e.target.closest('button'); if (b) { yon = b.dataset.v; sy(); } };
  $('#s-ok')?.addEventListener('click', async (e) => {
    const k = parseNum($('#s-k').value) / 100;
    if (isNaN(k) || k < 0 || k >= 1) return toast('KDV oranı 0–99 arasında olmalı', 'err');
    const lines = (s) => $(s).value.split('\n').map((x) => x.trim()).filter(Boolean);
    try {
      await busy(e.currentTarget, () => api.update('ayarlar', 'id=eq.1', { firma_adi: $('#s-f').value.trim() || 'Firmam', kdv_orani: k, maliyet_yontemi: yon, gonderim_sekilleri: lines('#s-g'), perakende_gonderimler: lines('#s-p'), guncelleme: new Date().toISOString() }));
      await cache.ayarlar(true); state.ui.rapor = null; toast('Ayarlar kaydedildi', 'ok'); render();
    } catch (err) { fail(err); }
  });
  $('#s-bk').onclick = (e) => busy(e.currentTarget, yedekAl).catch(fail);
  const yedekListe = async () => {
    const el = $('#yd-list'); if (!el) return;
    if (!ad) { el.innerHTML = '<p class="tiny">Yedekleri sadece yönetici görebilir.</p>'; return; }
    try {
      const r = await api.raw('storage/v1/object/list/yedekler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'name', order: 'desc' } }) });
      const ls = (await r.json()).filter((o) => /^yedek-\d{4}-\d{2}-\d{2}\.xlsx$/.test(o.name));
      el.innerHTML = ls.length ? `<div class="list" style="box-shadow:none;border:1px solid var(--line);margin:0">${ls.map((o) => `<div class="row" style="cursor:default">
          <div class="main-col"><div class="t">${fmtD(o.name.slice(6, 16))}</div><div class="st">${esc(o.name)} · ${o.metadata?.size ? fmtN(Math.round(o.metadata.size / 1024)) + ' KB' : ''}</div></div>
          <button class="btn sm" data-yd="${esc(o.name)}">${icon('download')}İndir</button></div>`).join('')}</div>`
        : '<p class="tiny">Henüz otomatik yedek yok; ilki bu gece alınacak.</p>';
      $$('[data-yd]', el).forEach((b) => b.onclick = () => busy(b, async () => {
        const name = b.dataset.yd;
        const blob = await (await api.raw(`storage/v1/object/yedekler/${encodeURIComponent(name)}`)).blob();
        const file = new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (ios && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') throw e; } return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }).catch(fail));
    } catch (e) { el.innerHTML = `<p class="tiny" style="color:var(--red)">Yedek listesi alınamadı: ${esc(e.message)}</p>`; }
  };
  yedekListe();
  $('#s-now')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await (await api.raw('functions/v1/gunluk-yedek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    toast(`Yedek alındı: ${r.dosya}`, 'ok'); yedekListe();
  }).catch(fail));
  $('#s-out').onclick = async () => { if (await confirmBox('Çıkış yapılsın mı?', 'Tekrar girmek için e-posta ve şifreniz gerekecek.', 'Çıkış yap', true)) { await api.logout(); Object.assign(state, { profil: null, ayarlar: null, urunler: null, cariler: null, ui: {} }); location.hash = '#/'; render(); } };
}

/* ------------------------------------------------------------------ */
/* Excel yedek (kutuphanesiz .xlsx yazici)                              */
/* ------------------------------------------------------------------ */
async function yedekAl() {
  const T = [
    ['Urunler', 'v_stok', 'select=kod,ad,kategori,birim,satis_fiyati,min_stok,toplam_giris,toplam_cikis,real_stok,bekleyen_siparis,sevk_sonrasi_stok,son_alis_fiyati,durum,aktif&order=kod'],
    ['Cariler', 'v_cariler', 'select=kod,unvan,tip,yetkili,telefon,eposta,sehir,adres,vergi_no,bakiye_r,bakiye_gr,bakiye,aktif,notlar&order=kod'],
    ['Siparisler', 'v_siparisler', 'select=fis_no,tarih,cari_kod,cari_unvan,fatura_tipi,para_birimi,kur,maliyet_yontemi,gonderim_sekli,sevk_sehri,durum,sevk_tarihi,kdv_orani,ara_toplam,kdv_tutari,genel_toplam,aciklama&order=fis_no'],
    ['Siparis Kalemleri', 'siparis_kalemleri', 'select=siparisler(fis_no),urunler(kod,ad),miktar,birim_fiyat,doviz_fiyat,tutar&order=id'],
    ['Stok Hareketleri', 'stok_hareketleri', 'select=tarih,urunler(kod,ad),tur,islem,fatura_tipi,kdv_orani,para_birimi,kur,doviz_maliyet,miktar,birim_maliyet,tedarikci,belge_no,aciklama,siparisler(fis_no)&order=tarih,id'],
    ['Cari Hareketler', 'v_cari_ekstre', 'select=tarih,cari_kod,cari_unvan,islem,fatura_tipi,belge_no,matrah,kdv_tutari,borc,alacak,para_birimi,kur,doviz_tutar,odeme_sekli,aciklama,yuruyen_bakiye&order=cari_kod,tarih,id'],
    ['Musteri Fiyatlari', 'musteri_fiyatlari', 'select=cariler(kod,unvan),urunler(kod,ad),fiyat,para_birimi,odeme_kosulu,tarih&order=id']
  ];
  const flat = (o, p = '') => Object.entries(o).reduce((a, [k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.assign(a, flat(v, p + k + '_')) : ((a[p + k] = v), a)), {});
  const sheets = [];
  for (const [name, t, q] of T) { const rows = (await api.get(t, q + '&limit=100000')).map((r) => flat(r)); sheets.push({ name, rows }); }
  const blob = xlsxBlob(sheets);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `yedek-${today()}.xlsx`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Yedek indirildi', 'ok');
}
function xlsxBlob(sheets) {
  const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const files = {};
  sheets.forEach((sh, si) => {
    const keys = sh.rows.length ? Object.keys(sh.rows[0]) : ['(bos)'];
    const rowXml = (vals, r) => `<row r="${r}">${vals.map((v, c) => {
      const ref = col(c) + r;
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 && !/^0\d/.test(v))) return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'Evet' : 'Hayır'}</t></is></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('')}</row>`;
    const body = [rowXml(keys, 1), ...sh.rows.map((r, i) => rowXml(keys.map((k) => r[k]), i + 2))].join('');
    files[`xl/worksheets/sheet${si + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`;
  });
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function zipStore(files) {
  const enc = new TextEncoder();
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = []; let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const nb = enc.encode(name), data = enc.encode(content), c = crc(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

/* ------------------------------------------------------------------ */
/* Baslat                                                              */
/* ------------------------------------------------------------------ */
Object.assign(window, { go, render, malAlisi, tahsilat, acilisBakiye, urunForm, cariForm, stokDuzelt });
api.load();
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
