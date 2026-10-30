// Teshis: Koctas (Mirakl) siparis belgelerini listeler (token korumali, veri yazmaz)
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function rest(p: string) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.json(); }
Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const [t] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
  if (!b.token || b.token !== t?.deger) return new Response("{}", { status: 401 });
  const [e] = await rest("entegrasyonlar?select=ayar&platform=eq.Ko%C3%A7ta%C5%9F");
  const hd = { Authorization: e.ayar.api_key, Accept: "application/json" };
  const out: Record<string, unknown> = {};
  for (const no of (b.siparisler as string[])) {
    const r = await fetch(`https://koctas.mirakl.net/api/orders/documents?order_ids=${encodeURIComponent(no)}`, { headers: hd });
    out[no] = { status: r.status, body: (await r.text()).slice(0, 1500) };
  }
  if (b.metin) {
    const r = await fetch(`https://koctas.mirakl.net/api/orders/documents/download?document_ids=${b.metin}`, { headers: { Authorization: e.ayar.api_key } });
    const buf = new Uint8Array(await r.arrayBuffer());
    const ham = new TextDecoder("latin1").decode(buf);
    const parcalar: string[] = []; const re = /stream\r?\n/g; let m;
    while ((m = re.exec(ham))) {
      const bas = m.index + m[0].length; const son = ham.indexOf("endstream", bas); if (son < 0) break;
      const ust = ham.slice(Math.max(0, m.index - 200), m.index);
      if (/FlateDecode/.test(ust) && !/Image/.test(ust)) {
        try { const ds = new DecompressionStream("deflate"); const w = ds.writable.getWriter(); w.write(buf.slice(bas, son)); w.close(); const out = new Uint8Array(await new Response(ds.readable).arrayBuffer()); const tx = new TextDecoder("latin1").decode(out); const t2 = [...tx.matchAll(/\(([^)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g)].map((x) => x[1] ?? (x[2] ? [...x[2].matchAll(/\(([^)]*)\)/g)].map((y) => y[1]).join("") : x[3])).join(" | "); parcalar.push(t2.slice(0, 1500) || tx.slice(0, 300)); } catch (er) { parcalar.push("hata " + er); }
      } else parcalar.push(ust.replace(/\s+/g, " ").slice(-120));
    }
    out.metin = { status: r.status, boy: buf.length, sayfa: (ham.match(/\/Type\s*\/Page[^s]/g) || []).length, parcalar: parcalar.slice(0, 8) };
  }
  if (b.indir) { const r = await fetch(`https://koctas.mirakl.net/api/orders/documents/download?document_ids=${b.indir}`, { headers: { Authorization: e.ayar.api_key } }); const buf = new Uint8Array(await r.arrayBuffer()); out.indir = { status: r.status, tip: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), boy: buf.length, bas: new TextDecoder("latin1").decode(buf.slice(0, 16)) }; }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
