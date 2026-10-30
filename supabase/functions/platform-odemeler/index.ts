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

type Kalem = { vade: string; tutar: number; aciklama: string; para_birimi?: string };

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
  for (const r of [gecmis, ileri]) if (r?.status !== "success") throw new Error(`PayTR: ${r?.err_no || ""} ${r?.err_msg || r?.reason || JSON.stringify(r).slice(0, 150)}`.trim());
  // future_payments.net_amounts = { "2026-11-03": { "TL": 13451.79 }, ... }  (tarih filtresinden bagimsiz, tum gelecek odemeler)
  const fp = (ileri.future_payments ?? gecmis.future_payments ?? {}) as Record<string, unknown>;
  const net = (fp.net_amounts ?? {}) as Record<string, unknown>;
  const kalemler: Kalem[] = [];
  for (const [tarih, v] of Object.entries(net)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || tarih < bugun) continue;
    const doviz = v && typeof v === "object" ? (v as Record<string, unknown>) : { TL: v };
    for (const [pb, t] of Object.entries(doviz)) {
      if (!["TL", "TRY", "USD", "EUR", "GBP"].includes(pb)) continue;
      const n = sayi(t);
      if (!isNaN(n) && n > 0.005) kalemler.push({ vade: tarih, tutar: Math.round(n * 100) / 100, aciklama: "PayTR ödeme özeti", para_birimi: pb === "TL" ? "TRY" : pb });
    }
  }
  // paid_list = [{ date_paid, net, ... }] -> yatmis odemeler
  const odenen = [...new Set([...(gecmis.paid_list ?? []), ...(ileri.paid_list ?? [])].map((x: Record<string, unknown>) => String(x.date_paid ?? "").slice(0, 10)).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  const ozet = (r: Record<string, unknown>) => ({ paid_list: (r.paid_list as Record<string, unknown>[] ?? []).map(({ date_paid, net, currency }) => ({ date_paid, net, currency })), future_payments: { net_amounts: (r.future_payments as Record<string, unknown>)?.net_amounts } });
  return { kalemler, odenen, ham: { gecmis: ozet(gecmis), ileri: ozet(ileri) } };
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

/* ---------------- Hepsiburada ---------------- */
// Muhasebe entegrasyonu: GET mpfinance-external.hepsiburada.com/transactions/merchantid/{id}
// Basic auth (Magaza ID : Servis anahtari), User-Agent = entegrator kullanici adi. Tarih araligi en fazla 1 ay.
async function hepsiburada(a: Record<string, string>): Promise<{ kalemler: Kalem[]; odenen: string[]; ham: unknown }> {
  if (!a.merchant_id || !a.servis_anahtari || !a.kullanici_adi) throw new Error("Hepsiburada mağaza ID, servis anahtarı ve entegratör kullanıcı adı girilmeli");
  const auth = "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`);
  const bugun = gun(new Date());
  const getir = async (q: Record<string, string>) => {
    const out: Record<string, unknown>[] = [];
    for (let off = 0; off < 20000; off += 100) {
      const u = new URL(`https://mpfinance-external.hepsiburada.com/transactions/merchantid/${encodeURIComponent(a.merchant_id)}`);
      Object.entries({ Offset: String(off), Limit: "100", ...q }).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { Authorization: auth, "User-Agent": a.kullanici_adi, Accept: "application/json" } });
      const t = await r.text();
      if (!r.ok) throw new Error(`Hepsiburada ${r.status}: ${t.slice(0, 200)}`);
      const j = JSON.parse(t);
      const items = (Array.isArray(j) ? j : j.items ?? j.data ?? []) as Record<string, unknown>[];
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  };
  const deger = (x: unknown) => sayi((x as Record<string, unknown>)?.value ?? x);
  // odenecekler: vadesi bugunden itibaren 2 ay (1'er aylik pencere)
  const bekleyen = [
    ...(await getir({ Status: "WillBePaid", DueDateStart: bugun, DueDateEnd: ekle(bugun, 30) })),
    ...(await getir({ Status: "WillBePaid", DueDateStart: ekle(bugun, 31), DueDateEnd: ekle(bugun, 61) })),
  ];
  const by: Record<string, number> = {};
  const tipler: Record<string, number> = {};
  const gorulen = new Set<string>();
  for (const x of bekleyen) {
    const id = String(x.id ?? ""); if (id && gorulen.has(id)) continue; if (id) gorulen.add(id);
    const tip = String(x.transactionType ?? "");
    if (tip === "Payment" || tip === "TotalPayment") continue; // odeme kaydinin kendisi
    const d = String(x.dueDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < bugun) continue;
    const v = Math.abs(deger(x.amount)); if (isNaN(v)) continue;
    const isaretli = x.isIncome === false ? -v : v;
    by[d] = (by[d] || 0) + isaretli;
    tipler[tip] = Math.round(((tipler[tip] || 0) + isaretli) * 100) / 100;
  }
  // son 10 gunde yatanlar
  const odenen = [...new Set((await getir({ Status: "Paid", PaymentDateStart: ekle(bugun, -10), PaymentDateEnd: bugun }).catch(() => [] as Record<string, unknown>[])).map((x) => String(x.paymentDate ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  const kalemler = Object.entries(by).filter(([, v]) => v > 0.005).map(([vade, tutar]) => ({ vade, tutar: Math.round(tutar * 100) / 100, aciklama: "Hepsiburada hakediş" }));
  return { kalemler, odenen, ham: { kayit: bekleyen.length, gunler: by, tipler, ornek: bekleyen.slice(0, 3).map(({ transactionType, status, amount, netAmount, isIncome, dueDate, paymentDate }) => ({ transactionType, status, amount, netAmount, isIncome, dueDate, paymentDate })) } };
}

/* ---------------- PayTR islem dokumu (tek tek kart odemeleri) ---------------- */
// POST /rapor/islem-dokumu · tarih "YYYY-MM-DD hh:mm:ss" · en fazla 3 gun
async function paytrIslemler(a: Record<string, string>, hesap: string, gunSay: number): Promise<{ adet: number; ornek: unknown[] }> {
  const ornek: unknown[] = [];
  const bugun = gun(new Date());
  const tokenAl = async (msg: string) => {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(a.merchant_key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))));
  };
  const tarihIso = (v: unknown) => {
    const s = String(v ?? "").trim();
    let m = /^(\d{2})[./-](\d{2})[./-](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  };
  // yanit icinde islem_tipi alani olan tum kayitlari topla (bicim: dizi ya da nesne icinde dizi)
  const topla = (o: unknown, out: Record<string, unknown>[]) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((x) => topla(x, out)); return; }
    const r = o as Record<string, unknown>;
    if ("islem_tipi" in r && ("islem_tutari" in r || "net_tutar" in r)) { out.push(r); return; }
    Object.values(r).forEach((v) => topla(v, out));
  };
  const satirlar: Record<string, unknown>[] = [];
  const say: Record<string, number> = {};
  for (let bit = bugun, i = 0; i < Math.ceil(gunSay / 3); i++) {
    const bas = ekle(bit, -2);
    const sd = `${bas} 00:00:00`, ed = `${bit} 23:59:59`;
    await new Promise((ok) => setTimeout(ok, 1500)); // PayTR art arda hizli istekleri engelliyor
    const alanlar = { merchant_id: a.merchant_id, start_date: sd, end_date: ed, paytr_token: await tokenAl(a.merchant_id + sd + ed + a.merchant_salt) };
    // once form-urlencoded, JSON gelmezse multipart/form-data (Postman ornegi) dene
    let r = await fetch("https://www.paytr.com/rapor/islem-dokumu", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(alanlar) });
    let t = await r.text();
    if (!t.trim().startsWith("{")) {
      const fd = new FormData(); Object.entries(alanlar).forEach(([k, v]) => fd.append(k, v));
      r = await fetch("https://www.paytr.com/rapor/islem-dokumu", { method: "POST", body: fd });
      t = await r.text();
    }
    let j: Record<string, unknown>;
    try { j = JSON.parse(t); } catch {
      const baslik = (/<title>([^<]*)<\/title>/i.exec(t)?.[1] || "").trim();
      const govde = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      throw new Error(`PayTR işlem dökümü JSON değil (HTTP ${r.status}${baslik ? ", " + baslik : ""}): ${govde.slice(0, 160)}`);
    }
    if (ornek.length < 2) ornek.push({ aralik: `${sd} – ${ed}`, yanit: t.slice(0, 1200).replace(/\d{6}\d+/g, (m) => m.slice(0, 4) + "…") });
    if (j.status === "error") throw new Error(`PayTR işlem dökümü: ${j.err_no || ""} ${j.err_msg || ""}`.trim());
    const liste: Record<string, unknown>[] = [];
    if (j.status === "success") topla(j, liste);
    for (const x of liste) {
      const tarih = tarihIso(x.islem_tarihi); if (!tarih) continue;
      const tip = String(x.islem_tipi).toUpperCase() === "I" ? "İade" : "Satış";
      const tutar = Math.abs(sayi(x.islem_tutari));
      const sip = String(x.siparis_no ?? "").trim();
      const anahtar = `${REF(hesap)}|${tip}|${sip}|${tarih}|${isNaN(tutar) ? "" : tutar.toFixed(2)}`;
      say[anahtar] = (say[anahtar] || 0) + 1;
      const n = (v: unknown) => { const k = sayi(v); return isNaN(k) ? null : Math.abs(k); };
      const pb = String(x.para_birimi ?? "TL").toUpperCase();
      satirlar.push({
        hesap, dis_ref: `${anahtar}|${say[anahtar]}`, islem_tipi: tip, islem_tarihi: tarih, islem_zamani: String(x.islem_tarihi ?? ""),
        siparis_no: sip || null, islem_tutari: isNaN(tutar) ? 0 : tutar, odeme_tutari: n(x.odeme_tutari), net_tutar: n(x.net_tutar),
        kesinti_tutari: n(x.kesinti_tutari), kesinti_orani: n(x.kesinti_orani), para_birimi: pb === "TL" ? "TRY" : pb,
        taksit: Number.isFinite(Number(x.taksit)) ? Number(x.taksit) : null, kart_marka: x.kart_marka ?? null, kart_no: x.kart_no ?? null,
        odeme_tipi: x.odeme_tipi ?? null, ham: x,
      });
    }
    bit = ekle(bas, -1);
  }
  if (satirlar.length) {
    for (let i = 0; i < satirlar.length; i += 500) {
      await rest("paytr_islemler?on_conflict=dis_ref", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(satirlar.slice(i, i + 500)) });
    }
  }
  return { adet: satirlar.length, ornek };
}

const PLATFORM: Record<string, (a: Record<string, string>) => Promise<{ kalemler: Kalem[]; odenen: string[]; ham: unknown }>> = { PayTR: paytr, "PayTR 2": paytr, Trendyol: trendyol, Hepsiburada: hepsiburada };
// "PayTR 2" -> kaynak "PayTR" (Odemeler'de ayni platform), dis_ref "paytr2:..." (hesaplar karismasin)
const REF = (p: string) => p.toLowerCase().replace(/[^a-z0-9]/g, "");
const KAYNAK = (p: string) => p.replace(/\s+\d+$/, "");
const HESAP = (p: string) => (/\s(\d+)$/.exec(p)?.[1] ? ` · ${/\s(\d+)$/.exec(p)![1]}. hesap` : "");

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
        const ref = REF(e.platform), kaynak = KAYNAK(e.platform);
        const dref = (k: Kalem) => `${ref}:${k.vade}${k.para_birimi && k.para_birimi !== "TRY" ? ":" + k.para_birimi : ""}`;
        // otomatik veri geldiyse ayni platformun elle girilmis gelecek kayitlari silinir (yerine otomatikler yazilir)
        if (kalemler.length) await rest(`nakit_girisleri?otomatik=is.false&tur=eq.Platform&kaynak=ilike.${encodeURIComponent(kaynak)}&durum=eq.Bekliyor&vade=gte.${bugun}`, { method: "DELETE" });
        // gelecek odemeler: dis_ref ile ekle / guncelle
        if (kalemler.length) {
          await rest("nakit_girisleri?on_conflict=dis_ref", {
            method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(kalemler.map((k) => ({ tur: "Platform", kaynak, vade: k.vade, tutar: k.tutar, para_birimi: k.para_birimi || "TRY", aciklama: k.aciklama + HESAP(e.platform), dis_ref: dref(k), otomatik: true, durum: "Bekliyor" }))),
          });
        }
        // artik listede olmayan gelecek otomatik kayitlar (tutar sifirlandi / iptal)
        const gelecekRef = new Set(kalemler.map(dref));
        const eski = await rest(`nakit_girisleri?select=id,dis_ref&otomatik=is.true&dis_ref=like.${encodeURIComponent(ref + ":")}*&durum=eq.Bekliyor&vade=gte.${bugun}`);
        for (const x of eski) if (!gelecekRef.has(x.dis_ref)) await rest(`nakit_girisleri?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ durum: "İptal", aciklama: "Platform listesinde artık yok" }) });
        // yatan odemeler
        for (const d of odenen) await rest(`nakit_girisleri?dis_ref=like.${encodeURIComponent(`${ref}:${d}`)}*&durum=eq.Bekliyor`, { method: "PATCH", body: JSON.stringify({ durum: "Tahsil edildi", tahsil_tarihi: d }) });
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_calisma: new Date().toISOString(), son_durum: `Tamam · ${kalemler.length} ödeme günü`, son_adet: kalemler.length, son_yanit: JSON.parse(JSON.stringify(ham)) }) });
        // PayTR: tek tek kart odemeleri (tahsilat eslestirme icin). Ilk calismada son 60 gun, sonra son 9 gun.
        let islemNot = "";
        if (e.platform.startsWith("PayTR")) {
          try {
            const var_ = await rest(`paytr_islemler?select=id&hesap=eq.${encodeURIComponent(e.platform)}&limit=1`);
            const gunSay = typeof body.islem_gun === "number" ? Math.min(body.islem_gun, 120) : var_.length ? 9 : 60;
            const { adet, ornek } = await paytrIslemler(e.ayar || {}, e.platform, gunSay);
            islemNot = ` · ${adet} kart işlemi`;
            await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(JSON.parse(JSON.stringify(ham)) as Record<string, unknown>), islem_ornek: ornek } }) });
          } catch (err) { islemNot = ` · işlem dökümü hatası: ${String((err as Error).message || err).slice(0, 200)}`; }
          await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_durum: `Tamam · ${kalemler.length} ödeme günü${islemNot}` }) });
        }
        sonuc[e.platform] = { islem: islemNot.replace(/^ · /, ""), gun: new Set(kalemler.map((k) => k.vade)).size, toplam: Math.round(kalemler.filter((k) => (k.para_birimi || "TRY") === "TRY").reduce((a, k) => a + k.tutar, 0) * 100) / 100 };
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
