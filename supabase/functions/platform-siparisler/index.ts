// Pazaryeri siparislerini ceker (Koctas / Hepsiburada / Trendyol / N11), platform_siparisler'e yazar ve programa aktarir.
// 2 dakikada bir pg_cron ile ya da uygulamadan (yonetici) tetiklenir.
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
const TESHIS: Record<string, unknown> = {};
type Iade = { no: string; durum: string | null; tarih: string | null; adet: number | null; iade_no: string | null; neden: string | null };
const IADE: Record<string, Iade[]> = {};
const IADE_ALT = "2026-08-01";
const TALEP_AD: Record<string, string> = { MissingPart: "Eksik parça", RenewProduct: "Yenisiyle değişim", Warranty: "Garanti", WrongProduct: "Yanlış ürün", DamagedProduct: "Hasarlı ürün" };
const iadeDurum = (s: string) => /cancel/i.test(s) ? null : /reject|red/i.test(s) ? "Reddedildi" : /accept|approv|complete|finaliz|refund/i.test(s) ? "Kabul edildi" : "İade talebi";
type Satir = { kod: string; ad: string; miktar: number; tutar: number };
type Sip = { platform: string; siparis_no: string; platform_durum?: string; tarih?: string | null; musteri?: string | null; alici?: string | null; telefon?: string | null; eposta?: string | null; sehir?: string | null; adres?: string | null; vergi_no?: string | null;
  satirlar: Satir[]; brut: number; komisyon?: number | null; kargo_kesinti?: number | null; net?: number | null; kesinti_kesin?: boolean; kargo_firma?: string | null; kargo_takip?: string | null; kargo_link?: string | null; barkod?: string | null;
  sevk_tarihi?: string | null; teslim_tarihi?: string | null; paket_no?: string | null; son_kargo?: string | null; iptal?: boolean; ham?: unknown };

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
        sevk_tarihi: kargoVar ? d10(l0.shipped_date) : null, teslim_tarihi: d10(l0.received_date), son_kargo: iso(o.shipping_deadline),
        iptal: st === "CANCELED" || st === "REFUSED" || o.fully_refunded === true,
        ham: { durum: st, odeme: o.payment_type, kargo: o.shipping_company },
      });
    }
    if ((j.orders ?? []).length < 100) break;
  }
  return out;
}

/* ---------------- Hepsiburada (OMS + muhasebe) ---------------- */
async function hepsiburada(a: Record<string, string>, gunSay: number, bitGun = 0): Promise<Sip[]> {
  if (!a.merchant_id || !a.servis_anahtari || !a.kullanici_adi) throw new Error("Hepsiburada bilgileri eksik");
  const mid = encodeURIComponent(a.merchant_id);
  const hd = { Authorization: "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`), "User-Agent": a.kullanici_adi, Accept: "application/json" };
  const al = async (u: string) => { const r = await hamGet(u, hd); if (r.status < 200 || r.status >= 300) throw new Error(`Hepsiburada ${r.status}: ${r.text.slice(0, 200)} (${u.split("?")[0].split("/").slice(3, 5).join("/")})`); return JSON.parse(r.text || "{}"); };
  const liste = async (u: string) => { const out: Record<string, any>[] = []; for (let off = 0; off < 3000; off += 100) { const j = await al(`${u}${u.includes("?") ? "&" : "?"}offset=${off}&limit=100`); const it = (Array.isArray(j) ? j : j.items ?? j.data ?? []) as Record<string, any>[]; out.push(...it); if (it.length < 100) break; } return out; };
  const fmt = (d: Date) => new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 16).replace("T", " "); // HB tarih filtresi Istanbul saatiyle (UTC+3)
  const bit = new Date(Date.now() - bitGun * 86400000), basT = new Date(Date.now() - gunSay * 86400000);
  const aralik = `begindate=${encodeURIComponent(fmt(basT))}&enddate=${encodeURIComponent(fmt(bit))}`;
  const oms = "https://oms-external.hepsiburada.com";
  const kalemler: Record<string, Record<string, any>[]> = {};
  if (!bitGun) for (const it of await liste(`${oms}/orders/merchantid/${mid}`)) (kalemler[it.orderNumber] ||= []).push(it);
  const sevk: Record<string, { tarih: string | null; barkod: string | null }> = {};
  const teslim: Record<string, string | null> = {};
  const iptal = new Set<string>();
  const notlar: string[] = [];
  // paketlenmis (etiketi basilmis) ama kargoya verilmemis siparisler acik listeden cikar, paket listesinde durur
  const paket: Record<string, string | null> = {};
  const paketNo: Record<string, string> = {};
  const sonTarih: Record<string, string | null> = {};
  const noBul = (p: Record<string, any>) => { const n = [...(p.OrderNumbers ?? p.orderNumbers ?? []), ...((p.items ?? p.Items ?? p.lines ?? p.LineItems ?? []) as Record<string, any>[]).map((i) => i.orderNumber ?? i.OrderNumber)]; if (p.OrderNumber || p.orderNumber) n.push(p.OrderNumber ?? p.orderNumber); return [...new Set(n.filter(Boolean).map(String))]; };
  let paketSay = 0; let paketOrnek: unknown = null;
  if (!bitGun) try { for (const p of await liste(`${oms}/packages/merchantid/${mid}`)) { paketSay++; paketOrnek ||= Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? `[${v.length}] ${JSON.stringify(v[0] ?? null).slice(0, 300)}` : typeof v === "object" ? "{...}" : String(v).slice(0, 4) + "…"])); for (const no of noBul(p)) { if (p.dueDate || p.DueDate) sonTarih[no] = iso(p.dueDate || p.DueDate); paket[no] = p.Barcode || p.barcode || p.PackageNumber || p.packageNumber || null; if (p.packageNumber || p.PackageNumber) paketNo[no] = String(p.packageNumber || p.PackageNumber); } } } catch (e) { notlar.push(String(e)); }
  TESHIS.Hepsiburada = { acik: Object.keys(kalemler).length, paket: paketSay, paket_siparis: Object.keys(paket).length, paket_ornek: paketOrnek, notlar: notlar.slice(0, 3) };
  try { for (const p of await liste(`${oms}/packages/merchantid/${mid}/shipped?${aralik}`)) for (const no of (p.OrderNumbers?.length ? p.OrderNumbers : [p.OrderNumber]).filter(Boolean)) { sevk[no] = { tarih: d10(p.ShippedDate), barkod: p.Barcode || p.PackageNumber || null }; if (p.PackageNumber) paketNo[no] ||= String(p.PackageNumber); } } catch (e) { notlar.push(String(e)); }
  try { for (const p of await liste(`${oms}/packages/merchantid/${mid}/delivered?${aralik}`)) for (const no of (p.OrderNumbers?.length ? p.OrderNumbers : [p.OrderNumber]).filter(Boolean)) { teslim[no] = d10(p.DeliveredDate); sevk[no] ||= { tarih: d10(p.DeliveredDate), barkod: p.Barcode || p.PackageNumber || null }; } } catch (e) { notlar.push(String(e)); }
  try { for (const c of await liste(`${oms}/orders/merchantid/${mid}/cancelled?${aralik}`)) if (c.orderNumber) iptal.add(String(c.orderNumber)); } catch (e) { notlar.push(String(e)); }
  if (!bitGun) {
    const iadeler: Record<string, Iade> = {};
    try {
      for (const c of await liste(`${oms}/claims/merchantid/${mid}`)) {
        const no = String(c.orderNumber ?? ""); const t = d10(c.claimDate);
        if (!no || !t || t < IADE_ALT) continue;
        const tip = String(c.claimType ?? "Return");
        const iadeTipi = /return|undelivered|iade/i.test(tip);
        if (!iadeTipi) { // eksik parca, garanti, yenisiyle degisim: iade degil; sadece satici aksiyonu bekleniyorsa uyar
          if (/awaiting/i.test(String(c.status ?? ""))) iadeler[no] = { no, durum: "Talep bekliyor", tarih: t, adet: null, iade_no: String(c.number ?? ""), neden: [TALEP_AD[tip] || tip, c.explanation].filter(Boolean).join(" · ").slice(0, 300) };
          continue;
        }
        const d = /undelivered/i.test(tip) && /refund|accept/i.test(String(c.status ?? "")) ? "Teslim edilemedi" : iadeDurum(String(c.status ?? ""));
        const o = iadeler[no] ||= { no, durum: d, tarih: t, adet: 0, iade_no: String(c.number ?? ""), neden: [c.explanation, c.Reason].filter(Boolean).join(" · ") || null };
        if (d === "Kabul edildi" || d === "Teslim edilemedi") { o.adet = (o.adet || 0) + (Number(c.quantity) || 1); if (d === "Teslim edilemedi" && o.durum !== "Kabul edildi") o.durum = d; }
        if (d === "İade talebi" && o.durum !== "Kabul edildi") o.durum = d;
        if (d === "Kabul edildi") o.durum = d;
        if (t > (o.tarih || "")) o.tarih = t;
      }
    } catch (e) { notlar.push("iade: " + String(e)); }
    try {
      for (const p of await liste(`${oms}/packages/merchantid/${mid}/undelivered`)) for (const no of (p.OrderNumbers?.length ? p.OrderNumbers : [p.OrderNumber]).filter(Boolean)) {
        const t = d10(p.UndeliveredDate); if (!t || t < IADE_ALT) continue;
        iadeler[no] = { no, durum: "Teslim edilemedi", tarih: t, adet: null, iade_no: p.PackageNumber ? String(p.PackageNumber) : null, neden: p.UndeliveredReason || null };
      }
    } catch (e) { notlar.push("teslim edilemedi: " + String(e)); }
    IADE.Hepsiburada = Object.values(iadeler).map((o) => ({ ...o, adet: o.durum === "Kabul edildi" || o.durum === "Teslim edilemedi" ? o.adet : null }));
  }
  // kargolanmis ama acik listede olmayan siparislerin detayi
  for (const no of [...Object.keys(sevk), ...iptal, ...Object.keys(paket)]) if (!kalemler[no]) { try { const d = await al(`${oms}/orders/merchantid/${mid}/ordernumber/${encodeURIComponent(no)}`); kalemler[no] = d.items ?? []; } catch (e) { notlar.push(String(e)); } }
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
        if (satis > 0 && tr.some((x) => /Commission/.test(x.transactionType))) { kom = r2(-komK); kesin = tr.some((x) => /Shipment|Cargo|Delivery/.test(x.transactionType)); kargo = kesin ? r2(-kargoK) : null; net = kesin ? r2(satis + digerK) : null; }
      }
    } catch { /* muhasebe kaydi yoksa tahmin kalir */ }
    const sv = sevk[no];
    out.push({
      platform: "Hepsiburada", siparis_no: no, platform_durum: iptal.has(no) ? "Cancelled" : teslim[no] ? "Delivered" : sv ? "Shipped" : paket[no] !== undefined ? "Packaged" : String(i0.status || "Open"), tarih: iso(i0.orderDate),
      musteri: i0.customerName && !/@/.test(i0.customerName) ? i0.customerName : sa.name || i0.customerName || null, alici: sa.name || null,
      telefon: sa.phoneNumber || null, eposta: sa.email || null, sehir: sa.city || null, adres: [sa.address, sa.town, sa.city].filter(Boolean).join(" ") || null, vergi_no: inv.taxNumber || null,
      satirlar: its.map((x) => ({ kod: x.merchantSKU || x.merchantSku || x.sku || "", ad: x.name || x.productName || "", miktar: Number(x.quantity) || 1, tutar: para(x.totalPrice) })),
      brut, komisyon: kom, kargo_kesinti: kargo, net, kesinti_kesin: kesin,
      kargo_firma: i0.cargoCompany || i0.cargoCompanyModel?.name || null, kargo_takip: sv?.barkod || paket[no] || i0.barcode || i0.packageNumber || null,
      kargo_link: sv?.barkod ? `https://www.hepsijet.com/gonderi-takibi/${sv.barkod}` : null, barkod: sv?.barkod || paket[no] || i0.barcode || null,
      sevk_tarihi: sv?.tarih ?? null, teslim_tarihi: teslim[no] ?? null, paket_no: paketNo[no] ?? i0.packageNumber ?? null, son_kargo: sonTarih[no] ?? iso(i0.dueDate ?? i0.DueDate ?? i0.lastShippingDate), iptal: iptal.has(no),
      ham: { durum: i0.status, notlar: notlar.slice(0, 3) },
    });
  }
  if (!out.length && notlar.length) throw new Error(notlar[0]);
  return out;
}

/* ---------------- Trendyol (siparis paketleri + hakedis) ---------------- */
async function trendyol(a: Record<string, string>, gunSay: number, bitGun = 0): Promise<Sip[]> {
  if (!a.seller_id || !a.api_key || !a.api_secret) throw new Error("Trendyol bilgileri eksik");
  const hd = { Authorization: "Basic " + btoa(`${a.api_key}:${a.api_secret}`), "User-Agent": `${a.seller_id} - SelfIntegration`, storeFrontCode: "TR" };
  const al = async (u: string) => { const r = await fetch(u, { headers: hd }); const t = await r.text(); if (!r.ok) throw new Error(`Trendyol ${r.status}: ${t.slice(0, 200)}`); return JSON.parse(t); };
  const paketler: Record<string, any>[] = [];
  const bit = Date.now() - bitGun * 86400000, bas = Date.now() - gunSay * 86400000;
  for (let pe = bit; pe > bas; pe -= 14 * 86400000) {
    const ps = Math.max(bas, pe - 14 * 86400000);
    for (let page = 0; page < 50; page++) {
      const j = await al(`https://apigw.trendyol.com/integration/order/sellers/${a.seller_id}/orders?startDate=${ps}&endDate=${pe}&orderByField=PackageLastModifiedDate&orderByDirection=DESC&size=200&page=${page}`);
      paketler.push(...(j.content ?? [])); if (page + 1 >= (j.totalPages ?? 1)) break;
    }
  }
  // komisyon: hakedis kayitlarindan (siparis no ile)
  const kom: Record<string, { kom: number; gelir: number }> = {};
  try {
    for (let i = 0; i < Math.ceil((bit - bas) / (15 * 86400000)) + 2; i++) {
      const e = Math.min(Date.now(), bit + 30 * 86400000) - i * 15 * 86400000, s = e - 15 * 86400000 + 1000;
      const j = await al(`https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/settlements?startDate=${s}&endDate=${e}&transactionType=Sale&page=0&size=1000`);
      for (const c of j.content ?? []) { const o = kom[c.orderNumber] ||= { kom: 0, gelir: 0 }; o.kom += Math.abs(sayi(c.commissionAmount) || 0); o.gelir += sayi(c.sellerRevenue) || 0; }
    }
  } catch { /* hakedis yoksa tahminsiz */ }
  // kargo: kargo faturasi kalemlerinden (siparis no ile)
  const kargoTy: Record<string, number> = {};
  const ty = { fatura: 0, kalem: 0, tipler: [] as string[], hata: null as string | null };
  try {
    const goruldu = new Set<string>();
    for (let e = Date.now(); e > bas - 15 * 86400000; e -= 15 * 86400000) {
      const st = e - 15 * 86400000 + 1000;
      const j = await al(`https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/otherfinancials?startDate=${st}&endDate=${e}&transactionType=DeductionInvoices&page=0&size=500`);
      for (const c of (j.content ?? []) as Record<string, any>[]) {
        const tip = `${c.transactionType ?? ""} ${c.description ?? ""}`;
        if (ty.tipler.length < 6 && !ty.tipler.includes(String(c.transactionType))) ty.tipler.push(String(c.transactionType));
        if (!/kargo|cargo/i.test(tip)) continue;
        const seri = String(c.id ?? c.invoiceSerialNumber ?? "");
        if (!seri || goruldu.has(seri)) continue; goruldu.add(seri); ty.fatura++;
        for (let pg = 0; pg < 20; pg++) {
          const it = await al(`https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/cargo-invoice/${encodeURIComponent(seri)}/items?page=${pg}&size=500`);
          for (const x of (it.content ?? []) as Record<string, any>[]) { if (!x.orderNumber) continue; ty.kalem++; kargoTy[String(x.orderNumber)] = r2((kargoTy[String(x.orderNumber)] || 0) + Math.abs(sayi(x.amount) || 0)); }
          if (pg + 1 >= (it.totalPages ?? 1)) break;
        }
      }
    }
  } catch (err) { ty.hata = String((err as Error).message || err).slice(0, 200); }
  TESHIS.Trendyol = ty;
  // iadeler
  try {
    const iadeler: Record<string, Iade> = {};
    for (let e = Date.now(), i = 0; i < Math.max(2, Math.ceil(gunSay / 14)); i++, e -= 14 * 86400000) {
      const j = await al(`https://apigw.trendyol.com/integration/order/sellers/${a.seller_id}/claims?startDate=${e - 14 * 86400000}&endDate=${e}&size=200&page=0`);
      for (const c of (j.content ?? []) as Record<string, any>[]) {
        const no = String(c.orderNumber ?? ""); const t = d10(c.claimDate); if (!no || !t || t < IADE_ALT) continue;
        const kalem = ((c.items ?? []) as Record<string, any>[]).flatMap((x) => (x.claimItems ?? []) as Record<string, any>[]);
        const dur = kalem.map((k) => iadeDurum(String(k.claimItemStatus?.name ?? k.claimItemStatus ?? "")));
        const kabul = dur.filter((d) => d === "Kabul edildi").length;
        const durum = kabul ? "Kabul edildi" : dur.includes("İade talebi") ? "İade talebi" : dur.includes("Reddedildi") ? "Reddedildi" : dur.length ? null : "İade talebi";
        iadeler[no] = { no, durum, tarih: t, adet: kabul || null, iade_no: String(c.id ?? ""), neden: kalem.map((k) => k.customerClaimItemReason?.name).filter(Boolean)[0] ?? null };
      }
    }
    IADE.Trendyol = Object.values(iadeler);
  } catch (err) { ty.hata = (ty.hata ? ty.hata + " · " : "") + "iade: " + String((err as Error).message || err).slice(0, 150); }
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
      brut, komisyon: k ? r2(k.kom) : (komTah > 0 ? komTah : null), kargo_kesinti: kargoTy[no] ?? null, net: k && kargoTy[no] != null ? r2(k.gelir - kargoTy[no]) : null, kesinti_kesin: !!k && kargoTy[no] != null,
      kargo_firma: p0.cargoProviderName || null, kargo_takip: p0.cargoTrackingNumber ? String(p0.cargoTrackingNumber) : null, kargo_link: p0.cargoTrackingLink || null, barkod: p0.cargoTrackingNumber ? String(p0.cargoTrackingNumber) : null,
      sevk_tarihi: sevkT, teslim_tarihi: aktif.some((p) => p.status === "Delivered") ? d10(p0.lastModifiedDate) : null,
      paket_no: p0.id != null ? String(p0.id) : null, son_kargo: iso(p0.agreedDeliveryDate), iptal: !aktif.length, ham: { durum: ps.map((p) => p.status) },
    });
  }
  return out;
}

/* ---------------- N11 (REST shipmentPackages) ---------------- */
async function n11(a: Record<string, string>, gunSay: number, bitGun = 0): Promise<Sip[]> {
  if (!a.api_key || !a.api_secret) throw new Error("N11 bilgileri eksik");
  const hd = { appkey: a.api_key, appsecret: a.api_secret, Accept: "application/json" };
  const al = async (u: string) => { const r = await fetch(u, { headers: hd }); const t = await r.text(); if (!r.ok) throw new Error(`N11 ${r.status}: ${t.slice(0, 200)}`); return JSON.parse(t); };
  // N11 en fazla 15 gunluk aralik veriyor; durum degisikliklerini yakalamak icin en az 14 gun geriye bakilir
  const paketler: Record<string, any>[] = [];
  const bit = Date.now() - bitGun * 86400000, bas = Date.now() - Math.max(gunSay, 14) * 86400000;
  for (let pe = bit; pe > bas; pe -= 14 * 86400000) {
    const ps = Math.max(bas, pe - 14 * 86400000);
    for (let page = 0; page < 50; page++) {
      const j = await al(`https://api.n11.com/rest/delivery/v1/shipmentPackages?startDate=${ps}&endDate=${pe}&page=${page}&size=100&sender=ALL`);
      paketler.push(...(j.content ?? [])); if (page + 1 >= (j.totalPages ?? 1)) break;
    }
  }
  const IPTAL = /cancel|unsupplied|iptal/i;
  const iadeler: Iade[] = [];
  const grup: Record<string, Record<string, any>[]> = {};
  for (const p of paketler) (grup[p.orderNumber] ||= []).push(p);
  const out: Sip[] = [];
  for (const [no, ps] of Object.entries(grup)) {
    const aktif = ps.filter((p) => !IPTAL.test(String(p.shipmentPackageStatus)));
    const p0 = aktif[0] || ps[0]; const sa = p0.shippingAddress || {};
    const lines = aktif.flatMap((p) => (p.lines ?? []).filter((l: any) => !IPTAL.test(String(l.orderItemLineItemStatusName))));
    // satis: saticinin fatura tutari (n11'in karsiladigi indirim haric); kesinti: komisyon + pazarlama + pazaryeri hizmet bedeli, KDV'li
    const tutar = (l: any) => sayi(l.sellerInvoiceAmount) || (sayi(l.sellerDiscountedPrice) || sayi(l.price) || 0) * (Number(l.quantity) || 1);
    const brut = r2(lines.reduce((t: number, l: any) => t + tutar(l), 0));
    const kom = r2(lines.reduce((t: number, l: any) => t + tutar(l) * ((sayi(l.commissionRate) || 0) - (sayi(l.sellerCampaignCommissionRate) || 0) + (sayi(l.netMarketingFeeRate) || 0) + (sayi(l.netMarketplaceFeeRate) || 0)) / 100, 0) * 1.2);
    const tarihce = (s: string) => ps.flatMap((p) => p.packageHistories ?? []).find((h: any) => h.status === s)?.createdDate;
    const kargolu = aktif.find((p) => /shipped|delivered|undelivered/i.test(String(p.shipmentPackageStatus)));
    const teslim = aktif.find((p) => /^delivered$/i.test(String(p.shipmentPackageStatus)));
    const olusma = tarihce("Created") ?? p0.lastModifiedDate;
    if (aktif.some((p) => p.isReturned) && (d10(olusma) || "") >= IADE_ALT) iadeler.push({ no: String(no), durum: "İade talebi", tarih: d10(p0.lastModifiedDate), adet: null, iade_no: null, neden: null });
    out.push({
      platform: "N11", siparis_no: String(no), platform_durum: String(p0.shipmentPackageStatus ?? ""), tarih: iso(olusma),
      musteri: p0.customerfullName || sa.fullName || null, alici: sa.fullName || null,
      telefon: sa.gsm || null, eposta: p0.customerEmail || null, sehir: sa.city || null, adres: [sa.address, sa.neighborhood, sa.district, sa.city].filter(Boolean).join(" ") || null, vergi_no: p0.taxId || null,
      satirlar: lines.map((l: any) => ({ kod: l.stockCode || l.barcode || String(l.productId ?? ""), ad: String(l.productName || "").trim(), miktar: Number(l.quantity) || 1, tutar: r2(tutar(l)) })),
      brut, komisyon: kom > 0 ? kom : null, kargo_kesinti: null, net: null, kesinti_kesin: false,
      kargo_firma: p0.cargoProviderName || null, kargo_takip: p0.cargoSenderNumber ? String(p0.cargoSenderNumber) : null, kargo_link: p0.cargoTrackingLink || null, barkod: p0.cargoSenderNumber ? String(p0.cargoSenderNumber) : null,
      sevk_tarihi: kargolu ? d10(tarihce("Shipped") ?? kargolu.lastModifiedDate) : null, teslim_tarihi: teslim ? d10(tarihce("Delivered") ?? teslim.lastModifiedDate) : null,
      paket_no: p0.id != null ? String(p0.id) : null, son_kargo: iso(p0.agreedDeliveryDate), iptal: !aktif.length, ham: { durum: ps.map((p) => p.shipmentPackageStatus) },
    });
  }
  IADE.N11 = iadeler;
  TESHIS.N11 = { paket: paketler.length, siparis: out.length };
  return out;
}

const PLATFORM: Record<string, (a: Record<string, string>, g: number, b?: number) => Promise<Sip[]>> = { "Koçtaş": koctas, Hepsiburada: hepsiburada, Trendyol: trendyol, N11: n11 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const [ba] = await rest("sistem_ayar?select=deger&anahtar=eq.siparis_aktarim_baslangic");
    const baslangic = String(ba?.deger || "2100-01-01");
    const kuru = body.kuru === true; // sadece cek, aktarma
    const sadece = typeof body.platform === "string" ? body.platform : null;
    const ent = await rest(`entegrasyonlar?select=platform,ayar,son_yanit&platform=in.(${encodeURIComponent('"Koçtaş","Hepsiburada","Trendyol","N11"')})`);
    const sonuc: Record<string, unknown> = {};
    const olaylar: { baslik: string; metin: string; url: string; etiket: string }[] = [];
    const ozet = (s: Sip) => `${s.alici || s.musteri || ""} · ${s.satirlar.map((x) => `${x.miktar > 1 ? x.miktar + " × " : ""}${x.kod || x.ad}`).join(", ")} · ${s.brut.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;
    for (const e of ent) {
      if (sadece && e.platform !== sadece) continue;
      const a = e.ayar || {};
      if (!Object.keys(a).length) continue;
      try {
        const gunSay = typeof body.gun === "number" ? body.gun : 3;
        const liste = await PLATFORM[e.platform](a, gunSay, typeof body.bitis_gun === "number" ? body.bitis_gun : 0);
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
              else if (durum === "Bekliyor" || durum === "Eşleşmedi" || durum === "Eski") { const r = await rest("rpc/platform_siparis_aktar", { method: "POST", body: JSON.stringify({ p_id: k.id }) }); if (r?.id) { if (r.elle) baglanan++; else { aktarilan++; if (!eski) olaylar.push({ baslik: `Yeni ${e.platform} siparişi`, metin: ozet(s), url: `#/siparis/${r.id}`, etiket: `s-${e.platform}-${k.siparis_no}` }); } } else if (r?.eslesmedi) { eslesmedi++; if (!eski || eski.durum !== "Eşleşmedi") olaylar.push({ baslik: `${e.platform} siparişi: ürün seçin`, metin: `${ozet(s)} — bu ürün programdaki hiçbir ürünle eşleşmedi`, url: "#/platform-siparisler", etiket: `e-${e.platform}-${k.siparis_no}` }); } }
            } catch (err) {
              const msg = String((err as Error).message || err).slice(0, 300); hatalar.push(`${k.siparis_no}: ${msg}`);
              await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: k.siparis_id ? durum : "Hata", hata: msg }) }).catch(() => {});
            }
          }
        }
        let iadeSay = 0;
        if (!kuru && IADE[e.platform]) {
          const plq = `platform=eq.${encodeURIComponent(e.platform)}`;
          for (const i of IADE[e.platform]) {
            if (!i.durum) continue;
            try {
              const once = await rest(`platform_siparisler?${plq}&siparis_no=eq.${encodeURIComponent(i.no)}&select=id,iade_durum`);
              if (!once?.length) continue; // siparis sistemde yok (aktarim baslangicindan once)
              await rest(`platform_siparisler?${plq}&siparis_no=eq.${encodeURIComponent(i.no)}`, { method: "PATCH", body: JSON.stringify({ iade_durum: i.durum, iade_tarihi: i.tarih, iade_adet: i.adet, iade_no: i.iade_no, iade_neden: i.neden }) });
              if (i.durum === "Talep bekliyor" && once[0].iade_durum !== "Talep bekliyor") olaylar.push({ baslik: `${e.platform}: sizden işlem bekleyen talep`, metin: `Sipariş ${i.no} · ${i.neden || ""}`.slice(0, 300), url: "#/platform-siparisler", etiket: `t-${i.no}` });
              if (i.durum === "İade talebi" && once[0].iade_durum !== "İade talebi") olaylar.push({ baslik: `${e.platform}: yeni iade talebi`, metin: `Sipariş ${i.no}${i.neden ? " · " + i.neden : ""}`.slice(0, 300), url: "#/platform-siparisler", etiket: `it-${i.no}` });
              for (const x of once as Record<string, any>[]) { const r = await rest("rpc/platform_iade_isle", { method: "POST", body: JSON.stringify({ p_id: x.id }) }); if (r && (r.iptal || r.kismi)) { iadeSay++; olaylar.push({ baslik: `${e.platform} iadesi: ${i.durum}`, metin: `Sipariş ${i.no}${r.kismi ? " · kısmi iade, siparişi elle düzenleyin" : " · sipariş iptal edildi, stok geri alındı"}${i.neden ? " · " + i.neden : ""}`, url: "#/platform-siparisler", etiket: `i-${i.no}` }); } }
            } catch (err) { hatalar.push(`iade ${i.no}: ${String((err as Error).message || err).slice(0, 150)}`); }
          }
          // cozulen talepler (artik aksiyon beklemiyor) isaretten kaldirilir
          const bekleyen = IADE[e.platform].filter((i) => i.durum === "Talep bekliyor" || i.durum === "İade talebi").map((i) => `"${i.no}"`);
          await rest(`platform_siparisler?${plq}&iade_durum=in.(${encodeURIComponent('"Talep bekliyor","İade talebi"')})${bekleyen.length ? `&siparis_no=not.in.(${encodeURIComponent(bekleyen.join(","))})` : ""}`, { method: "PATCH", body: JSON.stringify({ iade_durum: null }) }).catch(() => {});
        }
        const durumMetni = `Siparişler: ${liste.length} çekildi${iadeSay ? ` · ${iadeSay} iade işlendi` : ""} · ${yeni} yeni · ${aktarilan} aktarıldı${baglanan ? ` · ${baglanan} elle girilmiş siparişe bağlandı` : ""}${eslesmedi ? ` · ${eslesmedi} ürün eşleşmedi` : ""}${hatalar.length ? ` · ${hatalar.length} hata` : ""}`;
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: durumMetni, hatalar: hatalar.slice(0, 5), teshis: TESHIS[e.platform] ?? null } } }) });
        sonuc[e.platform] = { teshis: TESHIS[e.platform], iade: (IADE[e.platform] ?? []).length, cekilen: liste.length, yeni, aktarilan, baglanan, guncellenen, eslesmedi, hatalar: hatalar.slice(0, 5) };
      } catch (err) {
        const m = String((err as Error).message || err).slice(0, 400);
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: `Sipariş hatası: ${m}` } } }) }).catch(() => {});
        sonuc[e.platform] = { hata: m };
      }
    }
    if (olaylar.length && !kuru) {
      const tek = olaylar.length === 1;
      await fetch(`${URL_}/functions/v1/bildirim`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(tek ? olaylar[0] : { baslik: `${olaylar.length} yeni platform bildirimi`, metin: olaylar.map((o) => `${o.baslik}: ${o.metin}`).join("\n").slice(0, 380), url: "#/platform-siparisler" }) }).catch(() => {});
    }
    return json({ sonuc, bildirim: olaylar.length });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
