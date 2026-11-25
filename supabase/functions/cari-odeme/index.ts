// Musteri odeme linki (PayTR Linkle Odeme API) — herkese acik, kendi dogrulamasini yapar.
//  POST JSON {islem:"bilgi", t}          -> link bilgisi (firma, cari unvan, istenirse bakiye, max taksit)
//  POST JSON {islem:"ode", t, tutar}     -> PayTR'de o tutara tek kullanimlik odeme linki acar, {url} doner
//  POST form (PayTR bildirimi)           -> hash dogrulanir, basariliysa tahsilat cariye duser, "OK" doner
// PayTR magaza bilgileri entegrasyonlar tablosundaki "PayTR" (487386) kaydindan okunur.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const HESAP = "PayTR";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const duz = (t: string, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/plain" } });

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))));
}
async function magaza(): Promise<Record<string, string>> {
  const [e] = await rest(`entegrasyonlar?select=ayar&platform=eq.${encodeURIComponent(HESAP)}`);
  const a = e?.ayar || {};
  if (!a.merchant_id || !a.merchant_key || !a.merchant_salt) throw new Error("PayTR mağaza bilgileri eksik");
  return a;
}
const rastgele = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
// Istanbul saatiyle "YYYY-MM-DD HH:MM:SS"
const istanbul = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
};

async function linkGetir(t: unknown) {
  if (typeof t !== "string" || !/^[a-f0-9]{32,64}$/.test(t)) return null;
  const [l] = await rest(`odeme_linkleri?select=*&token=eq.${t}`);
  return l || null;
}

/* ---------------- PayTR bildirimi ---------------- */
async function bildirim(req: Request) {
  const f = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const a = await magaza();
  const beklenen = await hmac(a.merchant_key, `${f.callback_id ?? ""}${f.merchant_oid ?? ""}${a.merchant_salt}${f.status ?? ""}${f.total_amount ?? ""}`);
  if (!f.hash || beklenen !== f.hash) return duz("PAYTR notification failed: bad hash", 400);
  if (f.status !== "success") return duz("OK");
  const [o] = await rest(`odeme_link_odemeleri?select=id,tutar,durum&callback_id=eq.${encodeURIComponent(f.callback_id)}`);
  if (!o) return duz("OK"); // bu sistemin olusturmadigi link
  if (o.durum === "Ödendi") return duz("OK"); // tekrar gelen bildirim
  const kurus = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) / 100 : NaN);
  const tutar = isNaN(kurus(f.payment_amount)) ? Number(o.tutar) : kurus(f.payment_amount);
  const toplam = isNaN(kurus(f.total_amount)) ? tutar : kurus(f.total_amount);
  const { hash: _h, ...ham } = f;
  await rest("rpc/paytr_link_odendi", {
    method: "POST",
    body: JSON.stringify({ p_callback_id: f.callback_id, p_merchant_oid: f.merchant_oid, p_tutar: tutar, p_toplam: toplam, p_odeme_tipi: f.payment_type || "card", p_ham: { ...ham, kaynak: "Ödeme linki" } }),
  });
  // PayTR tarafindaki linki kapat (tek kullanimlik; hata onemsiz)
  try {
    const [od] = await rest(`odeme_link_odemeleri?select=paytr_link_id&callback_id=eq.${encodeURIComponent(f.callback_id)}`);
    if (od?.paytr_link_id) {
      const tk = await hmac(a.merchant_key, od.paytr_link_id + a.merchant_id + a.merchant_salt);
      await fetch("https://www.paytr.com/odeme/api/link/delete", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ merchant_id: a.merchant_id, id: od.paytr_link_id, paytr_token: tk }) });
    }
  } catch { /* */ }
  return duz("OK");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ hata: "Geçersiz istek" }, 405);
  const ct = req.headers.get("content-type") || "";
  if (/form-urlencoded|multipart\/form-data/i.test(ct)) {
    try { return await bildirim(req); } catch (e) { console.error("bildirim", e); return duz("HATA", 500); } // PayTR OK gelmezse tekrar dener
  }
  try {
    const body = await req.json().catch(() => ({}));
    const l = await linkGetir(body.t);
    if (!l) return json({ hata: "Ödeme linki bulunamadı. Linki size gönderen firmayla iletişime geçin." }, 404);
    if (!l.aktif) return json({ hata: "Bu ödeme linki kapatılmış. Yeni link için firmayla iletişime geçin." }, 410);
    const [c] = await rest(`v_cariler?select=unvan,bakiye_r,bakiye_gr&id=eq.${l.cari_id}`);
    const [ay] = await rest("ayarlar?select=firma_adi&id=eq.1").catch(() => [null]);
    const firma = (ay?.firma_adi || "").trim();

    if (body.islem === "bilgi") {
      const bakiye = l.bakiye_goster ? Number(l.fatura_tipi === "GR" ? c?.bakiye_gr : c?.bakiye_r) || 0 : null;
      return json({ firma, unvan: c?.unvan || "", bakiye, max_taksit: l.max_taksit, aciklama: l.aciklama || "" });
    }

    if (body.islem === "ode") {
      const tutar = Math.round(Number(body.tutar) * 100) / 100;
      if (!isFinite(tutar) || tutar < 1) return json({ hata: "Geçerli bir tutar girin (en az 1 TL)." }, 400);
      if (tutar > 1000000) return json({ hata: "Tek seferde en fazla 1.000.000 TL ödenebilir." }, 400);
      // kotu niyetli cok sayida link acilmasin: link basina saatte 15 deneme
      const son = await rest(`odeme_link_odemeleri?select=id&link_id=eq.${l.id}&olusturma=gte.${new Date(Date.now() - 3600e3).toISOString()}`);
      if (son.length >= 15) return json({ hata: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." }, 429);
      const a = await magaza();
      const callback_id = rastgele();
      const [od] = await rest("odeme_link_odemeleri", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ link_id: l.id, callback_id, tutar }) });
      let name = `${firma || "Cari"} cari hesap ödemesi`.replace(/\s+/g, " ").slice(0, 190);
      if (name.length < 4) name = "Cari hesap ödemesi";
      const price = String(Math.round(tutar * 100)), currency = "TL", max_installment = String(l.max_taksit), link_type = "product", lang = "tr", min_count = "1";
      const paytr_token = await hmac(a.merchant_key, name + price + currency + max_installment + link_type + lang + min_count + a.merchant_salt);
      const r = await fetch("https://www.paytr.com/odeme/api/link/create", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          merchant_id: a.merchant_id, name, price, currency, max_installment, link_type, lang, min_count, max_count: "1",
          expiry_date: istanbul(new Date(Date.now() + 2 * 3600e3)), callback_link: `${URL_}/functions/v1/cari-odeme`, callback_id, debug_on: "0", paytr_token,
        }),
      });
      const t = await r.text();
      let j: Record<string, unknown> = {}; try { j = JSON.parse(t); } catch { /* */ }
      if (j.status !== "success" || !j.link) {
        await rest(`odeme_link_odemeleri?id=eq.${od.id}`, { method: "DELETE" }).catch(() => {});
        console.error("paytr create", t.slice(0, 300));
        return json({ hata: "Ödeme sayfası açılamadı, lütfen tekrar deneyin." }, 502);
      }
      await rest(`odeme_link_odemeleri?id=eq.${od.id}`, { method: "PATCH", body: JSON.stringify({ paytr_link_id: String(j.id), paytr_url: String(j.link) }) });
      return json({ url: j.link });
    }
    return json({ hata: "Geçersiz istek" }, 400);
  } catch (e) {
    console.error(e);
    return json({ hata: "Bir hata oluştu, lütfen tekrar deneyin." }, 500);
  }
});
