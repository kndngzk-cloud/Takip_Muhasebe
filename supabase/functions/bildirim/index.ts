// Telefona / bilgisayara anlik bildirim (Web Push). Sunucu ici cagri (servis anahtari / yedek_token) ya da giris yapmis kullanici (yalniz kendine test).
// body.konu: bildirim turu. Her cihaz push_abonelik.konular ile hangi turleri alacagini secer (bos = VARSAYILAN).
// body.yapan: islemi yapan kullanici; o kullanicinin cihazlarina, "kendi" secili degilse gonderilmez.
import webpush from "npm:web-push@3.6.7";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const VARSAYILAN = ["b2b_siparis", "platform_siparis", "platform_iade", "musteri_sorusu", "kart", "tahsilat", "cek", "platform_odeme", "vade", "ev_harcama", "ev_ihtiyac"];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
async function rest(p: string, init: RequestInit = {}) { const r = await fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let kullanici: string | null = null;
    if (jwt !== KEY) {
      const [t] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
      if (!(typeof body.token === "string" && body.token && body.token === t?.deger)) {
        const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
        if (!u.ok) return json({ hata: "Yetkisiz" }, 401);
        kullanici = (await u.json())?.id; if (!kullanici) return json({ hata: "Yetkisiz" }, 401);
      }
    }
    const ayar = await rest("sistem_ayar?select=anahtar,deger&anahtar=in.(vapid_public,vapid_private)");
    const v = Object.fromEntries(ayar.map((x: Record<string, string>) => [x.anahtar, x.deger]));
    webpush.setVapidDetails("https://takip-muhasebe.netlify.app", v.vapid_public, v.vapid_private);
    const tum = await rest(`push_abonelik?select=*${kullanici ? `&kullanici_id=eq.${kullanici}` : ""}`);
    // konu gelmediyse (eski cagrilar) etiketten cikar: platform siparis / iade / musteri sorusu
    const et = String(body.etiket || "");
    const konu = String(body.konu || (/^(i|it|t)-/.test(et) ? "platform_iade" : et.startsWith("soru") ? "musteri_sorusu" : "platform_siparis"));
    const yapan = typeof body.yapan === "string" ? body.yapan : null;
    const abone = kullanici ? tum : tum.filter((a: Record<string, any>) => {
      const k: string[] = Array.isArray(a.konular) ? a.konular : VARSAYILAN;
      return k.includes(konu) && !(yapan && a.kullanici_id === yapan && !k.includes("kendi"));
    });
    const yuk = JSON.stringify({ baslik: String(body.baslik || "Sipariş • Stok • Cari").slice(0, 120), metin: String(body.metin || "").slice(0, 400), url: String(body.url || "#/"), etiket: body.etiket ? String(body.etiket) : undefined });
    let gonderilen = 0; const silinen: number[] = []; const hatalar: string[] = [];
    await Promise.all(abone.map(async (a: Record<string, any>) => {
      try { await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, yuk, { TTL: 86400, urgency: "high" }); gonderilen++; }
      catch (e) { const sc = (e as { statusCode?: number }).statusCode; if (sc === 404 || sc === 410) silinen.push(a.id); else hatalar.push(`${sc ?? ""} ${String((e as Error).message).slice(0, 120)}`); }
    }));
    if (silinen.length) await rest(`push_abonelik?id=in.(${silinen.join(",")})`, { method: "DELETE" });
    return json({ konu, abone: abone.length, gonderilen, silinen: silinen.length, hatalar });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
