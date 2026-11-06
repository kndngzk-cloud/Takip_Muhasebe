// Platform siparisinin kargo etiketini PDF (base64) olarak dondurur. Giris yapmis kullanici veya teshis tokeni ister.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }
async function yetkili(req: Request, body: Record<string, unknown>) {
  if (typeof body.token === "string" && body.token) { const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token"); if (r && r.deger === body.token) return true; }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!jwt) return false;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }); if (!u.ok) return false;
  const user = await u.json(); if (!user?.id) return false;
  const [p] = await rest(`profiller?select=id&id=eq.${user.id}`); return !!p;
}
async function hamGet(u: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  const url = new URL(u);
  const conn = await Deno.connectTls({ hostname: url.hostname, port: 443 });
  try {
    await conn.write(new TextEncoder().encode([`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.hostname}`, "Connection: close", ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n")));
    const parts: Uint8Array[] = []; let top = 0; const buf = new Uint8Array(65536);
    while (true) { const n = await conn.read(buf).catch(() => null); if (!n) break; parts.push(buf.slice(0, n)); top += n; }
    const tum = new Uint8Array(top); let o = 0; for (const p of parts) { tum.set(p, o); o += p.length; }
    let ayir = -1; for (let i = 0; i < tum.length - 3; i++) if (tum[i] === 13 && tum[i + 1] === 10 && tum[i + 2] === 13 && tum[i + 3] === 10) { ayir = i; break; }
    const bas = new TextDecoder().decode(tum.slice(0, ayir < 0 ? tum.length : ayir));
    let govde = ayir < 0 ? new Uint8Array() : tum.slice(ayir + 4);
    if (/transfer-encoding:\s*chunked/i.test(bas)) {
      const out: Uint8Array[] = []; let i = 0, n = 0;
      while (i < govde.length) {
        let j = i; while (j < govde.length - 1 && !(govde[j] === 13 && govde[j + 1] === 10)) j++;
        const boy = parseInt(new TextDecoder().decode(govde.slice(i, j)).split(";")[0].trim(), 16);
        if (!boy) break; out.push(govde.slice(j + 2, j + 2 + boy)); n += boy; i = j + 2 + boy + 2;
      }
      const b = new Uint8Array(n); let k = 0; for (const p of out) { b.set(p, k); k += p.length; } govde = b;
    }
    return { status: Number(/^HTTP\/1\.[01] (\d+)/.exec(bas)?.[1] || 0), text: new TextDecoder().decode(govde) };
  } finally { try { conn.close(); } catch { /* */ } }
}
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
// ZPL -> PDF (Labelary), 100x100 mm
async function zplPdf(zpl: string, olcu = "4x4") {
  const r = await fetch(`https://api.labelary.com/v1/printers/8dpmm/labels/${olcu}/`, { method: "POST", headers: { Accept: "application/pdf", "Content-Type": "application/x-www-form-urlencoded" }, body: zpl });
  if (!r.ok) throw new Error(`ZPL dönüştürülemedi: ${r.status} ${(await r.text()).slice(0, 150)}`);
  return b64(new Uint8Array(await r.arrayBuffer()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const [p] = await rest(`platform_siparisler?select=id,platform,siparis_no,paket_no,kargo_takip,barkod,durum,kargo_firma,alici,musteri,telefon,adres,sehir,satirlar,ham&id=eq.${Number(body.id)}`);
    if (!p) return json({ hata: "Platform siparişi bulunamadı" }, 404);
    const [e] = await rest(`entegrasyonlar?select=ayar&platform=eq.${encodeURIComponent(p.platform)}`);
    const a = e?.ayar || {};
    if (p.platform === "Hepsiburada") {
      if (!p.paket_no) return json({ hata: "Bu sipariş Hepsiburada'da henüz paketlenmemiş. Önce paketleyin; birkaç dakika içinde etiket hazır olur." }, 400);
      const hd = { Authorization: "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`), "User-Agent": a.kullanici_adi, Accept: "application/json" };
      const r = await hamGet(`https://oms-external.hepsiburada.com/packages/merchantid/${encodeURIComponent(a.merchant_id)}/packagenumber/${encodeURIComponent(p.paket_no)}/labels?format=PDF`, hd);
      if (r.status !== 200) return json({ hata: `Hepsiburada etiket vermedi (${r.status}): ${r.text.slice(0, 200)}` }, 502);
      const j = JSON.parse(r.text);
      const data = (j.data ?? []) as string[];
      if (!data.length) return json({ hata: "Hepsiburada boş etiket döndürdü" }, 502);
      return json({ format: "pdf", dosyalar: data, ad: `etiket-HB-${p.siparis_no}.pdf` });
    }
    if (p.platform === "Trendyol") {
      if (!p.kargo_takip) return json({ hata: "Bu siparişin kargo takip numarası henüz yok" }, 400);
      const hd = { Authorization: "Basic " + btoa(`${a.api_key}:${a.api_secret}`), "User-Agent": `${a.seller_id} - SelfIntegration` };
      const r = await fetch(`https://apigw.trendyol.com/integration/sellers/${a.seller_id}/common-label/${encodeURIComponent(p.kargo_takip)}`, { headers: hd });
      const t = await r.text();
      if (!r.ok) return json({ hata: /COMMON_LABEL_NOT_ALLOWED/.test(t) ? "Trendyol hesabınızda etiket servisi kapalı. Trendyol kategori sorumlunuzdan \"ortak etiket (common label) API yetkisi\" isteyin; açılınca etiket buradan gelir. Şimdilik Trendyol panelinden yazdırın." : `Trendyol etiket vermedi (${r.status}): ${t.slice(0, 200)}` }, 502);
      const j = JSON.parse(t);
      const etiketler = ((j.data ?? []) as Record<string, string>[]).map((x) => x.label).filter(Boolean);
      if (!etiketler.length) return json({ hata: "Trendyol bu sipariş için etiket döndürmedi; Trendyol panelinden yazdırın." }, 502);
      const dosyalar = [];
      for (const z of etiketler) dosyalar.push(await zplPdf(z));
      return json({ format: "pdf", dosyalar, ad: `etiket-TY-${p.siparis_no}.pdf` });
    }
    if (p.platform === "Koçtaş") {
      const hd = { Authorization: a.api_key, Accept: "application/json" };
      const r = await fetch(`https://koctas.mirakl.net/api/orders/documents?order_ids=${encodeURIComponent(p.siparis_no)}`, { headers: hd });
      const t = await r.text();
      if (!r.ok) return json({ hata: `Koçtaş belgeleri alınamadı (${r.status}): ${t.slice(0, 200)}` }, 502);
      const belgeler = ((JSON.parse(t).order_documents ?? []) as Record<string, any>[]).filter((d) => /DELIVERY|LABEL|SHIPPING/i.test(String(d.type)));
      if (!belgeler.length) return json({ hata: "Koçtaş etiketi henüz oluşmamış. Koçtaş panelinde siparişe girip anlaşmalı kargoyu seçin; etiket 5-10 dakika içinde oluşur, sonra tekrar deneyin." }, 404);
      belgeler.sort((x, y) => String(y.date_uploaded).localeCompare(String(x.date_uploaded)));
      const d = await fetch(`https://koctas.mirakl.net/api/orders/documents/download?document_ids=${belgeler[0].id}`, { headers: { Authorization: a.api_key } });
      if (!d.ok) return json({ hata: `Koçtaş etiketi indirilemedi (${d.status})` }, 502);
      const buf = new Uint8Array(await d.arrayBuffer());
      if (new TextDecoder("latin1").decode(buf.slice(0, 4)) !== "%PDF") return json({ hata: "Koçtaş belgesi PDF değil; panelden yazdırın." }, 502);
      return json({ format: "pdf", dosyalar: [b64(buf)], ad: `etiket-KT-${p.siparis_no}.pdf` });
    }
    if (p.platform === "N11") {
      const kod = p.barkod || p.kargo_takip || p.ham?.kampanya;
      if (!kod) return json({ hata: "N11 bu sipariş için henüz kargo kodu üretmedi. Sipariş otomatik onaylandıktan birkaç dakika sonra tekrar deneyin." }, 400);
      const [ay] = await rest("ayarlar?select=firma_adi&limit=1");
      const temiz = (v: unknown) => String(v ?? "").replace(/[\^~]/g, " ").replace(/\s+/g, " ").trim();
      const sar = (t: string, n: number, max: number) => { const out: string[] = []; let cur = ""; for (const w of t.split(" ")) { if ((cur + " " + w).trim().length > n) { if (cur) out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) out.push(cur); return out.slice(0, max); };
      const urun = ((p.satirlar ?? []) as Record<string, any>[]).map((x) => `${Number(x.miktar) > 1 ? x.miktar + " x " : ""}${x.kod || x.ad}`).join(", ");
      const adres = sar(temiz(p.adres), 44, 4);
      let y = 0; const L: string[] = ["^XA", "^CI28", "^PW800", "^LL800"];
      const yaz = (t: string, h: number, x = 30) => { L.push(`^FO${x},${y}^A0N,${h},${h}^FD${temiz(t)}^FS`); y += h + 8; };
      y = 25; yaz(`${temiz(p.kargo_firma) || "Kargo"} · n11`, 40); yaz(`Sipariş: ${p.siparis_no}`, 28);
      L.push(`^FO30,${y}^GB740,3,3^FS`); y += 15;
      yaz("ALICI", 24); yaz(temiz(p.alici || p.musteri), 40);
      for (const a2 of adres) yaz(a2, 28);
      if (p.telefon) yaz(`Tel: ${p.telefon}`, 28);
      L.push(`^FO30,${y}^GB740,3,3^FS`); y += 15;
      yaz(`GÖNDEREN: ${temiz(ay?.firma_adi) || ""}`, 24);
      if (urun) for (const u2 of sar(temiz(urun), 52, 2)) yaz(u2, 22);
      y = Math.max(y + 10, 560);
      L.push(`^FO60,${y}^BY3^BCN,150,Y,N,N^FD${temiz(kod)}^FS`, "^XZ");
      return json({ format: "pdf", dosyalar: [await zplPdf(L.join("\n"))], ad: `etiket-N11-${p.siparis_no}.pdf` });
    }
    return json({ hata: `${p.platform} için etiket programdan alınamıyor; platform panelinden yazdırın.` }, 400);
  } catch (err) {
    return json({ hata: String((err as Error).message || err) }, 500);
  }
});
