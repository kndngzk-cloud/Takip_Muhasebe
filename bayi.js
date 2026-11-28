// B2B BAYİ PORTALI (bayi.html): musteri kendi kullanici adi + sifresiyle girer.
// Yonetici her kullanici icin neleri yapabilecegini secer (siparis, cari ekstre R/GR, kartla odeme...).
// Fiyatlar musteriye ozel fiyattir; musteri degistiremez (sunucu fiyati kendisi hesaplar). Tum islemler b2b edge function'indan gecer.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/b2b`;
  const ANAHTAR = 'bayi_t';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfN = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
  const SEM = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
  const tl = (n) => `${nf.format(Number(n) || 0)} ₺`;
  const pbF = (n, pb) => `${nf.format(Number(n) || 0)} ${SEM[pb] || pb || '₺'}`;
  const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
  const fmtZ = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const sayi = (s) => { s = String(s ?? '').replace(/[^\d.,]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s); };
  const r2 = (v) => Math.round(v * 100) / 100;
  const IK = {
    sepet: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    hesap: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
    kart: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    yaz: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
  };
  const ik = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">${IK[n]}</svg>`;
  const tOku = () => { try { return localStorage.getItem(ANAHTAR) || ''; } catch { return ''; } };
  const tYaz = (t) => { try { t ? localStorage.setItem(ANAHTAR, t) : localStorage.removeItem(ANAHTAR); } catch { /* */ } };
  const cagir = async (body) => {
    let r;
    try { r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, t: body.islem === 'giris' ? undefined : tOku() }) }); }
    catch { throw new Error('Bağlantı kurulamadı. İnternetinizi kontrol edin.'); }
    const j = await r.json().catch(() => ({}));
    if ((r.status === 404 || r.status === 410) && body.islem !== 'giris' && /Oturum|Hesab|Cari hesab/.test(j.hata || '')) { tYaz(''); setTimeout(() => giris(j.hata), 0); }
    if (!r.ok) throw new Error(j.hata || 'Bir hata oluştu, tekrar deneyin.');
    return j;
  };
  const toast = (m, tip = '') => {
    let root = $('#toast-root'); if (!root) { root = document.createElement('div'); root.id = 'toast-root'; document.body.appendChild(root); }
    const d = document.createElement('div'); d.className = `toast ${tip}`; d.textContent = m; root.appendChild(d); setTimeout(() => d.remove(), 3200);
  };
  function modal({ title, body, foot = '', onMount }) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="sheet"><div class="sh-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${ik('x')}</button></div><div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ''}</div>`;
    const close = () => { ov.remove(); if (!$('#modal-root .overlay')) document.body.style.overflow = ''; };
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    $('#modal-root').appendChild(ov); document.body.style.overflow = 'hidden';
    const ctx = { el: ov, close }; onMount && onMount(ctx); return ctx;
  }
  const yukleniyor = () => { $('#view').innerHTML = '<div class="loading"><div class="spinner"></div>Yükleniyor…</div>'; };
  const hataGoster = (e) => { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; };

  /* ---------- giris ---------- */
  function giris(mesaj = '') {
    document.title = 'Bayi Portalı';
    $('#modal-root').innerHTML = ''; document.body.style.overflow = '';
    $('#app').innerHTML = `<div class="by-giris"><div class="card">
      <div class="by-marka"><img src="icons/lama-192.png" alt=""><div><b>Bayi Portalı</b><small>Size verilen kullanıcı adı ve şifreyle girin</small></div></div>
      <div class="field"><label>Kullanıcı adı</label><input class="input" id="g-k" autocapitalize="off" autocomplete="username"></div>
      <div class="field"><label>Şifre</label><input class="input" id="g-s" type="password" autocomplete="current-password"></div>
      <button class="btn primary" id="g-ok" style="width:100%;margin-top:4px">Giriş yap</button>
      <div class="by-msj err" id="g-m">${esc(mesaj)}</div>
      <p class="tiny" style="margin:12px 0 0">Şifrenizi unuttuysanız firmamızdan yeni şifre isteyin.</p></div></div>`;
    const ok = async () => {
      const b = $('#g-ok'); b.disabled = true; b.textContent = 'Giriş yapılıyor…'; $('#g-m').textContent = '';
      try { const r = await cagir({ islem: 'giris', kullanici: $('#g-k').value, sifre: $('#g-s').value }); tYaz(r.t); ana(); }
      catch (e) { $('#g-m').textContent = e.message; b.disabled = false; b.textContent = 'Giriş yap'; }
    };
    $('#g-ok').onclick = ok;
    $('#g-s').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  /* ---------- ana ekran ---------- */
  let bilgi = null, sekme = '', urunler = null;
  const sepetAnahtar = () => `bayi_sepet_${bilgi?.kullanici || ''}`;
  let sepet = {}; // urun_id -> miktar
  const sepetOku = () => { try { sepet = JSON.parse(localStorage.getItem(sepetAnahtar()) || '{}') || {}; } catch { sepet = {}; } };
  const sepetYaz = () => { try { Object.keys(sepet).length ? localStorage.setItem(sepetAnahtar(), JSON.stringify(sepet)) : localStorage.removeItem(sepetAnahtar()); } catch { /* */ } };

  async function ana() {
    if (!tOku()) return giris();
    $('#app').innerHTML = `<div class="main"><header class="topbar"><img class="by-logo" src="icons/lama-192.png" alt=""><h1 id="u-bas">Bayi Portalı</h1><button class="tb-btn" id="u-hes">${ik('kisi')}Hesabım</button></header>
      <main class="view" id="view"><div class="loading"><div class="spinner"></div>Yükleniyor…</div></main></div><nav class="bottomnav" id="nav"></nav>`;
    try { bilgi = await cagir({ islem: 'bilgi' }); } catch (e) { if (tOku()) hataGoster(e); return; }
    const y = bilgi.yetkiler;
    document.title = `${bilgi.firma || 'Bayi'} · Bayi Portalı`;
    $('#u-bas').textContent = bilgi.cari.unvan;
    sepetOku();
    const sekmeler = [
      y.siparis && ['siparis', 'sepet', 'Sipariş Ver'],
      (y.siparis || y.siparislerim) && ['siparislerim', 'list', 'Siparişlerim'],
      (y.ekstre_r || y.ekstre_gr) && ['hesap', 'hesap', 'Cari Hesap'],
      y.kart_odeme && ['odeme', 'kart', 'Ödeme Yap']
    ].filter(Boolean);
    $('#nav').innerHTML = sekmeler.map(([k, i, t]) => `<a data-s="${k}">${ik(i)}${t}</a>`).join('');
    $$('#nav a').forEach((a) => (a.onclick = () => { sekme = a.dataset.s; ciz(); }));
    $('#u-hes').onclick = hesabim;
    if (!sekmeler.length) { $('#view').innerHTML = '<div class="card empty">Hesabınıza henüz bir yetki tanımlanmamış. Lütfen firmamızla iletişime geçin.</div>'; return; }
    if (!sekmeler.some((s) => s[0] === sekme)) sekme = sekmeler[0][0];
    ciz();
  }
  let cizNo = 0; // hizli sekme degisiminde gec gelen cevap yeni ekranin uzerine yazmasin
  const eski = (no) => no !== cizNo;
  function ciz() {
    cizNo++;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.s === sekme));
    window.scrollTo(0, 0);
    ({ siparis: siparisCiz, siparislerim: siparislerimCiz, hesap: hesapCiz, odeme: odemeCiz })[sekme]?.();
  }

  /* ---------- Hesabım: bilgiler, sifre degistir, cikis ---------- */
  function hesabim() {
    const il = bilgi.iletisim || {};
    modal({
      title: 'Hesabım',
      body: `<div class="kv" style="margin-bottom:14px"><span class="k">Firma</span><span>${esc(bilgi.cari.unvan)}</span><span class="k">Cari kod</span><span>${esc(bilgi.cari.kod)}</span>
          <span class="k">Kullanıcı</span><span>${esc(bilgi.ad)} (${esc(bilgi.kullanici)})</span></div>
        <div class="section-title" style="margin-top:4px">Şifre değiştir</div>
        <div class="field"><label>Mevcut şifre</label><input class="input" type="password" id="h-e" autocomplete="current-password"></div>
        <div class="field"><label>Yeni şifre (en az 6 karakter)</label><input class="input" type="password" id="h-y" autocomplete="new-password"></div>
        <button class="btn" id="h-ok">Şifreyi değiştir</button><div class="by-msj" id="h-m"></div>
        ${il.telefon || il.eposta || il.web ? `<div class="section-title">İletişim</div><div class="small">${[il.telefon && `Tel: <a href="tel:${esc(il.telefon)}">${esc(il.telefon)}</a>`, il.eposta && `E-posta: <a href="mailto:${esc(il.eposta)}">${esc(il.eposta)}</a>`, il.web && esc(il.web)].filter(Boolean).join('<br>')}</div>` : ''}
        <p class="tiny" style="margin-top:14px">Telefonda Paylaş → “Ana Ekrana Ekle” ile portalı uygulama gibi kullanabilirsiniz.</p>`,
      foot: '<button class="btn red" id="h-cik">Çıkış yap</button><button class="btn" data-close>Kapat</button>',
      onMount: (m) => {
        $('#h-cik', m.el).onclick = () => { if (confirm('Çıkış yapılsın mı?')) { tYaz(''); m.close(); giris(); } };
        $('#h-ok', m.el).onclick = async (e) => {
          const b = e.currentTarget, msj = $('#h-m', m.el); msj.textContent = '';
          if ($('#h-y', m.el).value.length < 6) { msj.className = 'by-msj err'; msj.textContent = 'Yeni şifre en az 6 karakter olmalı.'; return; }
          b.disabled = true;
          try { const r = await cagir({ islem: 'sifre', eski: $('#h-e', m.el).value, yeni: $('#h-y', m.el).value }); tYaz(r.t); msj.className = 'by-msj ok'; msj.textContent = '✓ Şifreniz değiştirildi'; $('#h-e', m.el).value = $('#h-y', m.el).value = ''; }
          catch (err) { msj.className = 'by-msj err'; msj.textContent = err.message; }
          b.disabled = false;
        };
      }
    });
  }

  /* ---------- Sipariş ver ---------- */
  const STOK = { Var: 'b-green', Az: 'b-orange', Yok: 'b-red', Yolda: 'b-blue' };
  const STOK_AD = { Var: 'Stokta', Az: 'Az stok', Yok: 'Stokta yok', Yolda: 'Yolda' };
  let ara = '', kat = '', sadeceSepet = false;
  async function siparisCiz() {
    const no = cizNo;
    if (!urunler) { yukleniyor(); try { urunler = (await cagir({ islem: 'urunler' })).urunler; } catch (e) { return eski(no) || hataGoster(e); } if (eski(no)) return; }
    // listede artik olmayan urunleri sepetten cikar
    Object.keys(sepet).forEach((id) => { if (!urunler.some((u) => u.id === +id)) delete sepet[id]; }); sepetYaz();
    const katlar = [...new Set(urunler.map((u) => u.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const kdvNot = bilgi.fatura_secenek.includes('R') ? (bilgi.fatura_secenek.length > 1 ? 'Fiyatlar KDV hariçtir (faturalı siparişte KDV eklenir)' : `Fiyatlar KDV hariçtir · %${nfN.format(bilgi.kdv_orani * 100)} KDV eklenir`) : 'Fiyatlar size özel net fiyatlardır';
    $('#view').innerHTML = `
      ${bilgi.onay_bekleyen ? `<div class="card no-print" style="border-left:4px solid var(--orange);padding:10px 14px"><b>${bilgi.onay_bekleyen} siparişiniz onay bekliyor.</b> <a href="#" id="s-git">Siparişlerim</a></div>` : ''}
      <div class="card" style="padding:10px;display:flex;gap:8px;align-items:center">
        <input class="input" id="s-ara" placeholder="Ürün adı ya da kodu ile ara" value="${esc(ara)}" style="flex:1;min-width:0" autocomplete="off">
      </div>
      ${katlar.length > 1 ? `<div class="chips" id="s-kat"><button class="chip ${!kat ? 'on' : ''}" data-k="">Tümü</button>${katlar.map((k) => `<button class="chip ${kat === k ? 'on' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
      <p class="tiny" style="margin:0 4px 8px">${kdvNot}. Fiyatlar firmamızca belirlenmiştir.</p>
      <div class="list" id="s-liste"></div>
      <div id="s-bar"></div>`;
    $('#s-git')?.addEventListener('click', (e) => { e.preventDefault(); sekme = 'siparislerim'; ciz(); });
    $('#s-ara').oninput = (e) => { ara = e.target.value; listeCiz(); };
    $('#s-kat')?.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kat = b.dataset.k; $$('#s-kat .chip').forEach((x) => x.classList.toggle('on', x === b)); listeCiz(); });
    listeCiz(); barCiz();
  }
  const fiyatAlt = (u) => (u.pb !== 'TRY' && u.doviz_fiyat ? `<span class="tiny">${pbF(u.doviz_fiyat, u.pb)} × ${nfN.format(u.kur)} kur</span>` : '');
  function listeCiz() {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    const f = urunler.filter((u) => (!kat || u.kategori === kat) && (!sadeceSepet || sepet[u.id]) && (!q || `${u.ad} ${u.kod}`.toLocaleLowerCase('tr-TR').includes(q)));
    $('#s-liste').innerHTML = f.length ? f.slice(0, 300).map((u) => `<div class="ur ${sepet[u.id] ? 'secili' : ''}" data-u="${u.id}">
        <div style="flex:1;min-width:0"><div class="ad">${esc(u.ad)}</div>
          <div class="alt">${u.kod ? `<span>${esc(u.kod)}</span>` : ''}${u.stok ? `<span class="badge ${STOK[u.stok]}">${STOK_AD[u.stok]}</span>` : ''}${u.kosul ? `<span>${esc(u.kosul)}</span>` : ''}</div>
          <div style="margin-top:4px"><span class="fy">${tl(u.fiyat)}</span> <span class="tiny">/ ${esc(u.birim)}</span> ${fiyatAlt(u)}</div></div>
        <div class="adet"><button data-e="-1" aria-label="azalt">−</button><input class="input" inputmode="decimal" value="${sepet[u.id] ? nfN.format(sepet[u.id]) : ''}" placeholder="0" aria-label="miktar"><button data-e="1" aria-label="artır">+</button></div></div>`).join('')
      : `<div class="empty">${urunler.length ? 'Aramanıza uygun ürün yok.' : 'Size tanımlı ürün fiyatı henüz yok. Lütfen firmamızla iletişime geçin.'}</div>`;
    $$('#s-liste .ur').forEach((row) => {
      const id = +row.dataset.u, inp = $('input', row);
      const ayarla = (v) => { v = r2(Math.max(0, v)); if (v > 0) sepet[id] = v; else delete sepet[id]; inp.value = v > 0 ? nfN.format(v) : ''; row.classList.toggle('secili', v > 0); sepetYaz(); barCiz(); };
      $$('[data-e]', row).forEach((b) => (b.onclick = () => ayarla((sepet[id] || 0) + Number(b.dataset.e))));
      inp.onchange = () => ayarla(sayi(inp.value) || 0);
      inp.onfocus = () => inp.select();
    });
  }
  const sepetKalem = () => Object.entries(sepet).map(([id, m]) => ({ u: urunler.find((x) => x.id === +id), m })).filter((x) => x.u);
  function barCiz() {
    const k = sepetKalem(), top = r2(k.reduce((a, x) => a + r2(x.m * x.u.fiyat), 0));
    $('#s-bar').innerHTML = k.length ? `<div class="sepet-bar no-print"><div class="ozet"><b>Sepet: ${k.length} kalem · ${tl(top)}</b>${bilgi.fatura_secenek.includes('R') ? ' <span class="tiny" style="color:#cfd8ea">KDV hariç</span>' : ''}</div>
      <button class="btn sm" id="s-sadece" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4);flex:1">${sadeceSepet ? 'Tümünü göster' : 'Sepeti göster'}</button><button class="btn green" id="s-onay" style="flex:2">Siparişi tamamla</button></div>` : '';
    $('#s-onay')?.addEventListener('click', siparisOnay);
    $('#s-sadece')?.addEventListener('click', () => { sadeceSepet = !sadeceSepet; listeCiz(); barCiz(); });
  }
  function siparisOnay() {
    const k = sepetKalem(); if (!k.length) return;
    const fs = bilgi.fatura_secenek;
    let ft = fs[0];
    const ara = r2(k.reduce((a, x) => a + r2(x.m * x.u.fiyat), 0));
    const toplamHtml = () => { const kdv = ft === 'R' ? r2(ara * bilgi.kdv_orani) : 0; return `<div class="tt"><span>Ara toplam</span><span>${tl(ara)}</span>${ft === 'R' ? `<span>KDV (%${nfN.format(bilgi.kdv_orani * 100)})</span><span>${tl(kdv)}</span>` : ''}<span class="b">Genel toplam</span><span class="b">${tl(ara + kdv)}</span></div>`; };
    modal({
      title: 'Siparişi gözden geçirin',
      body: `<div class="table-wrap" style="margin-bottom:12px"><table class="tbl"><thead><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th class="r">Tutar</th></tr></thead>
          <tbody>${k.map((x) => `<tr><td><b>${esc(x.u.ad)}</b>${x.u.kod ? `<div class="tiny">${esc(x.u.kod)}</div>` : ''}</td><td class="r">${nfN.format(x.m)} ${esc(x.u.birim)}</td><td class="r">${tl(x.u.fiyat)}</td><td class="r">${tl(r2(x.m * x.u.fiyat))}</td></tr>`).join('')}</tbody></table></div>
        ${fs.length > 1 ? `<div class="field"><label>Fatura</label><div class="chips" id="o-ft">${fs.map((f) => `<button class="chip ${f === ft ? 'on' : ''}" data-f="${f}">${f === 'R' ? 'Faturalı (R)' : 'Faturasız (GR)'}</button>`).join('')}</div></div>` : ''}
        ${bilgi.gonderimler.length ? `<div class="field"><label>Gönderim şekli</label><select class="input" id="o-g"><option value="">Firma belirlesin</option>${bilgi.gonderimler.map((g) => `<option>${esc(g)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>Not (isteğe bağlı)</label><textarea class="input" id="o-a" rows="2" maxlength="500" placeholder="Örn. teslimat adresi, istenen tarih"></textarea></div>
        <div id="o-t" class="card" style="background:var(--surface-2);box-shadow:none">${toplamHtml()}</div>
        <p class="tiny">Siparişiniz firmamızın onayına gönderilir; onaylanınca “Siparişlerim”de görünür.</p>
        <div class="by-msj err" id="o-m"></div>`,
      foot: '<button class="btn" data-close>Geri</button><button class="btn green" id="o-ok">Siparişi gönder</button>',
      onMount: (m) => {
        $('#o-ft', m.el)?.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; ft = b.dataset.f; $$('#o-ft .chip', m.el).forEach((x) => x.classList.toggle('on', x === b)); $('#o-t', m.el).innerHTML = toplamHtml(); });
        $('#o-ok', m.el).onclick = async (e) => {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Gönderiliyor…'; $('#o-m', m.el).textContent = '';
          try {
            const r = await cagir({ islem: 'siparis_ver', kalemler: k.map((x) => ({ urun_id: x.u.id, miktar: x.m })), fatura_tipi: ft, gonderim_sekli: $('#o-g', m.el)?.value || '', aciklama: $('#o-a', m.el).value });
            sepet = {}; sepetYaz(); sadeceSepet = false; m.close();
            bilgi.onay_bekleyen += r.durum === 'Onay bekliyor' ? 1 : 0;
            modal({ title: 'Siparişiniz alındı', body: `<p style="font-size:16px">✓ <b>${tl(r.genel_toplam)}</b> tutarındaki siparişiniz ${r.durum === 'Onaylandı' ? `onaylandı${r.fis_no ? ` (Fiş ${r.fis_no})` : ''} ve hazırlanmaya alındı.` : 'firmamızın onayına gönderildi. Onaylanınca hazırlanmaya alınır.'}</p>`,
              foot: '<button class="btn primary" data-close id="o-tm">Siparişlerime git</button>', onMount: (m2) => { $('#o-tm', m2.el).addEventListener('click', () => { sekme = 'siparislerim'; ciz(); }); } });
            cizNo++; siparisCiz();
          } catch (err) { $('#o-m', m.el).textContent = err.message; b.disabled = false; b.textContent = 'Siparişi gönder'; if (/Listede olmayan/.test(err.message)) urunler = null; }
        };
      }
    });
  }

  /* ---------- Siparişlerim ---------- */
  const SIP_D = { Beklemede: ['Hazırlanıyor', 'b-orange'], 'Sevk Edildi': ['Sevk edildi', 'b-green'], 'İptal': ['İptal', 'b-red'] };
  const TAL_D = { 'Onay bekliyor': ['Onay bekliyor', 'b-orange'], Onaylandı: ['Onaylandı', 'b-green'], Reddedildi: ['Reddedildi', 'b-red'], 'İptal': ['İptal ettiniz', ''] };
  async function siparislerimCiz() {
    const no = cizNo; yukleniyor();
    let d; try { d = await cagir({ islem: 'siparislerim' }); } catch (e) { return eski(no) || hataGoster(e); }
    if (eski(no)) return;
    const acik = d.talepler.filter((t) => t.durum === 'Onay bekliyor'), diger = d.talepler.filter((t) => t.durum !== 'Onay bekliyor');
    bilgi.onay_bekleyen = acik.length;
    const talepRow = (t) => `<div class="row" data-t="${t.id}"><div class="main-col"><div class="t">${fmtZ(t.zaman)} <span class="badge ${TAL_D[t.durum]?.[1] || ''}">${TAL_D[t.durum]?.[0] || esc(t.durum)}</span> <span class="badge">${t.fatura_tipi}</span></div>
        <div class="st">${esc(t.ozet)}${t.kalem > 3 ? ` +${t.kalem - 3}` : ''}${t.red_nedeni ? ` · <span style="color:var(--red)">${esc(t.red_nedeni)}</span>` : ''}</div></div><div class="end"><div class="amt">${tl(t.genel_toplam)}</div></div></div>`;
    const sipRow = (s) => `<div class="row" data-sp="${s.id}"><div class="main-col"><div class="t">Fiş ${esc(s.fis_no)} · ${fmtD(s.tarih)} <span class="badge ${SIP_D[s.durum]?.[1] || ''}">${SIP_D[s.durum]?.[0] || esc(s.durum)}</span> <span class="badge">${s.fatura_tipi}</span></div>
        <div class="st">${esc(s.ozet)}${s.sevk_tarihi ? ` · sevk ${fmtD(s.sevk_tarihi)}` : ''}${s.gonderim ? ` · ${esc(s.gonderim)}` : ''}</div></div>
        <div class="end"><div class="amt">${s.para_birimi && s.para_birimi !== 'TRY' && s.doviz_toplam ? pbF(s.doviz_toplam, s.para_birimi) : tl(s.genel_toplam)}</div></div></div>`;
    $('#view').innerHTML = `
      ${acik.length ? `<div class="section-title">Onay bekleyen siparişler</div><div class="list" id="l-a">${acik.map(talepRow).join('')}</div>` : ''}
      ${bilgi.yetkiler.siparislerim ? `<div class="section-title">Siparişler</div><div class="list" id="l-s">${d.siparisler.length ? d.siparisler.map(sipRow).join('') : '<div class="empty">Henüz sipariş yok.</div>'}</div>` : ''}
      ${diger.length ? `<div class="section-title">${bilgi.yetkiler.siparislerim ? 'Reddedilen / iptal edilen talepler' : 'Gönderdiğiniz siparişler'}</div><div class="list" id="l-d">${diger.map(talepRow).join('')}</div>` : ''}
      ${!acik.length && !diger.length && !bilgi.yetkiler.siparislerim ? '<div class="card empty">Henüz sipariş göndermediniz.</div>' : ''}`;
    $$('#view [data-t]').forEach((r) => (r.onclick = () => talepDetay(+r.dataset.t)));
    $$('#view [data-sp]').forEach((r) => (r.onclick = () => siparisDetay(+r.dataset.sp)));
  }
  const kalemTablo = (kal, pbli) => `<div class="table-wrap"><table class="tbl"><thead><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th class="r">Tutar</th></tr></thead>
      <tbody>${kal.map((k) => `<tr><td><b>${esc(k.ad)}</b>${k.kod ? `<div class="tiny">${esc(k.kod)}</div>` : ''}</td><td class="r">${nfN.format(k.miktar)} ${esc(k.birim || '')}</td><td class="r">${pbli && k.doviz_fiyat ? pbF(k.doviz_fiyat, pbli) : tl(k.birim_fiyat)}</td><td class="r">${pbli && k.doviz_fiyat ? pbF(r2(k.doviz_fiyat * k.miktar), pbli) : tl(k.tutar)}</td></tr>`).join('')}</tbody></table></div>`;
  const tekrarla = (kal) => {
    if (!bilgi.yetkiler.siparis) return '';
    return '<button class="btn" id="d-tek">Aynı ürünleri sepete ekle</button>';
  };
  const tekrarBagla = (m, kal) => {
    $('#d-tek', m.el)?.addEventListener('click', async () => {
      if (!urunler) { try { urunler = (await cagir({ islem: 'urunler' })).urunler; } catch (e) { return toast(e.message, 'err'); } }
      let n = 0;
      kal.forEach((k) => { const u = urunler.find((x) => (k.urun_id && x.id === k.urun_id) || (k.kod && x.kod === k.kod) || x.ad === k.ad); if (u) { sepet[u.id] = r2((sepet[u.id] || 0) + k.miktar); n++; } });
      sepetYaz(); m.close();
      toast(n ? `${n} ürün sepete eklendi (güncel fiyatlarla)` : 'Bu ürünler artık listenizde yok', n ? 'ok' : 'err');
      if (n) { sekme = 'siparis'; ciz(); }
    });
  };
  async function talepDetay(id) {
    let t; try { t = await cagir({ islem: 'talep_detay', id }); } catch (e) { return toast(e.message, 'err'); }
    modal({
      title: `Sipariş talebi · ${fmtZ(t.zaman)}`,
      body: `<div style="margin-bottom:10px"><span class="badge ${TAL_D[t.durum]?.[1] || ''}">${TAL_D[t.durum]?.[0] || esc(t.durum)}</span> <span class="badge">${t.fatura_tipi === 'R' ? 'Faturalı' : 'Faturasız'}</span>${t.gonderim ? ` <span class="badge">${esc(t.gonderim)}</span>` : ''} <span class="tiny">· ${esc(t.kim)}</span></div>
        ${t.red_nedeni ? `<div class="card" style="border-left:4px solid var(--red);padding:10px 14px"><b>Ret nedeni:</b> ${esc(t.red_nedeni)}</div>` : ''}
        ${kalemTablo(t.kalemler)}
        <div class="tt" style="margin-top:10px"><span>Ara toplam</span><span>${tl(t.ara_toplam)}</span>${t.kdv_tutari ? `<span>KDV</span><span>${tl(t.kdv_tutari)}</span>` : ''}<span class="b">Genel toplam</span><span class="b">${tl(t.genel_toplam)}</span></div>
        ${t.aciklama ? `<p class="small"><b>Not:</b> ${esc(t.aciklama)}</p>` : ''}`,
      foot: `${t.durum === 'Onay bekliyor' ? '<button class="btn red" id="d-ipt">Talebi iptal et</button>' : ''}${tekrarla(t.kalemler)}<button class="btn" data-close>Kapat</button>`,
      onMount: (m) => {
        tekrarBagla(m, t.kalemler);
        $('#d-ipt', m.el)?.addEventListener('click', async (e) => {
          if (!confirm('Bu sipariş talebi iptal edilsin mi?')) return;
          e.currentTarget.disabled = true;
          try { await cagir({ islem: 'talep_iptal', id }); m.close(); toast('Talep iptal edildi', 'ok'); cizNo++; siparislerimCiz(); } catch (err) { toast(err.message, 'err'); e.currentTarget.disabled = false; }
        });
      }
    });
  }
  async function siparisDetay(id) {
    let s; try { s = await cagir({ islem: 'siparis_detay', id }); } catch (e) { return toast(e.message, 'err'); }
    const pb = s.para_birimi && s.para_birimi !== 'TRY' ? s.para_birimi : null;
    modal({
      title: `Fiş ${s.fis_no} · ${fmtD(s.tarih)}`,
      body: `<div style="margin-bottom:10px"><span class="badge ${SIP_D[s.durum]?.[1] || ''}">${SIP_D[s.durum]?.[0] || esc(s.durum)}</span> <span class="badge">${s.fatura_tipi === 'R' ? 'Faturalı' : 'Faturasız'}</span>${s.gonderim_sekli ? ` <span class="badge">${esc(s.gonderim_sekli)}</span>` : ''}${s.sevk_tarihi ? ` <span class="tiny">· sevk ${fmtD(s.sevk_tarihi)}</span>` : ''}</div>
        ${kalemTablo(s.kalemler, pb)}
        <div class="tt" style="margin-top:10px"><span>Ara toplam</span><span>${tl(s.ara_toplam)}</span>${Number(s.iskonto_tutar) ? `<span>İskonto</span><span>−${tl(s.iskonto_tutar)}</span>` : ''}${Number(s.kdv_tutari) ? `<span>KDV</span><span>${tl(s.kdv_tutari)}</span>` : ''}<span class="b">Genel toplam</span><span class="b">${pb && s.doviz_toplam ? pbF(s.doviz_toplam, pb) : tl(s.genel_toplam)}</span></div>`,
      foot: `${tekrarla(s.kalemler)}<button class="btn" data-close>Kapat</button>`,
      onMount: (m) => tekrarBagla(m, s.kalemler)
    });
  }

  /* ---------- Cari hesap (ekstre) ---------- */
  let eTip = '';
  async function hesapCiz() {
    const y = bilgi.yetkiler, tipler = [y.ekstre_r && 'R', y.ekstre_gr && 'GR'].filter(Boolean);
    if (!tipler.includes(eTip)) eTip = tipler[0];
    const no = cizNo; yukleniyor();
    let d; try { d = await cagir({ islem: 'ekstre', tip: eTip }); } catch (e) { return eski(no) || hataGoster(e); }
    if (eski(no)) return;
    const h = d.hareketler, say = h.filter((x) => !x.bekliyor);
    const tb = r2(say.reduce((a, x) => a + x.borc, 0)), ta = r2(say.reduce((a, x) => a + x.alacak, 0));
    const bk = d.bakiye, bkY = bk > 0.005 ? 'Borcunuz' : bk < -0.005 ? 'Alacağınız' : 'Hesap kapalı';
    const dvz = (x) => (x.doviz ? `<div class="tiny">${pbF(x.doviz.tutar, x.doviz.pb)} × ${nfN.format(x.doviz.kur)}</div>` : '');
    $('#view').innerHTML = `
      <div class="print-only"><h2 style="margin:0">${esc(bilgi.cari.unvan)} · Cari hesap ekstresi (${eTip === 'R' ? 'Faturalı' : 'Faturasız'})</h2><p class="small">${esc(bilgi.firma)} · ${new Date().toLocaleDateString('tr-TR')}</p></div>
      ${tipler.length > 1 ? `<div class="chips no-print" id="e-tip">${tipler.map((t) => `<button class="chip ${t === eTip ? 'on' : ''}" data-t="${t}">${t === 'R' ? 'Faturalı (R)' : 'Faturasız (GR)'}</button>`).join('')}</div>` : ''}
      <div class="kpis"><div class="kpi ${bk > 0.005 ? 'orange' : 'green'}"><div class="l">${bkY}</div><div class="v num">${tl(Math.abs(bk))}</div><div class="s">${eTip === 'R' ? 'Faturalı' : 'Faturasız'} hesap bakiyesi</div></div>
        <div class="kpi"><div class="l">Toplam borç / ödeme</div><div class="v num" style="font-size:16px">${tl(tb)} / ${tl(ta)}</div><div class="s">${say.length} hareket</div></div></div>
      <div class="btn-row no-print" style="margin-bottom:8px">${y.kart_odeme ? `<button class="btn green" id="e-ode">${ik('kart')}Kartla öde</button>` : ''}<button class="btn" id="e-yaz">${ik('yaz')}Yazdır / PDF</button></div>
      <div class="list">${h.length ? `<div class="table-wrap"><table class="tbl stack"><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th class="r">Borç</th><th class="r">Ödeme</th><th class="r">Bakiye</th></tr></thead>
        <tbody>${h.slice().reverse().map((x) => `<tr${x.bekliyor ? ' style="opacity:.6"' : ''}>
          <td class="num">${fmtD(x.tarih)}</td>
          <td>${esc(x.islem)}${x.bekliyor ? ` <span class="badge b-orange">${x.ithalat ? 'İthalat siparişi' : 'Sevk bekliyor'} · bakiyede yok</span>` : ''}${x.odeme_sekli ? `<div class="tiny">${esc(x.odeme_sekli)}</div>` : ''}${x.aciklama ? `<div class="tiny">${esc(x.aciklama)}</div>` : ''}</td>
          <td class="small">${esc(x.belge)}</td>
          <td class="r" ${x.borc ? 'data-l="Borç"' : ''}>${x.borc ? tl(x.borc) + dvz(x) : ''}</td><td class="r" ${x.alacak ? 'data-l="Ödeme"' : ''}>${x.alacak ? tl(x.alacak) + dvz(x) : ''}</td>
          <td class="r push" data-l="Bakiye"><b>${tl(x.bakiye)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="r"><b>Toplam</b></td><td class="r" data-l="Borç">${tl(tb)}</td><td class="r" data-l="Ödeme">${tl(ta)}</td><td class="r push" data-l="Bakiye">${tl(tb - ta)}</td></tr></tfoot></table></div>` : '<div class="empty">Hareket yok.</div>'}</div>
      <p class="tiny no-print" style="margin:0 4px">Pozitif bakiye size ait borcu gösterir. Sevk edilmemiş siparişler sevk edilince bakiyeye girer.</p>`;
    $('#e-tip')?.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; eTip = b.dataset.t; cizNo++; hesapCiz(); });
    $('#e-yaz').onclick = () => window.print();
    $('#e-ode')?.addEventListener('click', (ev) => (odemeTipleri().includes(eTip) ? odemeAc(ev, eTip) : (sekme = 'odeme', ciz())));
  }

  /* ---------- Ödeme (PayTR, odeme.html) ---------- */
  const odemeTipleri = () => (bilgi.yetkiler.odeme_tipi === 'ikisi' ? ['R', 'GR'] : [bilgi.yetkiler.odeme_tipi || 'R']);
  async function odemeAc(e, tip) {
    const b = e?.currentTarget; if (b) b.disabled = true;
    const w = window.open('', '_blank');
    try { const r = await cagir({ islem: 'odeme', tip: tip || odemeTipleri()[0] }); const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}odeme#${r.token}`; if (w) w.location = url; else location.href = url; }
    catch (err) { if (w) w.close(); toast(err.message, 'err'); }
    if (b) b.disabled = false;
  }
  function odemeCiz() {
    const y = bilgi.yetkiler, tipler = odemeTipleri();
    const ad = (t) => (t === 'R' ? 'Faturalı (R)' : 'Faturasız (GR)');
    const bak = (t) => (t === 'R' ? bilgi.bakiye.r : bilgi.bakiye.gr);
    const bkHtml = (t) => { const v = bak(t); if (v === null || v === undefined) return ''; return `<div class="l">${ad(t)} hesap · ${v > 0.005 ? 'borcunuz' : v < -0.005 ? 'alacağınız' : 'borç yok'}</div><div class="v">${tl(Math.abs(v))}</div>`; };
    // odenemeyen ama gorulebilen hesapta borc varsa bilgi olarak goster
    const diger = ['R', 'GR'].filter((t) => !tipler.includes(t) && (bak(t) ?? 0) > 0.005);
    $('#view').innerHTML = `<div class="card">
        <h3 style="margin:0 0 6px">Kredi kartı ile ödeme</h3>
        <p class="small" style="margin:0 0 12px">Ödemeniz güvenli PayTR ödeme sayfasında alınır ve ${tipler.length > 1 ? 'seçtiğiniz' : tipler[0] === 'R' ? 'faturalı (R)' : 'faturasız (GR)'} cari hesabınıza otomatik işlenir.${y.max_taksit > 1 ? ` ${y.max_taksit} taksite kadar ödeyebilirsiniz.` : ''}</p>
        ${tipler.map((t) => `<div class="stat" style="margin-bottom:10px">${bkHtml(t) || `<div class="l">${ad(t)} hesap</div>`}
          <button class="btn green" data-ode="${t}" style="width:100%;margin-top:8px;font-size:16px;padding:12px">${ik('kart')} ${tipler.length > 1 ? `${ad(t)} hesabıma öde` : 'Ödeme sayfasını aç'}</button></div>`).join('')}
        ${diger.map((t) => `<div class="stat" style="margin-bottom:10px;opacity:.85">${bkHtml(t)}<div class="tiny" style="margin-top:4px">Bu hesaba kartla ödeme için firmamızla görüşün.</div></div>`).join('')}
        <p class="tiny" style="margin:10px 0 0">Ödeme sayfası yeni sekmede açılır; tutarı orada yazarsınız. Ödeme tamamlanınca makbuzunuz görünür.</p></div>`;
    $$('#view [data-ode]').forEach((b) => (b.onclick = (e) => odemeAc(e, b.dataset.ode)));
  }

  tOku() ? ana() : giris();
})();
