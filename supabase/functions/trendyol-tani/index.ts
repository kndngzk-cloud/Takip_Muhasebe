// Teshis: Trendyol finans servislerinden gecmis odeme emirleri (PaymentOrder) ve kesinti faturalarinin ornegini dondurur.
// Sadece yedek_token ile calisir; anahtarlar entegrasyonlar tablosundan okunur, cevapta anahtar yoktur.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.json(); }

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const [t] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
  if (!body.token || body.token !== t?.deger) return json({ hata: "Yetkisiz" }, 401);
  const [e] = await rest("entegrasyonlar?select=ayar&platform=eq.Trendyol");
  const a = e?.ayar || {};
  const auth = "Basic " + btoa(`${a.api_key}:${a.api_secret}`);
  const ua = `${a.seller_id} - SelfIntegration`;
  const out: Record<string, unknown> = {};
  const odeme: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    const bit = Date.now() - i * 14 * 86400000, bas = bit - 14 * 86400000 + 1000;
    const u = `https://apigw.trendyol.com/integration/finance/che/sellers/${a.seller_id}/otherfinancials?transactionType=PaymentOrder&startDate=${bas}&endDate=${bit}&page=0&size=500`;
    const r = await fetch(u, { headers: { Authorization: auth, "User-Agent": ua, storeFrontCode: "TR" } });
    const j = await r.json().catch(() => ({}));
    for (const c of j.content ?? []) odeme.push({ tarih: new Date(c.paymentDate + 3 * 3600000).toISOString().slice(0, 16), gun: new Date(c.paymentDate + 3 * 3600000).getUTCDay(), tutar: c.debt, kredi: c.credit, aciklama: c.description });
  }
  out.odemeler = odeme;
  return json(out);
});
