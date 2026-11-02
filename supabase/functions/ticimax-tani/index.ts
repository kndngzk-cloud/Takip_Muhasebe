// Tanilama: Ticimax SiparisServis WSDL'ini okur (anahtar gerektirmez, herkese acik tanim). Token korumali.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const [t] = await (await fetch(`${URL_}/rest/v1/sistem_ayar?select=deger&anahtar=eq.yedek_token`, { headers: H })).json();
  if (!b.token || b.token !== t?.deger) return json({ hata: "Yetkisiz" }, 401);
  const site = String(b.site || "www.gradde.com.tr").replace(/[^a-z0-9.-]/gi, "");
  const out: Record<string, unknown> = {};
  for (const yol of ["?singleWsdl", "?wsdl", "?xsd=xsd2", "?xsd=xsd0", "?xsd=xsd1"]) {
    try {
      const r = await fetch(`https://${site}/Servis/SiparisServis.svc${yol}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const x = await r.text();
      const pick = (re: RegExp, n = 4000) => (x.match(re) || []).slice(0, 1).map((m) => m.slice(0, n));
      out[yol] = { status: r.status, uzunluk: x.length,
        ns: [...new Set([...x.matchAll(/(?:targetNamespace|xmlns:\w+)="([^"]+)"/g)].map((m) => m[1]))].slice(0, 25),
        action: [...x.matchAll(/soapAction="([^"]*Siparis[^"]*)"/g)].map((m) => m[1]).filter((a) => /SelectSiparis|SetSiparisDurum/.test(a)),
        adres: [...x.matchAll(/address location="([^"]+)"/g)].map((m) => m[1]),
        imports: [...x.matchAll(/schemaLocation="([^"]+)"/g)].map((m) => m[1]),
        select: pick(/<xs:element name="SelectSiparis">[\s\S]*?<\/xs:element>/),
        filtre: pick(/<xs:complexType name="WebSiparisFiltre">[\s\S]*?<\/xs:complexType>/),
        sayfa: pick(/<xs:complexType name="WebSiparisSayfalama">[\s\S]*?<\/xs:complexType>/),
        siparis: pick(/<xs:complexType name="WebSiparis">[\s\S]*?<\/xs:complexType>/, 6000),
        urun: pick(/<xs:complexType name="WebSiparisUrun">[\s\S]*?<\/xs:complexType>/, 4000),
        odeme: pick(/<xs:complexType name="WebSiparisOdeme">[\s\S]*?<\/xs:complexType>/, 3000),
        bas: x.slice(0, 300) };
    } catch (e) { out[yol] = { hata: String(e) }; }
  }
  return json(out);
});
