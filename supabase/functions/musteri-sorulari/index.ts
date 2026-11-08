// Pazaryeri musteri sorulari: Trendyol, Hepsiburada (Saticiya Sor), N11 (urun soru-cevap) ve Koctas (Mirakl mesajlari).
// mod "cek": sorulari ceker, platform_sorular tablosuna yazar (pg_cron ya da uygulama).
// mod "cevapla": { id, metin } ile cevabi platforma gonderir.
// Yetki: yedek_token (cron) ya da yonetici kullanici. API anahtarlari entegrasyonlar tablosundan okunur, cevapta yer almaz.
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
async function yetkili(req: Request, body: Record<string, unknown>): Promise<string | null> {
  if (typeof body.token === "string" && body.token) { const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token"); if (r && r.deger === body.token) return "cron"; }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!jwt) return null;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }); if (!u.ok) return null;
  const user = await u.json(); if (!user?.id) return null;
  const [p] = await rest(`profiller?select=rol&id=eq.${user.id}`); return p?.rol === "admin" ? (user.email || "yönetici") : null;
}
const iso = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}/.test(v)) { const [d, m, y] = v.slice(0, 10).split("/"); return new Date(`${y}-${m}-${d}T${v.slice(11) || "12:00:00"}+03:00`).toISOString(); } const d = typeof v === "number" ? new Date(v) : new Date(String(v)); return isNaN(+d) ? null : d.toISOString(); };

/* Hepsiburada User-Agent'i birebir istiyor; fetch kendi ekini koydugu icin istek TLS uzerinden elle yazilir */
async function ham(method: string, u: string, headers: Record<string, string>, govde?: Uint8Array): Promise<{ status: number; text: string }> {
  const url = new URL(u);
  const conn = await Deno.connectTls({ hostname: url.hostname, port: 443 });
  try {
    const bas = [`${method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.hostname}`, "Connection: close", ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
    if (govde) bas.push(`Content-Length: ${govde.length}`);
    const b0 = new TextEncoder().encode(bas.join("\r\n") + "\r\n\r\n");
    const tum0 = new Uint8Array(b0.length + (govde?.length || 0)); tum0.set(b0); if (govde) tum0.set(govde, b0.length);
    let yaz = 0; while (yaz < tum0.length) yaz += await conn.write(tum0.subarray(yaz));
    const parts: Uint8Array[] = []; let top = 0; const buf = new Uint8Array(65536);
    while (true) { const n = await conn.read(buf).catch(() => null); if (!n) break; parts.push(buf.slice(0, n)); top += n; }
    const tum = new Uint8Array(top); let o = 0; for (const p of parts) { tum.set(p, o); o += p.length; }
    let ayir = -1; for (let i = 0; i < tum.length - 3; i++) if (tum[i] === 13 && tum[i + 1] === 10 && tum[i + 2] === 13 && tum[i + 3] === 10) { ayir = i; break; }
    const bh = new TextDecoder().decode(tum.slice(0, ayir < 0 ? tum.length : ayir));
    let g = ayir < 0 ? new Uint8Array() : tum.slice(ayir + 4);
    if (/transfer-encoding:\s*chunked/i.test(bh)) {
      const out: Uint8Array[] = []; let i = 0, n = 0;
      while (i < g.length) {
        let j = i; while (j < g.length - 1 && !(g[j] === 13 && g[j + 1] === 10)) j++;
        const boy = parseInt(new TextDecoder().decode(g.slice(i, j)).split(";")[0].trim(), 16);
        if (!boy) break; out.push(g.slice(j + 2, j + 2 + boy)); n += boy; i = j + 2 + boy + 2;
      }
      const b = new Uint8Array(n); let k = 0; for (const p of out) { b.set(p, k); k += p.length; } g = b;
    }
    return { status: Number(/^HTTP\/1\.[01] (\d+)/.exec(bh)?.[1] || 0), text: new TextDecoder().decode(g) };
  } finally { try { conn.close(); } catch { /* */ } }
}
function multipart(alanlar: Record<string, string>) {
  const sinir = "----gradde" + crypto.randomUUID().replace(/-/g, "");
  const parca = Object.entries(alanlar).map(([k, v]) => `--${sinir}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join("") + `--${sinir}--\r\n`;
  return { tip: `multipart/form-data; boundary=${sinir}`, govde: new TextEncoder().encode(parca) };
}
const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
const xmlDeger = (x: string, ad: string) => { const m = new RegExp(`<(?:\\w+:)?${ad}>([\\s\\S]*?)</(?:\\w+:)?${ad}>`).exec(x); return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim() : null; };
async function n11Soap(a: Record<string, string>, islem: string, ic: string) {
  const env = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body><sch:${islem}Request><auth><appKey>${xmlEsc(a.api_key)}</appKey><appSecret>${xmlEsc(a.api_secret)}</appSecret></auth>${ic}</sch:${islem}Request></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch("https://api.n11.com/ws/productService/", { method: "POST", headers: { "Content-Type": "text/xml;charset=UTF-8" }, body: env });
  const t = await r.text();
  const durum = xmlDeger(t, "status");
  if (!r.ok || (durum && durum !== "success")) throw new Error(`N11 ${islem}: ${xmlDeger(t, "errorMessage") || xmlDeger(t, "faultstring") || r.status}`);
  return t;
}

type Soru = { platform: string; soru_id: string; urun?: string | null; urun_kod?: string | null; gorsel?: string | null; link?: string | null; musteri?: string | null; konu?: string | null; soru?: string | null; soru_tarih?: string | null; durum: string; cevap?: string | null; cevap_tarih?: string | null; son_tarih?: string | null; siparis_no?: string | null; mesajlar?: unknown; ham?: unknown };

/* ---------------- Trendyol ---------------- */
const tyHd = (a: Record<string, string>) => ({ Authorization: "Basic " + btoa(`${a.api_key}:${a.api_secret}`), "User-Agent": `${a.seller_id} - SelfIntegration`, storeFrontCode: "TR", Accept: "application/json" });
const TY_DURUM: Record<string, string> = { WAITING_FOR_ANSWER: "Bekliyor", ANSWERED: "Cevaplandı", REJECTED: "Reddedildi", REPORTED: "Bildirildi", WAITING_FOR_APPROVE: "Onayda", UNANSWERED: "Cevapsız kaldı" };
async function trendyolCek(a: Record<string, string>, gun: number): Promise<Soru[]> {
  const out: Soru[] = [];
  const bit = Date.now();
  const yollar = [`status=WAITING_FOR_ANSWER&page=0&size=200`];
  for (let i = 0; i < Math.ceil(gun / 14); i++) { const e = bit - i * 14 * 86400000; yollar.push(`startDate=${e - 14 * 86400000 + 1000}&endDate=${e}&page=0&size=200`); }
  for (const q of yollar) {
    const r = await fetch(`https://apigw.trendyol.com/integration/qna/sellers/${a.seller_id}/questions/filter?${q}`, { headers: tyHd(a) });
    if (!r.ok) throw new Error(`Trendyol sorular: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const s of j.content ?? []) {
      out.push({ platform: "Trendyol", soru_id: String(s.id), urun: s.productName, urun_kod: s.productMainId || s.barcode || null, gorsel: s.imageUrl, link: s.webUrl, musteri: s.showUserName === false ? null : s.userName, soru: s.text, soru_tarih: iso(s.creationDate),
        durum: TY_DURUM[s.status] || s.status, cevap: s.answer?.text ?? null, cevap_tarih: iso(s.answer?.creationDate), ham: { status: s.status, answeredDateMessage: s.answeredDateMessage, public: s.public, rejectedAnswer: s.rejectedAnswer, rejectedDate: s.rejectedDate, reason: s.reason } });
    }
  }
  return out;
}
async function trendyolCevap(a: Record<string, string>, id: string, metin: string) {
  const r = await fetch(`https://apigw.trendyol.com/integration/qna/sellers/${a.seller_id}/questions/${encodeURIComponent(id)}/answers`, { method: "POST", headers: { ...tyHd(a), "Content-Type": "application/json" }, body: JSON.stringify({ text: metin }) });
  if (!r.ok) throw new Error(`Trendyol: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

/* ---------------- Hepsiburada ---------------- */
const HB = "https://api-asktoseller-merchant.hepsiburada.com/api/v1.0/issues";
const hbHd = (a: Record<string, string>) => ({ Authorization: "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`), "User-Agent": a.kullanici_adi, Accept: "application/json", merchantId: a.merchant_id });
const HB_DURUM = (s: string) => /wait/i.test(s) ? "Bekliyor" : /answer/i.test(s) ? "Cevaplandı" : /reject/i.test(s) ? "Reddedildi" : /report/i.test(s) ? "Bildirildi" : /expire|timeout/i.test(s) ? "Süresi geçti" : s;
async function hbCek(a: Record<string, string>, gun: number): Promise<Soru[]> {
  const out: Soru[] = [];
  const min = new Date(Date.now() - gun * 86400000).toISOString().slice(0, 19);
  for (const q of [`status=WaitingForAnswer&page=0&size=100`, `minCreatedAt=${min}&page=0&size=100`, `minCreatedAt=${min}&page=1&size=100`]) {
    const r = await ham("GET", `${HB}?${q}`, hbHd(a));
    if (r.status === 404 && q.includes("page=1")) break;
    if (r.status < 200 || r.status >= 300) throw new Error(`Hepsiburada sorular: ${r.status} ${r.text.slice(0, 200)}`);
    const j = JSON.parse(r.text || "[]");
    const liste = Array.isArray(j) ? j : j.items ?? j.data ?? j.issues ?? [];
    for (const s of liste) {
      const konus = (s.conversations ?? []) as Record<string, any>[];
      const musteriMsj = konus.filter((c) => !/merchant|seller|satıcı|satici/i.test(String(c.from ?? c.type ?? "")));
      const saticiMsj = konus.filter((c) => /merchant|seller|satıcı|satici/i.test(String(c.from ?? c.type ?? "")));
      const ilk = musteriMsj[0] ?? konus[0];
      const son = saticiMsj[saticiMsj.length - 1];
      out.push({ platform: "Hepsiburada", soru_id: String(s.issueNumber ?? s.number ?? s.id), urun: s.product?.name, urun_kod: s.product?.stockCode || s.product?.sku || null, gorsel: s.product?.imageUrl, link: s.product?.sku ? `https://www.hepsiburada.com/-p-${s.product.sku}` : null,
        konu: s.subject?.description ?? null, soru: ilk?.content ?? s.lastContent ?? null, soru_tarih: iso(s.createdAt), durum: HB_DURUM(String(s.status ?? "")), cevap: son?.content ?? null, cevap_tarih: iso(son?.createdAt), son_tarih: iso(s.expireDate), siparis_no: s.orderNumber || null,
        mesajlar: konus.length > 1 ? konus.map((c) => ({ kim: /merchant|seller|satıcı|satici/i.test(String(c.from ?? c.type ?? "")) ? "Satıcı" : "Müşteri", metin: c.content, tarih: iso(c.createdAt) })) : null, ham: { status: s.status, from: konus.map((c) => c.from ?? c.type) } });
    }
    if (q.startsWith("status=")) continue;
    if (liste.length < 100) break;
  }
  return out;
}
async function hbCevap(a: Record<string, string>, id: string, metin: string) {
  const m = multipart({ Answer: metin });
  const r = await ham("POST", `${HB}/${encodeURIComponent(id)}/answer`, { ...hbHd(a), "Content-Type": m.tip }, m.govde);
  if (r.status < 200 || r.status >= 300) throw new Error(`Hepsiburada: ${r.status} ${r.text.slice(0, 300)}`);
}

/* ---------------- N11 ---------------- */
const tarihTR = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
async function n11Cek(a: Record<string, string>, gun: number, oncekiler: Set<string>): Promise<Soru[]> {
  const out: Soru[] = [];
  // n11 soru listesini dakikada bir kez veriyor: tek istek, tum durumlar
  const t = await n11Soap(a, "GetProductQuestionList", `<productQuestionSearch><startDate>${tarihTR(Date.now() - gun * 86400000)}</startDate><endDate>${tarihTR(Date.now() + 86400000)}</endDate></productQuestionSearch><pagingData><currentPage>0</currentPage><pageSize>100</pageSize></pagingData>`);
  const bloklar = t.match(/<productQuestion>[\s\S]*?<\/productQuestion>/g) ?? [];
  let detay = 0;
  for (const b of bloklar) {
    const id = xmlDeger(b, "id"); if (!id) continue;
    const s: Soru = { platform: "N11", soru_id: id, urun: xmlDeger(b, "productTitle"), urun_kod: xmlDeger(b, "productId"), konu: xmlDeger(b, "questionSubject"), soru: xmlDeger(b, "question"), cevap: xmlDeger(b, "answer") || null, durum: xmlDeger(b, "answer") ? "Cevaplandı" : "Bekliyor", gorsel: (/<image>([^<]+)<\/image>/.exec(b) || [])[1] || null };
    s.link = s.urun_kod ? `https://www.n11.com/arama?q=${encodeURIComponent(s.urun_kod)}` : null;
    // tarih ve musteri adi detay servisinde; sadece yeni ya da bekleyen sorular icin sorulur
    if (detay < 15 && (!oncekiler.has(id) || s.durum === "Bekliyor")) {
      detay++;
      try {
        const d = await n11Soap(a, "GetProductQuestionDetail", `<productQuestionId>${xmlEsc(id)}</productQuestionId>`);
        s.musteri = xmlDeger(d, "fullName"); s.soru_tarih = iso(xmlDeger(d, "questionDate")); s.cevap_tarih = iso(xmlDeger(d, "answeredDate"));
        const st = xmlDeger(d, "status"); if (st && /closed/i.test(st) && s.cevap) s.durum = "Cevaplandı";
      } catch { /* detay olmadan da yazilir */ }
    }
    out.push(s);
  }
  return out;
}
async function n11Cevap(a: Record<string, string>, id: string, metin: string) {
  await n11Soap(a, "SaveProductAnswer", `<productQuestionId>${xmlEsc(id)}</productQuestionId><answer>${xmlEsc(metin)}</answer>`);
}

/* ---------------- Koctas (Mirakl mesajlari) ---------------- */
async function koctasCek(a: Record<string, string>, gun: number): Promise<Soru[]> {
  const out: Soru[] = [];
  let token = "";
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://koctas.mirakl.net/api/inbox/threads?with_messages=true&updated_since=${new Date(Date.now() - gun * 86400000).toISOString()}&limit=50${token ? `&page_token=${encodeURIComponent(token)}` : ""}`, { headers: { Authorization: a.api_key, Accept: "application/json" } });
    if (!r.ok) throw new Error(`Koçtaş mesajlar: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const t of j.data ?? []) {
      const msj = ((t.messages ?? []) as Record<string, any>[]).slice().sort((x, y) => String(x.date_created).localeCompare(String(y.date_created)));
      const kim = (m: Record<string, any>) => /SHOP/.test(m.from?.type ?? "") ? "Satıcı" : /OPERATOR/.test(m.from?.type ?? "") ? "Koçtaş" : "Müşteri";
      const ilk = msj.find((m) => kim(m) !== "Satıcı") ?? msj[0];
      const sonSatici = [...msj].reverse().find((m) => kim(m) === "Satıcı");
      const ent = (t.entities ?? [])[0];
      const bekliyor = !!t.metadata?.shop_reply_needed_since;
      out.push({ platform: "Koçtaş", soru_id: String(t.id), urun: ent ? `${ent.type === "MMP_ORDER" ? "Sipariş" : ent.type === "MMP_OFFER" ? "Ürün" : "Konu"}: ${ent.label ?? ent.id}` : null, siparis_no: ent?.type === "MMP_ORDER" ? String(ent.id) : null,
        musteri: (t.current_participants ?? []).find((p: Record<string, any>) => p.type === "CUSTOMER")?.display_name ?? ilk?.from?.display_name ?? null, konu: t.topic?.value ?? null, soru: ilk?.body ?? null, soru_tarih: iso(t.date_created),
        durum: bekliyor ? "Bekliyor" : sonSatici ? "Cevaplandı" : "Bilgi", cevap: sonSatici?.body ?? null, cevap_tarih: iso(sonSatici?.date_created),
        mesajlar: msj.map((m) => ({ kim: kim(m), ad: m.from?.display_name, metin: m.body, tarih: iso(m.date_created) })), ham: { entities: t.entities, son: t.metadata } });
    }
    token = j.next_page_token; if (!token) break;
  }
  return out;
}
async function koctasCevap(a: Record<string, string>, id: string, metin: string, alici: string) {
  const fd = new FormData();
  fd.append("message_input", new Blob([JSON.stringify({ body: metin, to: [{ type: alici }] })], { type: "application/json" }));
  const r = await fetch(`https://koctas.mirakl.net/api/inbox/threads/${encodeURIComponent(id)}/message`, { method: "POST", headers: { Authorization: a.api_key, Accept: "application/json" }, body: fd });
  if (!r.ok) throw new Error(`Koçtaş: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

const CEK: Record<string, (a: Record<string, string>, gun: number, onceki: Set<string>) => Promise<Soru[]>> = { Trendyol: trendyolCek, Hepsiburada: hbCek, N11: n11Cek, "Koçtaş": koctasCek };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const kim = await yetkili(req, body);
    if (!kim) return json({ hata: "Yetkisiz" }, 401);
    const ent = await rest(`entegrasyonlar?select=platform,ayar,aktif,son_yanit&platform=in.(${encodeURIComponent('"Koçtaş","Hepsiburada","Trendyol","N11"')})`) as Record<string, any>[];
    const ayar = Object.fromEntries(ent.filter((e) => e.ayar && Object.keys(e.ayar).length).map((e) => [e.platform, e.ayar]));

    if (body.mod === "cevapla") {
      const metin = String(body.metin || "").trim();
      if (!metin) return json({ hata: "Cevap boş olamaz." }, 400);
      const [s] = await rest(`platform_sorular?id=eq.${Number(body.id)}&select=*`) as Record<string, any>[];
      if (!s) return json({ hata: "Soru bulunamadı." }, 404);
      const a = ayar[s.platform]; if (!a) return json({ hata: `${s.platform} bağlantısı tanımlı değil.` }, 400);
      if (s.platform === "Trendyol" && metin.length < 10) return json({ hata: "Trendyol en az 10 karakterlik cevap istiyor." }, 400);
      if (metin.length > 2000) return json({ hata: "Cevap en fazla 2000 karakter olabilir." }, 400);
      try {
        if (s.platform === "Trendyol") await trendyolCevap(a, s.soru_id, metin);
        else if (s.platform === "Hepsiburada") await hbCevap(a, s.soru_id, metin);
        else if (s.platform === "N11") await n11Cevap(a, s.soru_id, metin);
        else if (s.platform === "Koçtaş") await koctasCevap(a, s.soru_id, metin, body.alici === "OPERATOR" ? "OPERATOR" : "CUSTOMER");
      } catch (err) { return json({ hata: String((err as Error).message || err) }, 502); }
      const simdi = new Date().toISOString();
      const mesajlar = Array.isArray(s.mesajlar) ? [...s.mesajlar, { kim: "Satıcı", metin, tarih: simdi }] : s.mesajlar;
      await rest(`platform_sorular?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ durum: s.platform === "Trendyol" ? "Onayda" : "Cevaplandı", cevap: metin, cevap_tarih: simdi, cevaplayan: kim, mesajlar, guncelleme: simdi }) });
      return json({ ok: true });
    }

    // mod "cek"
    const gun = Math.min(Math.max(Number(body.gun) || 14, 1), 60);
    const sonuc: Record<string, unknown> = {};
    const yeniBekleyen: Soru[] = [];
    for (const [pl, f] of Object.entries(CEK)) {
      if (!ayar[pl] || (body.platform && body.platform !== pl)) continue;
      try {
        const onceki = await rest(`platform_sorular?platform=eq.${encodeURIComponent(pl)}&select=soru_id,durum,musteri,soru_tarih&soru_tarih=gte.${new Date(Date.now() - 70 * 86400000).toISOString()}`) as Record<string, any>[];
        const om = new Map(onceki.map((o) => [String(o.soru_id), o]));
        const liste0 = await f(ayar[pl], gun, new Set(om.keys()));
        const tekil = new Map<string, Soru>(); for (const s of liste0) tekil.set(s.soru_id, s);
        const liste = [...tekil.values()];
        for (const s of liste) {
          const o = om.get(s.soru_id);
          if (!o && s.durum === "Bekliyor") yeniBekleyen.push(s);
          // N11 detay her seferinde sorulmadigi icin eski musteri/tarih korunur
          if (o) { if (s.musteri == null) delete s.musteri; if (s.soru_tarih == null) delete s.soru_tarih; }
          if (!o && !s.soru_tarih) s.soru_tarih = new Date().toISOString();
        }
        const simdi = new Date().toISOString();
        const gruplar = new Map<string, Record<string, unknown>[]>();
        for (const s of liste) { const r = { ...s, guncelleme: simdi }; const k = Object.keys(r).sort().join(","); if (!gruplar.has(k)) gruplar.set(k, []); gruplar.get(k)!.push(r); }
        for (const rows of gruplar.values()) for (let i = 0; i < rows.length; i += 200) await rest("platform_sorular?on_conflict=platform,soru_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
        sonuc[pl] = { cekilen: liste.length, bekleyen: liste.filter((s) => s.durum === "Bekliyor").length };
      } catch (err) { sonuc[pl] = { hata: String((err as Error).message || err).slice(0, 300) }; }
    }
    for (const e of ent) if (sonuc[e.platform]) await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), sorular: { zaman: new Date().toISOString(), ...(sonuc[e.platform] as Record<string, unknown>) } } }) }).catch(() => {});
    if (yeniBekleyen.length && kim === "cron" && !body.sessiz) {
      const s0 = yeniBekleyen[0];
      await fetch(`${URL_}/functions/v1/bildirim`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(yeniBekleyen.length === 1
        ? { baslik: `${s0.platform}: yeni müşteri sorusu`, metin: `${s0.urun ? s0.urun.slice(0, 60) + " · " : ""}${(s0.soru || "").slice(0, 200)}`, url: "#/sorular", etiket: `soru-${s0.platform}-${s0.soru_id}` }
        : { baslik: `${yeniBekleyen.length} yeni müşteri sorusu`, metin: yeniBekleyen.map((s) => `${s.platform}: ${(s.soru || "").slice(0, 80)}`).join("\n").slice(0, 380), url: "#/sorular", etiket: `soru-${Date.now()}` }) }).catch(() => {});
    }
    return json({ sonuc, yeni: yeniBekleyen.length });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
