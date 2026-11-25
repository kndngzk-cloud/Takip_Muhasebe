// Musteri odeme sayfasi: odeme.html#<token>. Giris gerektirmez; islemler cari-odeme edge function'inda dogrulanir.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/cari-odeme`;
  const token = (location.hash || '').replace(/^#/, '').trim();
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tl = (n) => `${nf.format(n)} TL`;
  const sayi = (s) => {
    s = String(s || '').replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  };
  const kilit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const tik = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';
  const uyari = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  const cagir = async (body) => {
    let r;
    try { r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, ...body }) }); }
    catch { throw new Error('Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.hata || 'Bir hata oluştu, lütfen tekrar deneyin.');
    return j;
  };
  const hataGoster = (m) => { $('#icerik').innerHTML = `<div class="bos">${uyari}${esc(m)}</div>`; };
  const altBilgi = (firma, il = {}) => {
    const web = String(il.web || '').trim(), href = web ? (/^https?:\/\//i.test(web) ? web : `https://${web}`) : '';
    const parca = [
      web ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</a>` : '',
      il.telefon ? `<a href="tel:${esc(String(il.telefon).replace(/[^\d+]/g, ''))}">${esc(il.telefon)}</a>` : '',
      il.eposta ? `<a href="mailto:${esc(il.eposta)}">${esc(il.eposta)}</a>` : ''
    ].filter(Boolean);
    $('#alt').innerHTML = `${firma ? `<b>${esc(firma)}</b>` : ''}${parca.length ? `<div class="il">${parca.join('')}</div>` : ''}<div style="margin-top:6px">Ödemeler PayTR Ödeme ve Elektronik Para Kuruluşu altyapısıyla alınır.</div>`;
  };

  /* ---------- makbuz (PDF, tarayicida uretilir) ---------- */
  const yaziyla = (n) => {
    const B = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], O = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    const uc = (x) => { const y = Math.floor(x / 100), o = Math.floor((x % 100) / 10), b = x % 10; return (y ? (y > 1 ? B[y] : '') + 'yüz' : '') + O[o] + B[b]; };
    const yaz = (x) => { if (x === 0) return 'sıfır'; const K = ['', 'bin', 'milyon', 'milyar']; let s = '', i = 0; while (x > 0) { const g = x % 1000; if (g) s = (i === 1 && g === 1 ? '' : uc(g)) + K[i] + s; x = Math.floor(x / 1000); i++; } return s; };
    const tlk = Math.floor(Math.round(n * 100) / 100), kr = Math.round((n - tlk) * 100);
    return `${yaz(tlk)} Türk Lirası${kr ? ' ' + yaz(kr) + ' Kuruş' : ''}`;
  };
  const zamanYaz = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  let logo = null;
  const logoYukle = () => logo || (logo = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'icons/lama.png'; }));
  const makbuzCanvas = async (m, firma, unvan) => {
    const W = 1240, pad = 80, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), F = (w, sz) => `${w} ${sz}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    const kes = (t, w) => { t = String(t ?? ''); while (c.measureText(t).width > w && t.length > 3) t = t.slice(0, -2); return t; };
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f1b33'; c.fillRect(0, 0, W, 170);
    const lg = await logoYukle(); let lx = pad;
    if (lg) { c.fillStyle = '#fff'; c.beginPath(); c.roundRect ? c.roundRect(pad, 35, 100, 100, 18) : c.rect(pad, 35, 100, 100); c.fill(); c.drawImage(lg, pad + 14, 49, 72, 72); lx = pad + 124; }
    c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = F(800, 44); c.fillText(kes(firma || 'Firma', 560), lx, 70);
    c.font = F(500, 26); c.fillStyle = '#c9d2e6'; c.fillText('Kredi Kartı Tahsilat Makbuzu', lx, 120);
    c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = F(800, 42); c.fillText(m.no ? `No ${m.no}` : '', W - pad, 70);
    c.font = F(600, 26); c.fillStyle = '#c9d2e6'; c.fillText(zamanYaz(m.zaman), W - pad, 120); c.textAlign = 'left';
    let y = 240;
    c.fillStyle = '#5b6578'; c.font = F(600, 24); c.fillText('ÖDEMEYİ YAPAN', pad, y);
    c.fillStyle = '#0f1b33'; c.font = F(800, 38); c.fillText(kes(unvan, W - 2 * pad), pad, y + 48);
    y = 400; c.fillStyle = '#f1f4f9'; c.fillRect(pad - 10, y - 55, W - 2 * pad + 20, 160);
    c.fillStyle = '#5b6578'; c.font = F(600, 24); c.fillText('CARİ HESABINIZA İŞLENEN TUTAR', pad + 10, y - 16);
    c.fillStyle = '#0b8a57'; c.font = F(800, 66); c.fillText(tl(m.tutar), pad + 10, y + 46);
    y = 590; c.fillStyle = '#5b6578'; c.font = F(500, 26); c.fillText(kes('Yalnız: ' + yaziyla(m.tutar), W - 2 * pad), pad, y);
    y = 670; c.fillStyle = '#0f1b33'; c.font = F(800, 26); c.fillText('İŞLEM BİLGİLERİ', pad, y); y += 22;
    c.strokeStyle = '#0f1b33'; c.lineWidth = 2; c.beginPath(); c.moveTo(pad, y); c.lineTo(W - pad, y); c.stroke(); y += 44;
    const fark = m.toplam - m.tutar > 0.005;
    [['İşlem tarihi', zamanYaz(m.zaman)], ['Ödeme yöntemi', 'Kredi / banka kartı (PayTR)'], ['Kart', m.kart || ''], ['Taksit', Number(m.taksit) > 1 ? `${m.taksit} taksit` : 'Tek çekim'],
      ['Cari hesaba işlenen', tl(m.tutar)], ['Karttan çekilen', tl(m.toplam) + (fark ? `  (hizmet bedeli ${tl(m.toplam - m.tutar)} dahil)` : '')], ['PayTR sipariş no', m.siparis || ''], ['Makbuz no', m.no ? String(m.no) : '']]
      .filter(([, v]) => v).forEach(([k, v], i) => {
        if (i % 2 === 0) { c.fillStyle = '#f7f9fc'; c.fillRect(pad - 10, y - 26, W - 2 * pad + 20, 52); }
        c.fillStyle = '#5b6578'; c.font = F(600, 24); c.fillText(k, pad, y);
        c.fillStyle = '#0f1b33'; c.font = F(600, 26); c.fillText(kes(v, W - 2 * pad - 340), pad + 340, y); y += 52;
      });
    y += 30; c.fillStyle = '#7a8496'; c.font = F(500, 21);
    c.fillText(kes('Bu ödeme PayTR Ödeme ve Elektronik Para Kuruluşu aracılığıyla kart ile alınmış ve cari hesabınıza işlenmiştir.', W - 2 * pad), pad, y);
    c.fillText(kes('Bu belge bilgilendirme amaçlıdır, fatura yerine geçmez.', W - 2 * pad), pad, y + 34);
    const out = document.createElement('canvas'); out.width = W; out.height = Math.min(H, y + 110); out.getContext('2d').drawImage(cv, 0, 0); return out;
  };
  const canvasPdf = (cv, pw = 595.28) => {
    const jpg = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
    pw = Math.round(pw * 100) / 100; const ph = Math.round(pw * cv.height / cv.width * 100) / 100;
    const icerik = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    const obj = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${icerik.length} >>\nstream\n${icerik}\nendstream`,
      `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n${jpg}\nendstream`];
    let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
    obj.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = s.length;
    s += `xref\n0 ${obj.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${obj.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return new Blob([b], { type: 'application/pdf' });
  };
  const makbuzIndir = async (m, firma, unvan, btn) => {
    const eski = btn?.innerHTML; if (btn) { btn.disabled = true; btn.textContent = 'Hazırlanıyor…'; }
    try {
      const pdf = canvasPdf(await makbuzCanvas(m, firma, unvan)), ad = `Makbuz-${m.no || 'odeme'}.pdf`;
      const dosya = new File([pdf], ad, { type: 'application/pdf' });
      const mobil = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (mobil && navigator.canShare && navigator.canShare({ files: [dosya] })) { try { await navigator.share({ files: [dosya], title: ad }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      const u = URL.createObjectURL(pdf), a = document.createElement('a'); a.href = u; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = eski; } }
  };
  const indirIkon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

  /* ---------- odeme sonrasi: PayTR'den donuste son denemenin durumu ---------- */
  const BEK = `ol_bek_${token}`;
  const bekOku = () => { try { const v = JSON.parse(localStorage.getItem(BEK) || 'null'); return v && Date.now() - v.ts < 3 * 3600e3 ? v : null; } catch { return null; } };
  const bekYaz = (v) => { try { v ? localStorage.setItem(BEK, JSON.stringify(v)) : localStorage.removeItem(BEK); } catch { /* */ } };
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); }); // geri tusuyla donuldugunde durumu yenile
  const basariKart = (m) => `<div class="bolum basari"><div class="basari-ust">${tik}<div><b>Ödemeniz alındı</b><span>${tl(m.tutar)} cari hesabınıza işlendi · Makbuz No ${esc(m.no ?? '')}</span></div></div>
    <button class="mk-btn" data-mk="son">${indirIkon}Makbuzu indir (PDF)</button></div>`;
  const durumIzle = (bek, firma, unvan, yer) => {
    let n = 0;
    const bak = async () => {
      let r; try { r = await cagir({ islem: 'durum', cb: bek.cb }); } catch { r = null; }
      if (r?.durum === 'Ödendi') { bekYaz(null); yer.innerHTML = basariKart(r.makbuz); yer.querySelector('[data-mk]').onclick = (e) => makbuzIndir(r.makbuz, r.firma || firma, r.unvan || unvan, e.currentTarget); return; }
      if (r?.durum === 'Yok') { bekYaz(null); yer.innerHTML = ''; return; }
      if (++n < 25) { yer.innerHTML = `<div class="bolum kontrol"><span class="donen"></span>Ödemeniz kontrol ediliyor…</div>`; setTimeout(bak, 4000); }
      else yer.innerHTML = `<div class="bolum kontrol">${uyari}<span>Son ödemeniz henüz onaylanmadı. Ödemeyi tamamladıysanız birkaç dakika sonra bu sayfayı yenileyin; tamamlamadıysanız aşağıdan yeniden ödeyebilirsiniz.</span></div>`;
    };
    bak();
  };

  if (!/^[a-f0-9]{32,64}$/.test(token)) { hataGoster('Ödeme linki eksik veya hatalı. Linki size gönderen firmayla iletişime geçin.'); altBilgi(''); return; }

  cagir({ islem: 'bilgi' }).then((b) => {
    if (b.firma) {
      $('#firma').textContent = b.firma; document.title = `${b.firma} · Güvenli Ödeme`;
    }
    altBilgi(b.firma, b.iletisim);
    const borc = b.bakiye !== null && b.bakiye !== undefined ? Number(b.bakiye) : null;
    const musteri = b.komisyon === 'Müşteri' && b.secenek?.length;
    $('#icerik').innerHTML = `
      <div id="sonuc"></div>
      <div class="bolum">
        <div class="etiket">Ödeme yapan cari hesap</div>
        <div class="unvan">${esc(b.unvan)}</div>
        ${borc !== null ? `<div class="bakiye"><span>${borc > 0.005 ? 'Güncel borç bakiyeniz' : borc < -0.005 ? 'Alacak bakiyeniz' : 'Güncel bakiyeniz'}</span><b>${tl(Math.abs(borc))}</b></div>` : ''}
        ${b.aciklama ? `<div class="not">${esc(b.aciklama)}</div>` : ''}
      </div>
      <div class="bolum">
        <label class="b" for="tutar">Ödemek istediğiniz tutar</label>
        <div class="tutar"><input id="tutar" inputmode="decimal" autocomplete="off" placeholder="0,00"><span>TL</span></div>
        ${borc !== null && borc > 0.005 ? `<div class="hizli"><button type="button" id="tamami">Bakiyenin tamamı · ${tl(borc)}</button></div>` : ''}
      </div>
      ${musteri ? `<div class="bolum"><label class="b">Ödeme seçeneği</label><div class="secenekler" id="sec"></div>
        <div class="bilgi" style="margin-top:10px">${tik}<span>Seçtiğiniz seçeneğin hizmet bedeli tutara eklenir; cari hesabınıza yazdığınız tutar işlenir.${b.secenek.length > 1 ? ' Ödeme sayfasında da aynı taksit sayısını seçin.' : ''}</span></div></div>`
        : `<div class="bolum"><div class="bilgi">${tik}<span>${b.max_taksit > 1 ? `Kartınız uygunsa ödeme sayfasında <b>${b.max_taksit} taksite kadar vade farksız</b> ödeyebilirsiniz.` : 'Ödeme tek çekim olarak alınır, ek ücret yoktur.'}</span></div></div>`}
      <div class="bolum">
        <div class="ozet" id="ozet"></div>
        <button class="ode" id="ode">${kilit}<span id="ode-y">Güvenle öde</span></button>
        <div class="hata" id="hata" hidden></div>
        <div class="yonlen">Kart bilgilerinizi gireceğiniz PayTR güvenli ödeme sayfasına yönlendirileceksiniz. Ödeme sonrası makbuzunuzu bu sayfadan indirebilirsiniz.</div>
      </div>
      ${b.odemeler?.length ? `<div class="bolum"><div class="etiket" style="margin-bottom:8px">Bu linkle yaptığınız ödemeler</div><div class="gecmis">
        ${b.odemeler.map((m, i) => `<div class="gs"><div><b>${tl(m.tutar)}</b><small>${esc(zamanYaz(m.zaman))} · Makbuz No ${esc(m.no ?? '')}</small></div><button class="mk-btn kucuk" data-mk="${i}">${indirIkon}Makbuz</button></div>`).join('')}</div></div>` : ''}`;
    $$('.gecmis [data-mk]').forEach((x) => (x.onclick = (e) => makbuzIndir(b.odemeler[+x.dataset.mk], b.firma, b.unvan, e.currentTarget)));
    const bek = bekOku(); if (bek) durumIzle(bek, b.firma, b.unvan, $('#sonuc'));
    const inp = $('#tutar'), btn = $('#ode'), hata = $('#hata');
    let secili = musteri ? b.secenek[0].taksit : null;
    const hesap = () => {
      const t = Math.round(sayi(inp.value) * 100) / 100;
      const s = musteri ? b.secenek.find((x) => x.taksit === secili) : null;
      const odenecek = s && t > 0 ? Math.ceil((t / (1 - s.oran / 100)) * 100) / 100 : t;
      return { t, s, odenecek };
    };
    const ciz = () => {
      const { t, s, odenecek } = hesap();
      if (musteri) {
        $('#sec').innerHTML = b.secenek.map((x) => {
          const o = t > 0 ? Math.ceil((t / (1 - x.oran / 100)) * 100) / 100 : 0;
          return `<label class="secenek"><input type="radio" name="sec" value="${x.taksit}" ${x.taksit === secili ? 'checked' : ''}>
            <span class="a"><b>${x.taksit === 1 ? 'Tek çekim' : `${x.taksit} taksit`}</b><small>${t > 0 ? (x.taksit > 1 ? `${x.taksit} × ${tl(o / x.taksit)}` : 'Peşin') : `Hizmet bedeli %${nf.format(x.oran)}`}</small></span>
            <span class="t">${t > 0 ? tl(o) : ''}</span></label>`;
        }).join('');
      }
      const ok = isFinite(t) && t >= 1;
      $('#ozet').innerHTML = ok ? `
        <div><span class="sil">Cari hesabınıza işlenecek</span><span>${tl(t)}</span></div>
        ${s ? `<div><span class="sil">Hizmet bedeli (${s.taksit === 1 ? 'tek çekim' : s.taksit + ' taksit'})</span><span>${tl(odenecek - t)}</span></div>` : ''}
        <div class="top"><span>Kartınızdan çekilecek</span><span>${tl(odenecek)}</span></div>` : '';
      $('#ode-y').textContent = ok ? `${tl(odenecek)} güvenle öde` : 'Güvenle öde';
    };
    $('#sec')?.addEventListener('change', (e) => { if (e.target.name === 'sec') { secili = +e.target.value; ciz(); } });
    inp.addEventListener('input', ciz);
    $('#tamami')?.addEventListener('click', () => { inp.value = nf.format(borc); ciz(); inp.focus(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    ciz();
    btn.addEventListener('click', async () => {
      hata.hidden = true;
      const { t } = hesap();
      if (!isFinite(t) || t < 1) { hata.textContent = 'Lütfen ödemek istediğiniz tutarı girin (en az 1 TL).'; hata.hidden = false; inp.focus(); return; }
      btn.disabled = true; $('#ode-y').textContent = 'Güvenli ödeme sayfası açılıyor…';
      try { const r = await cagir({ islem: 'ode', tutar: t, taksit: secili }); if (r.cb) bekYaz({ cb: r.cb, ts: Date.now() }); location.href = r.url; }
      catch (e) { hata.textContent = e.message; hata.hidden = false; btn.disabled = false; ciz(); }
    });
  }).catch((e) => {
    // link kapatilmis olsa da son odemenin makbuzu alinabilsin
    const bek = bekOku();
    if (bek) { $('#icerik').innerHTML = '<div id="sonuc"></div>'; altBilgi(''); durumIzle(bek, '', '', $('#sonuc')); return; }
    hataGoster(e.message); altBilgi('');
  });
})();
