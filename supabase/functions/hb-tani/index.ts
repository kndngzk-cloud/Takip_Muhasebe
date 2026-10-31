// Teshis: verilen Hepsiburada OMS yollarini dener (token korumali, veri yazmaz)
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.json(); }
async function hamGet(u: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  const url = new URL(u);
  const conn = await Deno.connectTls({ hostname: url.hostname, port: 443 });
  try {
    await conn.write(new TextEncoder().encode([`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.hostname}`, "Connection: close", ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n")));
    const parts: Uint8Array[] = []; let top = 0; const buf = new Uint8Array(65536);
    while (true) { const n = await conn.read(buf).catch(() => null); if (!n) break; parts.push(buf.slice(0, n)); top += n; }
    const tum = new Uint8Array(top); let o = 0; for (const p of parts) { tum.set(p, o); o += p.length; }
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
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const [t] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
  if (!b.token || b.token !== t?.deger) return new Response("{}", { status: 401 });
  const [e] = await rest("entegrasyonlar?select=ayar&platform=eq.Hepsiburada");
  const a = e.ayar; const mid = a.merchant_id;
  const hd = { Authorization: "Basic " + btoa(`${a.merchant_id}:${a.servis_anahtari}`), "User-Agent": a.kullanici_adi, Accept: "application/json" };
  const out: Record<string, unknown> = {};
  for (const y of (b.yollar as string[])) {
    const r = await hamGet("https://oms-external.hepsiburada.com" + y.replace("MID", mid), hd);
    let ozet: unknown = r.text.slice(0, 1200);
    try { const j = JSON.parse(r.text); if (Array.isArray(j)) ozet = j.filter((c: any) => !b.alt || String(c.claimDate) >= b.alt).map((c: any) => [c.orderNumber, String(c.claimDate).slice(0, 10), c.status, c.claimType, c.quantity, c.MerchantSku]); } catch { /* */ }
    out[y] = { durum: r.status, ozet };
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
