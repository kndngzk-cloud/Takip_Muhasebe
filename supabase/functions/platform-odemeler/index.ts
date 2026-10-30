// Pazaryeri / odeme kurulusu odemelerini ceker ve "Odemeler" bolumune gelecek odeme olarak yazar.
// PayTR: Odeme Ozeti servisi (future_payments)  ·  Trendyol: cari hesap ekstresi (settlements, paymentDate)
// Her gece pg_cron ile ya da Ayarlar'dan (yonetici) "Simdi calistir" ile tetiklenir.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function yetkili(req: Request, body: Record<string, unknown>) {
  if (typeof body.token === "string" && body.token) {
    const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
    if (r && r.deger === body.token) return true;
  }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) return false;
  const user = await u.json();
  if (!user?.id) return false;
  const [p] = await rest(`profiller?select=rol&id=eq.${user.id}`);
  return p?.rol === "admin";
}

// Istanbul saatiyle YYYY-MM-DD
const gun = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const ekle = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sayi = (v: unknown) => { if (typeof v === "number") return v; const s = String(v ?? "").trim(); if (!s) return NaN; return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); };

type Kalem = { vade: string; tutar: number; aciklama: string };

/* ---------------- PayTR ---------------- */
async function paytr(a: Record<string, string>): Promise<{ kalemler: Kalem[]; odenen: string[]; ham: unknown }> {
  if (!a.merchant_id || !a.merchant_key || !a.merchant_salt) throw new Error("PayTR mağaza no, key ve salt girilmeli");
  const bugun = gun(new Date());
  const iste = async (bas: string, bit: string) => {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(a.merchant_key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(a.merchant_id + bas + bit + a.merchant_salt));
    const token = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const r = await fetch("https://www.paytr.com/rapor/odeme-dokumu", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ merchant_id: a.merchant_id, start_date: bas, end_date: bit, paytr_token: token }),
    });
    const t = await r.text();
    try { return JSON.parse(t); } catch { throw new Error(`PayTR yanıtı okunamadı: ${t.slice(0, 200)}`); }
  };
  // son 10 gun (yatanlar) + bugunden itibaren 30 gun
  const gecmis = await iste(ekle(bugun, -10), bugun);
  const ileri = await iste(bugun, ekle(bugun, 30));
  for (const r of [gecmis, ileri]) if (r?.status === "error") throw new Error(`PayTR: ${r.err_no || ""} ${r.err_msg || ""}`.trim());
  const kalemler: Kalem[] = [];
  const odenen: string[] = [];
  // yanit bicimi: duz nesne, dizi ya da tarihe gore nesne olabilir; hepsini tara
  const tara = (o: unknown, gelecek: boolean) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((x) => tara(x, gelecek)); return; }
    const r = o as Record<string, unknown>;
    const tarih = String(r.date_paid ?? r.payment_date ?? r.date ?? r.odeme_tarihi ?? "").slice(0, 10);
    const net = sayi(r.net_amounts ?? r.net_amount ?? r.net);
    if (/^\d{4}-\d{2}-\d{2}$/.test(tarih) && !isNaN(net) && net !== 0) {
      if (gelecek || tarih >= bugun) kalemler.push({ vade: tarih, tutar: net, aciklama: "PayTR ödeme özeti" });
      else odenen.push(tarih);
    }
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === "object") tara(v, gelecek || k === "future_payments");
      else if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v != null) { /* {"2026-11-03": tutar} bicimi */
        const n = sayi(v); if (!isNaN(n) && n !== 0) (gelecek || k >= bugun ? kalemler.push({ vade: k, tutar: n, aciklama: "PayTR ödeme özeti" }) : odenen.push(k));
      }
    }
  };
  tara(gecmis, false); tara(ileri, false);
  // ayni gune dusenleri topla
  const by: Record<string, Kalem> = {};
  kalemler.forEach((x) => { by[x.vade] = by[x.vade] ? { ...by[x.vade], tutar: by[x.vade].tutar + x.tutar } : { ...x }; });
  return { kalemler: Object.values(by), odenen, ham: { gecmis, ileri } };
}

/* ---------------- Trendyol ---------------- */
async function trendyol(a: Record<string, string>): Promise<{ kalemler: Kalem[]; odenen: string[]; ham: unknown }> {
  if (!a.seller_id || !a.api_key || !a.api_secret) throw new Error("Trendyol satıcı ID, API key ve API secret girilmeli");
  const auth = "Basic " + btoa(`${a.api_key}:${a.api_secret}`);
  const ua = `${a.seller_id} - SelfIntegration`;
  const bugun = gun(new Date());
  const by: Record<string, number> = {};
  let adet = 0;
  // siparis teslim kayitlari: son 75 gun, 15 gunluk pencereler
  for (const tip of ["Sale", "Return"]) {
    for (let i = 0; i < 5; i++) {
      const bit = Date.now() - i * 15 * 86400000, bas = bit - 15 * 86400000 + 1000;
      let page = 0, totalPages = 1;
      while (page < totalPages && page < 40) {
        const u = `https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/settlements?startDate=${bas}&endDate=${bit}&transactionType=${tip}&page=${page}&size=1000`;
        const r = await fetch(u, { headers: { Authorization: auth, "User-Agent": ua, storeFrontCode: "TR" } });
        const t = await r.text();
        if (!r.ok) throw new Error(`Trendyol ${r.status}: ${t.slice(0, 200)}`);
        const j = JSON.parse(t);
        totalPages = j.totalPages ?? 1;
        for (const c of j.content ?? []) {
          if (!c.paymentDate) continue;
          const d = gun(new Date(c.paymentDate));
          if (d < bugun) continue; // gecmis vadeler zaten odendi
          let v = sayi(c.sellerRevenue);
          if (isNaN(v)) v = sayi(c.credit) - sayi(c.debt);
          if (tip === "Return") v = -Math.abs(v);
          by[d] = (by[d] || 0) + v; adet++;
        }
        page++;
      }
    }
  }
  const kalemler = Object.entries(by).filter(([, v]) => Math.abs(v) > 0.005).map(([vade, tutar]) => ({ vade, tutar: Math.round(tutar * 100) / 100, aciklama: "Trendyol hakediş (sipariş vadeleri)" }));
  return { kalemler, odenen: [], ham: { kayit: adet, gunler: by } };
}

const PLATFORM: Record<string, (a: Record<string, string>) => Promise<{ kalemler: Kalem[]; odenen: string[]; ham: unknown }>> = { PayTR: paytr, Trendyol: trendyol };
const REF = (p: string) => p.toLowerCase().replace(/[^a-z]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const sadece = typeof body.platform === "string" ? body.platform : null;
    const ent = await rest(`entegrasyonlar?select=platform,aktif,ayar${sadece ? `&platform=eq.${encodeURIComponent(sadece)}` : "&aktif=is.true"}`);
    const bugun = gun(new Date());
    const sonuc: Record<string, unknown> = {};
    for (const e of ent) {
      const f = PLATFORM[e.platform];
      if (!f) { sonuc[e.platform] = "Bu platform için otomatik bağlantı henüz yok"; continue; }
      try {
        const { kalemler, odenen, ham } = await f(e.ayar || {});
        const ref = REF(e.platform);
        // gelecek odemeler: dis_ref ile ekle / guncelle
        if (kalemler.length) {
          await rest("nakit_girisleri?on_conflict=dis_ref", {
            method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(kalemler.map((k) => ({ tur: "Platform", kaynak: e.platform, vade: k.vade, tutar: Math.round(k.tutar * 100) / 100, aciklama: k.aciklama, dis_ref: `${ref}:${k.vade}`, otomatik: true, durum: "Bekliyor" }))),
          });
        }
        // artik listede olmayan gelecek otomatik kayitlar (tutar sifirlandi / iptal)
        const gelecekRef = new Set(kalemler.map((k) => `${ref}:${k.vade}`));
        const eski = await rest(`nakit_girisleri?select=id,dis_ref&otomatik=is.true&kaynak=eq.${encodeURIComponent(e.platform)}&durum=eq.Bekliyor&vade=gte.${bugun}`);
        for (const x of eski) if (!gelecekRef.has(x.dis_ref)) await rest(`nakit_girisleri?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ durum: "İptal", aciklama: "Platform listesinde artık yok" }) });
        // yatan odemeler
        for (const d of odenen) await rest(`nakit_girisleri?dis_ref=eq.${encodeURIComponent(`${ref}:${d}`)}&durum=eq.Bekliyor`, { method: "PATCH", body: JSON.stringify({ durum: "Tahsil edildi", tahsil_tarihi: d }) });
        // ayni platformun elle girilmis gelecek kayitlari otomatikle cakismasin
        if (kalemler.length) await rest(`nakit_girisleri?otomatik=is.false&tur=eq.Platform&kaynak=ilike.${encodeURIComponent(e.platform)}&durum=eq.Bekliyor&vade=gte.${bugun}`, { method: "PATCH", body: JSON.stringify({ durum: "İptal", aciklama: "Otomatik entegrasyon devraldı" }) });
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_calisma: new Date().toISOString(), son_durum: `Tamam · ${kalemler.length} ödeme günü`, son_adet: kalemler.length, son_yanit: JSON.parse(JSON.stringify(ham)) }) });
        sonuc[e.platform] = { gun: kalemler.length, toplam: kalemler.reduce((a, k) => a + k.tutar, 0) };
      } catch (err) {
        const m = String((err as Error).message || err).slice(0, 400);
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_calisma: new Date().toISOString(), son_durum: `Hata: ${m}` }) }).catch(() => {});
        sonuc[e.platform] = { hata: m };
      }
    }
    return json({ sonuc });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
