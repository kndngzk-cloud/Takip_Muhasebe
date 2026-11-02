// Gunluk yedegi (yedekler kovasindan) kullanicinin bilgisayarina indirmek icin.
// Kimlik: kullanicinin bilgisayarindaki gizli anahtar; sunucuda sadece SHA-256 ozeti tutulur (sistem_ayar.yedek_indir_hash).
// POST { anahtar, dosya? } -> dosya verilmezse { dosyalar: [...] } listesi; verilirse dosyanin kendisi.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function ozet(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function esit(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ hata: "POST" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const anahtar = typeof body.anahtar === "string" ? body.anahtar.trim() : "";
    const r = await fetch(`${URL_}/rest/v1/sistem_ayar?select=deger&anahtar=eq.yedek_indir_hash`, { headers: H });
    const [kayit] = r.ok ? await r.json() : [];
    if (!anahtar || !kayit?.deger || !esit(await ozet(anahtar), String(kayit.deger))) return json({ hata: "Yetkisiz" }, 401);

    const ls = await fetch(`${URL_}/storage/v1/object/list/yedekler`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "desc" } }),
    });
    const dosyalar = (ls.ok ? await ls.json() : []).map((o: { name: string }) => o.name).filter((n: string) => /^yedek-\d{4}-\d{2}-\d{2}\.(xlsx|json)$/.test(n));
    const dosya = typeof body.dosya === "string" ? body.dosya : "";
    if (!dosya) return json({ dosyalar });
    if (!dosyalar.includes(dosya)) return json({ hata: "Dosya yok" }, 404);
    const f = await fetch(`${URL_}/storage/v1/object/yedekler/${dosya}`, { headers: H });
    if (!f.ok) return json({ hata: `İndirme: ${f.status}` }, 502);
    return new Response(f.body, { headers: { "Content-Type": f.headers.get("Content-Type") || "application/octet-stream", "Content-Disposition": `attachment; filename="${dosya}"` } });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
