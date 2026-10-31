// Teshis: N11 REST/SOAP yollarini dener (token korumali, veri yazmaz)
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.json(); }
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const [t] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
  if (!b.token || b.token !== t?.deger) return new Response("{}", { status: 401 });
  const [e] = await rest("entegrasyonlar?select=ayar&platform=eq.N11");
  const a = e?.ayar || {};
  const out: Record<string, unknown> = {};
  for (const y of (b.yollar as string[]) || []) {
    try {
      let r: Response;
      if (y.startsWith("SOAP ")) {
        const [, yol, ...xml] = y.split(" ");
        const govde = xml.join(" ").replaceAll("AUTH", `<auth><appKey>${a.api_key}</appKey><appSecret>${a.api_secret}</appSecret></auth>`);
        r = await fetch("https://api.n11.com" + yol, { method: "POST", headers: { "Content-Type": "text/xml;charset=UTF-8" }, body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body>${govde}</soapenv:Body></soapenv:Envelope>` });
      } else {
        r = await fetch("https://api.n11.com" + y, { headers: { appkey: a.api_key, appsecret: a.api_secret, Accept: "application/json" } });
      }
      const txt = await r.text();
      out[y.slice(0, 120)] = { status: r.status, govde: txt.slice(0, b.boy || 3000) };
    } catch (err) { out[y.slice(0, 120)] = { hata: String(err) }; }
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
