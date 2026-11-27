// GİZEM EV PLANLAMA PROGRAMI: sadece harcama girilen ayri program (harcama.html). Kullanici adi + sifre ile girilir.
// Kasa, cari ya da baska veri gorulmez; tum islemler gider-gir edge function'indan gecer.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/gider-gir`;
  const ANAHTAR = 'harcama_t';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tl = (n) => `${nf.format(n)} ₺`;
  const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fmtD = (d) => (d ? d.split('-').reverse().join('.') : '');
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const sayi = (s) => { s = String(s || '').replace(/[^\d.,]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, ''); return Number(s); };
  const IK = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    cikis: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'
  };
  const ik = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IK[n]}</svg>`;
  const tOku = () => { try { return localStorage.getItem(ANAHTAR) || ''; } catch { return ''; } };
  const tYaz = (t) => { try { t ? localStorage.setItem(ANAHTAR, t) : localStorage.removeItem(ANAHTAR); } catch { /* */ } };
  const cagir = async (body) => {
    let r;
    try { r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new Error('Bağlantı kurulamadı. İnternetinizi kontrol edin.'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404 || r.status === 410) { if (body.t) { tYaz(''); setTimeout(() => giris(j.hata), 0); } }
    if (!r.ok) throw new Error(j.hata || 'Bir hata oluştu, tekrar deneyin.');
    return j;
  };

  /* ---------- giris ---------- */
  function giris(mesaj = '') {
    document.title = 'GİZEM EV PLANLAMA PROGRAMI';
    $('#app').innerHTML = `<div class="hc-giris"><div class="card">
      <div class="hc-marka"><div class="hc-amblem"><img src="icons/ev-192.png" alt=""></div><div><b>GİZEM EV PLANLAMA PROGRAMI</b><small>Kullanıcı adı ve şifrenizle girin</small></div></div>
      <div class="field"><label>Kullanıcı adı</label><input class="input" id="g-k" autocapitalize="off" autocomplete="username"></div>
      <div class="field"><label>Şifre</label><input class="input" id="g-s" type="password" autocomplete="current-password"></div>
      <button class="btn primary" id="g-ok" style="width:100%;margin-top:4px">Giriş yap</button>
      <div class="hc-msj err" id="g-m">${esc(mesaj)}</div></div></div>`;
    const ok = async () => {
      const b = $('#g-ok'); b.disabled = true; b.textContent = 'Giriş yapılıyor…'; $('#g-m').textContent = '';
      try { const r = await cagir({ islem: 'giris', kullanici: $('#g-k').value, sifre: $('#g-s').value }); tYaz(r.t); ana(); }
      catch (e) { $('#g-m').textContent = e.message; b.disabled = false; b.textContent = 'Giriş yap'; }
    };
    $('#g-ok').onclick = ok;
    $('#g-s').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  /* ---------- ana ekran ---------- */
  let sekme = 'ekle', bilgi = null, ay = bugun().slice(0, 7);
  async function ana() {
    const t = tOku(); if (!t) return giris();
    $('#app').innerHTML = `<div class="main"><header class="topbar"><div class="hc-ust" style="flex:1;min-width:0"><img src="icons/ev-192.png" alt=""><h1 id="u-bas">Gizem Ev Planlama</h1></div><button class="tb-btn" id="u-cik">${ik('cikis')}Çıkış</button></header>
      <main class="view" id="view"><div class="loading"><div class="spinner"></div>Yükleniyor…</div></main></div>
      <nav class="bottomnav"><a data-s="ekle">${ik('plus')}Harcama Ekle</a><a data-s="liste">${ik('list')}Harcamalarım</a></nav>`;
    $('#u-cik').onclick = () => { if (confirm('Çıkış yapılsın mı?')) { tYaz(''); giris(); } };
    $$('.bottomnav a').forEach((a) => (a.onclick = () => { sekme = a.dataset.s; ciz(); }));
    try { bilgi = await cagir({ islem: 'bilgi', t }); } catch (e) { if (tOku()) $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
    $('#u-bas').textContent = 'Gizem Ev Planlama';
    document.title = 'GİZEM EV PLANLAMA PROGRAMI';
    ciz();
  }
  const yenile = async () => { bilgi = await cagir({ islem: 'bilgi', t: tOku() }); };

  function ciz() {
    $$('.bottomnav a').forEach((a) => a.classList.toggle('active', a.dataset.s === sekme));
    if (sekme === 'ekle') return ekleCiz();
    listeCiz();
  }

  function ekleCiz() {
    let kat = '', os = 'Nakit';
    const bugunT = bilgi.son.filter((x) => x.tarih === bugun()).reduce((a, x) => a + x.tutar, 0);
    $('#view').innerHTML = `
      <div class="card">
        <div class="field"><label>Tutar (₺)</label><input class="input hc-tutar" id="e-t" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
        <div class="field"><label>Kategori</label><div class="kats" id="e-k">${bilgi.kategoriler.map((k) => `<button type="button" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>
        <div class="field"><label>Açıklama</label><input class="input" id="e-a" maxlength="200" placeholder="Örn. Migros market, elektrik faturası"></div>
        <div class="grid2">
          <div class="field"><label>Tarih</label><input class="input" type="date" id="e-d" value="${bugun()}" max="${bugun()}"></div>
          <div class="field"><label>Nasıl ödendi?</label><select class="input" id="e-o">${bilgi.odeme_sekilleri.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
        </div>
        <label class="check" style="margin:2px 0 12px"><input type="checkbox" id="e-f"> <span>Faturası / fişi var</span></label>
        <button class="btn green" id="e-ok" style="width:100%;font-size:17px;padding:14px">Harcamayı kaydet</button>
        <div class="hc-msj" id="e-m"></div>
      </div>
      <p class="tiny" style="margin:0 4px">Bugün girdiğiniz: <b>${tl(bugunT)}</b>. Yanlış girişi 24 saat içinde “Harcamalarım”dan silebilirsiniz.</p>`;
    $('#e-k').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; kat = b.dataset.k; $$('#e-k button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('#e-o').onchange = (e) => { os = e.target.value; };
    $('#e-ok').onclick = async () => {
      const m = $('#e-m'), b = $('#e-ok'), tutar = Math.round(sayi($('#e-t').value) * 100) / 100;
      if (!(tutar > 0)) { m.className = 'hc-msj err'; m.textContent = 'Tutarı girin.'; $('#e-t').focus(); return; }
      if (!kat) { m.className = 'hc-msj err'; m.textContent = 'Kategori seçin.'; return; }
      b.disabled = true; b.textContent = 'Kaydediliyor…'; m.textContent = '';
      try {
        await cagir({ islem: 'ekle', t: tOku(), tutar, kategori: kat, aciklama: $('#e-a').value, tarih: $('#e-d').value, odeme_sekli: os, faturali: $('#e-f').checked });
        await yenile(); ekleCiz();
        const m2 = $('#e-m'); m2.className = 'hc-msj ok'; m2.textContent = `✓ ${tl(tutar)} · ${kat} kaydedildi`;
      } catch (e) { m.className = 'hc-msj err'; m.textContent = e.message; b.disabled = false; b.textContent = 'Harcamayı kaydet'; }
    };
  }

  function listeCiz() {
    const aylar = [...new Set([bugun().slice(0, 7), ...bilgi.son.map((x) => String(x.tarih).slice(0, 7))])].sort().reverse();
    if (!aylar.includes(ay)) ay = aylar[0];
    const k = bilgi.son.filter((x) => String(x.tarih).slice(0, 7) === ay);
    const top = k.reduce((a, x) => a + x.tutar, 0);
    const gun = {}; k.forEach((x) => (gun[x.tarih] ||= []).push(x));
    $('#view').innerHTML = `
      <div class="toolbar" style="margin-bottom:10px"><select class="input" id="l-ay" style="max-width:220px">${aylar.map((a) => `<option value="${a}" ${a === ay ? 'selected' : ''}>${AY[+a.slice(5) - 1]} ${a.slice(0, 4)}</option>`).join('')}</select></div>
      <div class="kpis"><div class="kpi orange"><div class="l">${AY[+ay.slice(5) - 1]} toplamı</div><div class="v num">${tl(top)}</div><div class="s">${k.length} harcama</div></div></div>
      ${Object.keys(gun).sort().reverse().map((d) => `<div class="section-title">${fmtD(d)} <span class="tiny" style="text-transform:none;letter-spacing:0;font-weight:500">· ${tl(gun[d].reduce((a, x) => a + x.tutar, 0))}</span></div>
        <div class="list">${gun[d].map((x) => `<div class="row" style="cursor:default"><div class="main-col"><div class="t">${esc(x.aciklama || x.kategori)} <span class="badge">${esc(x.kategori)}</span>${x.faturali ? ' <span class="badge b-blue">Faturalı</span>' : ''}</div><div class="st">${esc(x.odeme_sekli || '')}</div></div>
          <div class="end"><div class="amt">${tl(x.tutar)}</div>${x.silinebilir ? `<button class="btn sm red" data-sil="${x.id}">Sil</button>` : ''}</div></div>`).join('')}</div>`).join('') || '<div class="card empty">Bu ay girdiğiniz harcama yok.</div>'}`;
    $('#l-ay').onchange = (e) => { ay = e.target.value; listeCiz(); };
    $$('[data-sil]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Bu harcama silinsin mi?')) return;
      b.disabled = true;
      try { await cagir({ islem: 'sil', t: tOku(), id: +b.dataset.sil }); await yenile(); listeCiz(); } catch (e) { alert(e.message); b.disabled = false; }
    }));
  }

  tOku() ? ana() : giris();
})();
