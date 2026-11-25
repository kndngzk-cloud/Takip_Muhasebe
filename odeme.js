// Musteri odeme sayfasi: odeme.html#<token>. Giris gerektirmez; islemler cari-odeme edge function'inda dogrulanir.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/cari-odeme`;
  const token = (location.hash || '').replace(/^#/, '').trim();
  const $ = (s) => document.querySelector(s);
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

  if (!/^[a-f0-9]{32,64}$/.test(token)) { hataGoster('Ödeme linki eksik veya hatalı. Linki size gönderen firmayla iletişime geçin.'); altBilgi(''); return; }

  cagir({ islem: 'bilgi' }).then((b) => {
    if (b.firma) {
      $('#firma').textContent = b.firma; document.title = `${b.firma} · Güvenli Ödeme`;
      const harf = b.firma.split(/[\s\-–·.&]+/).filter((w) => /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(w)).slice(0, 2).map((w) => w[0].toLocaleUpperCase('tr-TR')).join('');
      if (harf) $('#amblem').textContent = harf;
    }
    altBilgi(b.firma, b.iletisim);
    const borc = b.bakiye !== null && b.bakiye !== undefined ? Number(b.bakiye) : null;
    const musteri = b.komisyon === 'Müşteri' && b.secenek?.length;
    $('#icerik').innerHTML = `
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
        <div class="yonlen">Kart bilgilerinizi gireceğiniz PayTR güvenli ödeme sayfasına yönlendirileceksiniz.</div>
      </div>`;
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
      try { const r = await cagir({ islem: 'ode', tutar: t, taksit: secili }); location.href = r.url; }
      catch (e) { hata.textContent = e.message; hata.hidden = false; btn.disabled = false; ciz(); }
    });
  }).catch((e) => { hataGoster(e.message); altBilgi(''); });
})();
