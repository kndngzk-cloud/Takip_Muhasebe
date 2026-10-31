// TCMB gunluk kurlarini (doviz satis) alir, ayarlar.doviz_kur'a yazar. Gunde iki kez pg_cron ile.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const [t] = await (await fetch(`${URL_}/rest/v1/sistem_ayar?select=deger&anahtar=eq.yedek_token`, { headers: H })).json();
  if (!b.token || b.token !== t?.deger) return json({ hata: "Yetkisiz" }, 401);
  const r = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml");
  if (!r.ok) return json({ hata: `TCMB ${r.status}` }, 502);
  const xml = await r.text();
  const kur: Record<string, number | string> = {};
  for (const pb of ["USD", "EUR", "GBP"]) {
    const blok = new RegExp(`<Currency[^>]*CurrencyCode="${pb}"[\\s\\S]*?</Currency>`).exec(xml)?.[0] || "";
    const v = Number(/<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(blok)?.[1]);
    if (v > 0) kur[pb] = v;
  }
  if (!kur.USD) return json({ hata: "Kur okunamadı" }, 502);
  kur.tarih = /Tarih="([^"]+)"/.exec(xml)?.[1] || new Date().toISOString().slice(0, 10);
  const u = await fetch(`${URL_}/rest/v1/ayarlar?id=eq.1`, { method: "PATCH", headers: H, body: JSON.stringify({ doviz_kur: kur }) });
  return json({ ok: u.ok, kur });
});
