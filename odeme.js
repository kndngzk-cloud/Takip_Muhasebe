// Musteri odeme sayfasi: odeme.html#<token>. Giris gerektirmez; islemler cari-odeme edge function'inda dogrulanir.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/cari-odeme`;
  const token = (location.hash || '').replace(/^#/, '').trim();
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tl = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL';
  const sayi = (s) => {
    s = String(s || '').replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  };
  const cagir = async (body) => {
    let r;
    try { r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, ...body }) }); }
    catch { throw new Error('Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.hata || 'Bir hata oluştu, lütfen tekrar deneyin.');
    return j;
  };
  const hataGoster = (m) => { $('#icerik').innerHTML = `<div class="bos">${esc(m)}</div>`; };

  if (!/^[a-f0-9]{32,64}$/.test(token)) { hataGoster('Ödeme linki eksik veya hatalı. Linki size gönderen firmayla iletişime geçin.'); return; }

  cagir({ islem: 'bilgi' }).then((b) => {
    if (b.firma) { $('#firma').textContent = b.firma; document.title = `${b.firma} · Ödeme`; }
    const borc = b.bakiye !== null && b.bakiye !== undefined ? Number(b.bakiye) : null;
    $('#icerik').innerHTML = `
      <div class="etiket">Cari hesap</div>
      <div class="unvan">${esc(b.unvan)}</div>
      ${borc !== null ? `<div class="bakiye"><small>${borc > 0.005 ? 'Güncel borç bakiyeniz' : borc < -0.005 ? 'Alacak bakiyeniz' : 'Güncel bakiyeniz'}</small><b>${tl(Math.abs(borc))}</b></div>` : ''}
      ${b.aciklama ? `<div class="not">${esc(b.aciklama)}</div>` : ''}
      <label for="tutar">Ödemek istediğiniz tutar</label>
      <div class="tutar"><input id="tutar" inputmode="decimal" autocomplete="off" placeholder="0,00"><span>TL</span></div>
      ${borc !== null && borc > 0.005 ? `<div class="hizli"><button type="button" id="tamami">Bakiyenin tamamı (${tl(borc)})</button></div>` : ''}
      <div class="bilgi">${b.max_taksit > 1 ? `Kartınız uygunsa ödeme sayfasında <b>${b.max_taksit} taksite kadar</b> seçebilirsiniz.` : 'Ödeme tek çekim olarak alınır.'}</div>
      <button class="ode" id="ode">Kartla öde</button>
      <div class="hata" id="hata" hidden></div>`;
    const inp = $('#tutar'), btn = $('#ode'), hata = $('#hata');
    $('#tamami')?.addEventListener('click', () => { inp.value = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(borc); inp.focus(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    btn.addEventListener('click', async () => {
      hata.hidden = true;
      const t = Math.round(sayi(inp.value) * 100) / 100;
      if (!isFinite(t) || t < 1) { hata.textContent = 'Lütfen ödemek istediğiniz tutarı girin (en az 1 TL).'; hata.hidden = false; inp.focus(); return; }
      btn.disabled = true; btn.textContent = 'Ödeme sayfası açılıyor…';
      try { const r = await cagir({ islem: 'ode', tutar: t }); location.href = r.url; }
      catch (e) { hata.textContent = e.message; hata.hidden = false; btn.disabled = false; btn.textContent = 'Kartla öde'; }
    });
  }).catch((e) => hataGoster(e.message));
})();
