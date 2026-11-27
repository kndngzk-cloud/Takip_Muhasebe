// Belirli bir gunun TCMB doviz satis kuru (gelir / gider odemeleri icin).
//  POST { tarih: "YYYY-MM-DD", pb: "USD" | "EUR" | "GBP" } -> { kur, kaynak_tarih }
// TCMB arsivi: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml — hafta sonu / tatilde dosya yok, onceki is gunu alinir.
// Bugun ya da ileri tarih icin, bugunun kuru henuz yayinlanmadiysa onceki is gununun kuru doner.
// Sonuclar tcmb_kurlar tablosunda saklanir. Giris yapmis kullanici gerekir.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const gun = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function tcmbGun(t: string): Promise<Record<string, number> | null> {
  const [y, m, d] = t.split("-");
  const r = await fetch(`https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`);
  if (!r.ok) return null;
  const xml = await r.text();
  const out: Record<string, number> = {};
  for (const pb of ["USD", "EUR", "GBP"]) {
    const blok = new RegExp(`<Currency[^>]*CurrencyCode="${pb}"[\\s\\S]*?</Currency>`).exec(xml)?.[0] || "";
    const v = Number(/<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(blok)?.[1]);
    if (v > 0) out[pb] = v;
  }
  return out.USD ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    let izin = false;
    if (typeof b.token === "string" && b.token) { const [t] = await (await fetch(`${URL_}/rest/v1/sistem_ayar?select=deger&anahtar=eq.yedek_token`, { headers: H })).json(); izin = !!t && t.deger === b.token; }
    if (!izin) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const u = jwt ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }) : null;
      if (!u || !u.ok) return json({ hata: "Yetkisiz" }, 401);
    }
    const pb = String(b.pb || "").toUpperCase();
    if (!["USD", "EUR", "GBP"].includes(pb)) return json({ hata: "Para birimi USD, EUR ya da GBP olmalı" }, 400);
    const bugun = gun(new Date());
    let tarih = /^\d{4}-\d{2}-\d{2}$/.test(String(b.tarih)) ? String(b.tarih) : bugun;
    if (tarih > bugun) tarih = bugun;
    const [c] = await (await fetch(`${URL_}/rest/v1/tcmb_kurlar?select=kur,kaynak_tarih&tarih=eq.${tarih}&pb=eq.${pb}`, { headers: H })).json();
    // bugunun kaydi saklanmaz (gun icinde yeni kur yayinlanabilir); gecmis gunler kalici
    if (c && tarih < bugun) return json({ kur: Number(c.kur), kaynak_tarih: c.kaynak_tarih });
    let d = new Date(`${tarih}T12:00:00Z`);
    for (let i = 0; i < 12; i++) {
      const t = d.toISOString().slice(0, 10);
      const k = await tcmbGun(t);
      if (k) {
        if (tarih < bugun) await fetch(`${URL_}/rest/v1/tcmb_kurlar?on_conflict=tarih,pb`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(Object.entries(k).map(([p, v]) => ({ tarih, pb: p, kur: v, kaynak_tarih: t }))) });
        return json({ kur: k[pb], kaynak_tarih: t });
      }
      d = new Date(d.getTime() - 86400000);
    }
    return json({ hata: "TCMB kuru bulunamadı" }, 502);
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
