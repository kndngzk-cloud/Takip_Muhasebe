// Kisiye ozel gider giris sayfasi: gider#<token>. Giris gerektirmez; kayit gider-gir edge function'inda dogrulanir.
(() => {
  const FN = `${window.APP_CONFIG.url}/functions/v1/gider-gir`;
  const token = (location.hash || '').replace(/^#/, '').trim();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tl = (n) => `${nf.format(n)} ₺`;
  const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fmtD = (d) => (d ? d.split('-').reverse().join('.') : '');
  const sayi = (s) => { s = String(s || '').replace(/[^\d.,]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, ''); return Number(s); };
  const cagir = async (body) => {
    let r;
    try { r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, ...body }) }); }
    catch { throw new Error('Bağlantı kurulamadı. İnternetinizi kontrol edin.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.hata || 'Bir hata oluştu, tekrar deneyin.');
    return j;
  };
  const bos = (m) => { $('#icerik').innerHTML = `<div class="bos">${esc(m)}</div>`; };
  if (!/^[a-f0-9]{32}$/.test(token)) return bos('Link hatalı. Linki size gönderen kişiyle iletişime geçin.');

  let kat = '', os = 'Nakit';
  const gecmisCiz = (son) => {
    $('#gecmis').innerHTML = son.length ? `<h3>Son girdikleriniz</h3><div class="liste">${son.map((x) => `<div class="sat"><div class="a"><b>${esc(x.aciklama || x.kategori)}</b><small>${fmtD(x.tarih)} · ${esc(x.kategori)}${x.faturali ? ' · faturalı' : ''}${x.odeme_sekli ? ` · ${esc(x.odeme_sekli)}` : ''}</small></div><span class="t">${tl(x.tutar)}</span>${x.silinebilir ? `<button data-sil="${x.id}">Sil</button>` : ''}</div>`).join('')}</div>` : '';
    $$('[data-sil]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Bu gider silinsin mi?')) return;
      b.disabled = true;
      try { await cagir({ islem: 'sil', id: +b.dataset.sil }); yukle(); } catch (e) { alert(e.message); b.disabled = false; }
    }));
  };
  const yukle = () => cagir({ islem: 'bilgi' }).then((b) => { gecmisCiz(b.son || []); return b; });

  yukle().then((b) => {
    if (b.firma) { $('#firma').textContent = b.firma; document.title = `${b.firma} · Gider Girişi`; }
    $('#kim').textContent = `Gider girişi · ${b.ad}`;
    $('#icerik').innerHTML = `
      <label class="b" for="tutar">Tutar</label>
      <div class="tutar"><input id="tutar" inputmode="decimal" autocomplete="off" placeholder="0,00"><span>₺</span></div>
      <label class="b">Kategori</label>
      <div class="kats" id="kats">${b.kategoriler.map((k) => `<button type="button" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <label class="b" for="ac">Açıklama</label>
      <input class="in" id="ac" maxlength="200" placeholder="Örn. Opet benzin, öğle yemeği, kargo">
      <label class="b" for="tarih">Tarih</label>
      <input class="in" type="date" id="tarih" value="${bugun()}" max="${bugun()}">
      <label class="b">Nasıl ödendi?</label>
      <div class="seg" id="os">${b.odeme_sekilleri.map((o) => `<button type="button" data-o="${esc(o)}" class="${o === os ? 'on' : ''}">${esc(o)}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="fat"> Faturası / fişi var</label>
      <button class="kaydet" id="kaydet">Gideri kaydet</button>
      <div id="msj"></div>`;
    $('#kats').onclick = (e) => { const x = e.target.closest('button'); if (!x) return; kat = x.dataset.k; $$('#kats button').forEach((y) => y.classList.toggle('on', y === x)); };
    $('#os').onclick = (e) => { const x = e.target.closest('button'); if (!x) return; os = x.dataset.o; $$('#os button').forEach((y) => y.classList.toggle('on', y === x)); };
    $('#kaydet').onclick = async () => {
      const msj = $('#msj'), btn = $('#kaydet');
      const tutar = Math.round(sayi($('#tutar').value) * 100) / 100;
      if (!(tutar > 0)) { msj.className = 'hata'; msj.textContent = 'Tutarı girin.'; $('#tutar').focus(); return; }
      if (!kat) { msj.className = 'hata'; msj.textContent = 'Kategori seçin.'; return; }
      btn.disabled = true; btn.textContent = 'Kaydediliyor…'; msj.textContent = '';
      try {
        await cagir({ islem: 'ekle', tutar, kategori: kat, aciklama: $('#ac').value, tarih: $('#tarih').value, odeme_sekli: os, faturali: $('#fat').checked });
        msj.className = 'ok'; msj.textContent = `✓ ${tl(tutar)} · ${kat} kaydedildi`;
        $('#tutar').value = ''; $('#ac').value = ''; $('#fat').checked = false; kat = ''; $$('#kats button').forEach((y) => y.classList.remove('on'));
        yukle();
      } catch (e) { msj.className = 'hata'; msj.textContent = e.message; }
      btn.disabled = false; btn.textContent = 'Gideri kaydet';
    };
  }).catch((e) => bos(e.message));
})();
