// Pazaryeri siparislerini ceker (Koctas / Hepsiburada / Trendyol), platform_siparisler'e yazar ve programa aktarir.
// 15 dakikada bir pg_cron ile ya da uygulamadan (yonetici) tetiklenir.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.slice(0, 60)}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function yetkili(req: Request, body: Record<string, unknown>) {
  if (typeof body.token === "string" && body.token) { const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token"); if (r && r.deger === body.token) return true; }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!jwt) return false;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }); if (!u.ok) return false;
  const user = await u.json(); if (!user?.id) return false;
  const [p] = await rest(`profiller?select=rol&id=eq.${user.id}`); return p?.rol === "admin";
}
const sayi = (v: unknown) => { if (typeof v === "number") return v; const s = String(v ?? "").trim(); if (!s) return NaN; return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); };
const para = (v: unknown) => { const n = sayi((v as Record<string, unknown>)?.amount ?? (v as Record<string, unknown>)?.value ?? v); return isNaN(n) ? 0 : n; };
const d10 = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "number") return new Date(v).toISOString().slice(0, 10); const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v)); return m ? m[1] : null; };
const iso = (v: unknown) => { if (v == null || v === "") return null; const d = typeof v === "number" ? new Date(v) : new Date(String(v)); return isNaN(+d) ? null : d.toISOString(); };
const r2 = (n: number) => Math.round(n * 100) / 100;
type Satir = { kod: string; ad: string; miktar: number; tutar: number };
type Sip = { platform: string; siparis_no: string; platform_durum?: string; tarih?: string | null; musteri?: string | null; alici?: string | null; telefon?: string | null; eposta?: string | null; sehir?: string | null; adres?: string | null; vergi_no?: string | null;
  satirlar: Satir[]; brut: number; komisyon?: number | null; kargo_kesinti?: number | null; net?: number | null; kesinti_kesin?: boolean; kargo_firma?: string | null; kargo_takip?: string | null; kargo_link?: string | null; barkod?: string | null;
  sevk_tarihi?: string | null; teslim_tarihi?: string | null; iptal?: boolean; ham?: unknown };

/* Hepsiburada User-Agent'i birebir istiyor; fetch kendi ekini koydugu icin istek TLS uzerinden elle yazilir */
async function hamGet(u: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  const url = new URL(u);
  const conn = await Deno.connectTls({ hostname: url.hostname, port: 443 });
  try {
    const satir = [`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.hostname}`, "Connection: close", ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", ""];
    await conn.write(new TextEncoder().encode(satir.join("\r\n")));
    const parcalar: Uint8Array[] = []; let top = 0; const buf = new Uint8Array(65536);
    while (true) { const n = await conn.read(buf).catch(() => null); if (!n) break; parcalar.push(buf.slice(0, n)); top += n; }
    const tum = new Uint8Array(top); let o = 0; for (const p of parcalar) { tum.set(p, o); o += p.length; }
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

/* ---------------- Koctas (Mirakl OR11) ---------------- */
async function koctas(a: Record<string, string>, gunSay: number): Promise<Sip[]> {
  if (!a.api_key) throw new Error("Koçtaş API anahtarı yok");
  const bas = new Date(Date.now() - gunSay * 86400000).toISOString().slice(0, 19) + "Z";
  const out: Sip[] = [];
  for (let off = 0; off < 5000; off += 100) {
    const r = await fetch(`https://koctas.mirakl.net/api/orders?start_update_date=${bas}&max=100&offset=${off}`, { headers: { Authorization: a.api_key, Accept: "application/json" } });
    const t = await r.text(); if (!r.ok) throw new Error(`Koçtaş ${r.status}: ${t.slice(0, 200)}`);
    const j = JSON.parse(t);
    for (const o of (j.orders ?? []) as Record<string, any>[]) {
      const st = String(o.order_state);
      if (["STAGING", "WAITING_ACCEPTANCE", "WAITING_DEBIT", "WAITING_DEBIT_PAYMENT", "REFUSED"].includes(st) && !o.customer_debited_date) continue; // odenmemis
      const c = o.customer || {}; const sa = c.shipping_address || {}; const ba = c.billing_address || {};
      const lines = (o.order_lines ?? []) as Record<string, any>[];
      const l0 = lines[0] || {};
      const kargoVar = ["SHIPPED", "TO_COLLECT", "RECEIVED", "CLOSED"].includes(st);
      out.push({
        platform: "Koçtaş", siparis_no: o.order_id, platform_durum: st, tarih: iso(o.created_date),
        musteri: [c.firstname, c.lastname].filter(Boolean).join(" ") || null, alici: [sa.firstname, sa.lastname].filter(Boolean).join(" ") || null,
        telefon: sa.phone || ba.phone || sa.phone_secondary || null, eposta: o.customer_notification_email || null,
        sehir: sa.city || ba.city || null, adres: [sa.street_1, sa.street_2, sa.city].filter(Boolean).join(" ") || null,
        satirlar: lines.filter((l) => !["CANCELED", "REFUSED"].includes(l.order_line_state)).map((l) => ({ kod: l.product_shop_sku || l.offer_sku || "", ad: l.product_title || "", miktar: Number(l.quantity) || 1, tutar: para(l.total_price) })),
        brut: para(o.total_price), komisyon: para(o.total_commission), kargo_kesinti: 0, kesinti_kesin: true,
        kargo_firma: o.shipping_company || null, kargo_takip: o.shipping_tracking || null, kargo_link: o.shipping_tracking_url || null, barkod: o.shipping_tracking || null,
        sevk_tarihi: kargoVar ? d10(l0.shipped_date) : null, teslim_tarihi: d10(l0.received_date),
        iptal: st === "CANCELED" || st === "REFUSED" || o.fully_refunded === true,
        ham: { durum: st, odeme: o.payment_type, kargo: o.shipping_company },
      });
    }
    if ((j.orders ?? []).length < 100) break;
  }
  return out;
}

/* ---------------- Hepsiburada (OMS + muhasebe) ---------------- */
async function hepsiburada(a: Record<string, string>, gunSay: number): Promise<Sip[]> {
  if (!a.merchant_id || !a.servis_anahtari || !a.kullanici_adi) throw new Error("Hepsiburada bilgileri eksik");
  const mid = encodeURIComponent(a.merchant_id);
  const hd = { Authorization: "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`), "User-Agent": a.kullanici_adi, Accept: "application/json" };
  const al = async (u: string) => { const r = await hamGet(u, hd); if (r.status < 200 || r.status >= 300) throw new Error(`Hepsiburada ${r.status}: ${r.text.slice(0, 200)} (${u.split("?")[0].split("/").slice(3, 5).join("/")})`); return JSON.parse(r.text || "{}"); };
  const liste = async (u: string) => { const out: Record<string, any>[] = []; for (let off = 0; off < 3000; off += 100) { const j = await al(`${u}${u.includes("?") ? "&" : "?"}offset=${off}&limit=100`); const it = (Array.isArray(j) ? j : j.items ?? j.data ?? []) as Record<string, any>[]; out.push(...it); if (it.length < 100) break; } return out; };
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
  const bit = new Date(), basT = new Date(Date.now() - gunSay * 86400000);
  const aralik = `begindate=${encodeURIComponent(fmt(basT))}&enddate=${encodeURIComponent(fmt(bit))}`;
  const oms = "https://oms-external.hepsiburada.com";
  const kalemler: Record<string, Record<string, any>[]> = {};
  for (const it of await liste(`${oms}/orders/merchantid/${mid}`)) (kalemler[it.orderNumber] ||= []).push(it);
  const sevk: Record<string, { tarih: string | null; barkod: string | null }> = {};
  const teslim: Record<string, string | null> = {};
  const iptal = new Set<string>();
  const notlar: string[] = [];
  try { for (const p of await liste(`${oms}/packages/merchantid/${mid}/shipped?${aralik}`)) for (const no of (p.OrderNumbers?.length ? p.OrderNumbers : [p.OrderNumber]).filter(Boolean)) sevk[no] = { tarih: d10(p.ShippedDate), barkod: p.Barcode || p.PackageNumber || null }; } catch (e) { notlar.push(String(e)); }
  try { for (const p of await liste(`${oms}/packages/merchantid/${mid}/delivered?${aralik}`)) for (const no of (p.OrderNumbers?.length ? p.OrderNumbers : [p.OrderNumber]).filter(Boolean)) { teslim[no] = d10(p.DeliveredDate); sevk[no] ||= { tarih: d10(p.DeliveredDate), barkod: p.Barcode || p.PackageNumber || null }; } } catch (e) { notlar.push(String(e)); }
  try { for (const c of await liste(`${oms}/orders/merchantid/${mid}/cancelled?${aralik}`)) if (c.orderNumber) iptal.add(String(c.orderNumber)); } catch (e) { notlar.push(String(e)); }
  // kargolanmis ama acik listede olmayan siparislerin detayi
  for (const no of [...Object.keys(sevk), ...iptal]) if (!kalemler[no]) { try { const d = await al(`${oms}/orders/merchantid/${mid}/ordernumber/${encodeURIComponent(no)}`); kalemler[no] = d.items ?? []; } catch (e) { notlar.push(String(e)); } }
  const out: Sip[] = [];
  for (const [no, its] of Object.entries(kalemler)) {
    if (!its.length) continue;
    const i0 = its[0]; const sa = i0.shippingAddress || {}; const inv = i0.invoice || {};
    const brut = r2(its.reduce((t, x) => t + para(x.totalPrice), 0));
    const komTahmin = r2(its.reduce((t, x) => t + para(x.commission), 0) * 1.2); // komisyon KDV haric gelir
    // kesin kesintiler muhasebe servisinden (siparis numarasi ile)
    let kom: number | null = komTahmin, kargo: number | null = null, net: number | null = null, kesin = false;
    try {
      const r = await hamGet(`https://mpfinance-external.hepsiburada.com/transactions/merchantid/${mid}?Offset=0&Limit=100&OrderNumber=${encodeURIComponent(no)}`, hd);
      if (r.status === 200) {
        const tr = ((JSON.parse(r.text).items ?? []) as Record<string, any>[]).filter((x) => String(x.orderNumber ?? x.OrderNumber ?? "") === no);
        const tutar = (x: Record<string, any>) => (x.isIncome === false ? -1 : 1) * Math.abs(para(x.amount));
        const satis = tr.filter((x) => x.transactionType === "Payment").reduce((t, x) => t + tutar(x), 0);
        const komK = tr.filter((x) => /Commission/.test(x.transactionType)).reduce((t, x) => t + tutar(x), 0);
        const kargoK = tr.filter((x) => /Shipment|Cargo|Delivery/.test(x.transactionType)).reduce((t, x) => t + tutar(x), 0);
        const digerK = tr.filter((x) => !["Payment", "TotalPayment"].includes(x.transactionType)).reduce((t, x) => t + tutar(x), 0);
        if (satis > 0 && tr.some((x) => /Commission/.test(x.transactionType))) { kom = r2(-komK); kargo = r2(-kargoK); net = r2(satis + digerK); kesin = tr.some((x) => /Shipment|Cargo/.test(x.transactionType)); }
      }
    } catch { /* muhasebe kaydi yoksa tahmin kalir */ }
    const sv = sevk[no];
    out.push({
      platform: "Hepsiburada", siparis_no: no, platform_durum: iptal.has(no) ? "Cancelled" : teslim[no] ? "Delivered" : sv ? "Shipped" : String(i0.status || "Open"), tarih: iso(i0.orderDate),
      musteri: i0.customerName && !/@/.test(i0.customerName) ? i0.customerName : sa.name || i0.customerName || null, alici: sa.name || null,
      telefon: sa.phoneNumber || null, eposta: sa.email || null, sehir: sa.city || null, adres: [sa.address, sa.town, sa.city].filter(Boolean).join(" ") || null, vergi_no: inv.taxNumber || null,
      satirlar: its.map((x) => ({ kod: x.merchantSKU || x.merchantSku || x.sku || "", ad: x.name || x.productName || "", miktar: Number(x.quantity) || 1, tutar: para(x.totalPrice) })),
      brut, komisyon: kom, kargo_kesinti: kargo, net, kesinti_kesin: kesin,
      kargo_firma: i0.cargoCompany || i0.cargoCompanyModel?.name || null, kargo_takip: sv?.barkod || i0.barcode || i0.packageNumber || null,
      kargo_link: sv?.barkod ? `https://www.hepsijet.com/gonderi-takibi/${sv.barkod}` : null, barkod: sv?.barkod || i0.barcode || null,
      sevk_tarihi: sv?.tarih ?? null, teslim_tarihi: teslim[no] ?? null, iptal: iptal.has(no),
      ham: { durum: i0.status, notlar: notlar.slice(0, 3) },
    });
  }
  if (!out.length && notlar.length) throw new Error(notlar[0]);
  return out;
}

/* ---------------- Trendyol (siparis paketleri + hakedis) ---------------- */
async function trendyol(a: Record<string, string>, gunSay: number): Promise<Sip[]> {
  if (!a.seller_id || !a.api_key || !a.api_secret) throw new Error("Trendyol bilgileri eksik");
  const hd = { Authorization: "Basic " + btoa(`${a.api_key}:${a.api_secret}`), "User-Agent": `${a.seller_id} - SelfIntegration`, storeFrontCode: "TR" };
  const al = async (u: string) => { const r = await fetch(u, { headers: hd }); const t = await r.text(); if (!r.ok) throw new Error(`Trendyol ${r.status}: ${t.slice(0, 200)}`); return JSON.parse(t); };
  const paketler: Record<string, any>[] = [];
  const bit = Date.now(), bas = bit - Math.min(gunSay, 14) * 86400000;
  for (let page = 0; page < 50; page++) {
    const j = await al(`https://apigw.trendyol.com/integration/order/sellers/${a.seller_id}/orders?startDate=${bas}&endDate=${bit}&orderByField=PackageLastModifiedDate&orderByDirection=DESC&size=200&page=${page}`);
    paketler.push(...(j.content ?? [])); if (page + 1 >= (j.totalPages ?? 1)) break;
  }
  // komisyon: hakedis kayitlarindan (siparis no ile)
  const kom: Record<string, { kom: number; gelir: number }> = {};
  try {
    for (let i = 0; i < 3; i++) {
      const e = bit - i * 15 * 86400000, s = e - 15 * 86400000 + 1000;
      const j = await al(`https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/settlements?startDate=${s}&endDate=${e}&transactionType=Sale&page=0&size=1000`);
      for (const c of j.content ?? []) { const o = kom[c.orderNumber] ||= { kom: 0, gelir: 0 }; o.kom += Math.abs(sayi(c.commissionAmount) || 0); o.gelir += sayi(c.sellerRevenue) || 0; }
    }
  } catch { /* hakedis yoksa tahminsiz */ }
  const grup: Record<string, Record<string, any>[]> = {};
  for (const p of paketler) (grup[p.orderNumber] ||= []).push(p);
  const out: Sip[] = [];
  for (const [no, ps] of Object.entries(grup)) {
    const aktif = ps.filter((p) => !["Cancelled", "UnSupplied"].includes(p.status));
    const p0 = (aktif[0] || ps[0]); const sa = p0.shipmentAddress || {}; const ia = p0.invoiceAddress || {};
    const lines = aktif.flatMap((p) => (p.lines ?? []).filter((l: any) => !["Cancelled", "UnSupplied"].includes(l.orderLineItemStatusName)));
    const brut = r2(lines.reduce((t: number, l: any) => t + (sayi(l.price) || 0) * (Number(l.quantity) || 1), 0)) || r2(aktif.reduce((t, p) => t + (sayi(p.totalPrice) || 0), 0));
    const k = kom[no];
    const komTah = r2(lines.reduce((t: number, l: any) => t + (sayi(l.price) || 0) * (Number(l.quantity) || 1) * (sayi(l.commission) || 0) / 100, 0));
    const kargolu = aktif.find((p) => ["Shipped", "Delivered", "UnDelivered", "AtCollectionPoint"].includes(p.status));
    const sevkT = kargolu ? d10((kargolu.packageHistories ?? []).find((h: any) => h.status === "Shipped")?.createdDate ?? kargolu.lastModifiedDate) : null;
    out.push({
      platform: "Trendyol", siparis_no: String(no), platform_durum: p0.status, tarih: iso(p0.orderDate),
      musteri: [p0.customerFirstName, p0.customerLastName].filter(Boolean).join(" ") || sa.fullName || null, alici: sa.fullName || [sa.firstName, sa.lastName].filter(Boolean).join(" ") || null,
      telefon: sa.phone || null, eposta: p0.customerEmail || null, sehir: sa.city || null, adres: [sa.fullAddress, sa.district, sa.city].filter(Boolean).join(" ") || null, vergi_no: ia.taxNumber || p0.taxNumber || null,
      satirlar: lines.map((l: any) => ({ kod: l.merchantSku || l.sku || l.barcode || "", ad: l.productName || "", miktar: Number(l.quantity) || 1, tutar: r2((sayi(l.price) || 0) * (Number(l.quantity) || 1)) })),
      brut, komisyon: k ? r2(k.kom) : (komTah > 0 ? komTah : null), kargo_kesinti: null, net: k ? r2(k.gelir) : null, kesinti_kesin: false,
      kargo_firma: p0.cargoProviderName || null, kargo_takip: p0.cargoTrackingNumber ? String(p0.cargoTrackingNumber) : null, kargo_link: p0.cargoTrackingLink || null, barkod: p0.cargoTrackingNumber ? String(p0.cargoTrackingNumber) : null,
      sevk_tarihi: sevkT, teslim_tarihi: aktif.some((p) => p.status === "Delivered") ? d10(p0.lastModifiedDate) : null,
      iptal: !aktif.length, ham: { durum: ps.map((p) => p.status) },
    });
  }
  return out;
}

const PLATFORM: Record<string, (a: Record<string, string>, g: number) => Promise<Sip[]>> = { "Koçtaş": koctas, Hepsiburada: hepsiburada, Trendyol: trendyol };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const [ba] = await rest("sistem_ayar?select=deger&anahtar=eq.siparis_aktarim_baslangic");
    const baslangic = String(ba?.deger || "2100-01-01");
    const kuru = body.kuru === true; // sadece cek, aktarma
    const sadece = typeof body.platform === "string" ? body.platform : null;
    const ent = await rest(`entegrasyonlar?select=platform,ayar,son_yanit&platform=in.(${encodeURIComponent('"Koçtaş","Hepsiburada","Trendyol"')})`);
    const sonuc: Record<string, unknown> = {};
    for (const e of ent) {
      if (sadece && e.platform !== sadece) continue;
      const a = e.ayar || {};
      if (!Object.keys(a).length) continue;
      try {
        const gunSay = typeof body.gun === "number" ? body.gun : 3;
        const liste = await PLATFORM[e.platform](a, gunSay);
        let yeni = 0, aktarilan = 0, baglanan = 0, guncellenen = 0, eslesmedi = 0; const hatalar: string[] = [];
        if (liste.length) {
          const mevcut = await rest(`platform_siparisler?select=id,siparis_no,durum,siparis_id&platform=eq.${encodeURIComponent(e.platform)}&siparis_no=in.(${liste.map((s) => `"${s.siparis_no.replace(/"/g, "")}"`).join(",")})`);
          const m = new Map<string, Record<string, any>>(mevcut.map((x: Record<string, any>) => [x.siparis_no, x]));
          const satirlar = liste.map(({ iptal, ...s }) => ({ ...s, guncelleme: new Date().toISOString() }));
          const kayit = await rest("platform_siparisler?on_conflict=platform,siparis_no&select=id,siparis_no,durum,siparis_id,tarih", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(satirlar) });
          for (const k of kayit as Record<string, any>[]) {
            const s = liste.find((x) => x.siparis_no === k.siparis_no)!;
            const eski = m.get(k.siparis_no);
            if (!eski) yeni++;
            let durum = k.durum;
            if (s.iptal && durum !== "İptal") { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "İptal" }) }); durum = "İptal"; }
            else if (!eski && !k.siparis_id && (d10(k.tarih) || "9999") < baslangic) { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "Eski" }) }); durum = "Eski"; }
            if (kuru) continue;
            try {
              if (k.siparis_id) { const r = await rest("rpc/platform_siparis_senkron", { method: "POST", body: JSON.stringify({ p_id: k.id }) }); if (r && Object.keys(r).length) guncellenen++; }
              else if (durum === "Bekliyor" || durum === "Eşleşmedi" || durum === "Eski") { const r = await rest("rpc/platform_siparis_aktar", { method: "POST", body: JSON.stringify({ p_id: k.id }) }); if (r?.id) { if (r.elle) baglanan++; else aktarilan++; } else if (r?.eslesmedi) eslesmedi++; }
            } catch (err) {
              const msg = String((err as Error).message || err).slice(0, 300); hatalar.push(`${k.siparis_no}: ${msg}`);
              await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: k.siparis_id ? durum : "Hata", hata: msg }) }).catch(() => {});
            }
          }
        }
        const durumMetni = `Siparişler: ${liste.length} çekildi · ${yeni} yeni · ${aktarilan} aktarıldı${baglanan ? ` · ${baglanan} elle girilmiş siparişe bağlandı` : ""}${eslesmedi ? ` · ${eslesmedi} ürün eşleşmedi` : ""}${hatalar.length ? ` · ${hatalar.length} hata` : ""}`;
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: durumMetni, hatalar: hatalar.slice(0, 5) } } }) });
        sonuc[e.platform] = { cekilen: liste.length, yeni, aktarilan, baglanan, guncellenen, eslesmedi, hatalar: hatalar.slice(0, 5) };
      } catch (err) {
        const m = String((err as Error).message || err).slice(0, 400);
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: `Sipariş hatası: ${m}` } } }) }).catch(() => {});
        sonuc[e.platform] = { hata: m };
      }
    }
    return json({ sonuc });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
