// Koctas otomatik islem: onay bekleyen siparisleri onaylar, onaylanmis ve kargosu secilmemis siparislerde
// "Koctas Anlasmali Kargo" (KOCTAS) secer. sistem_ayar 'koctas_oto' = 'kapali' ise hicbir sey yapmaz.
// 2 dakikada bir pg_cron ile ya da token ile elle tetiklenir.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(p: string, init: RequestInit = {}) { const r = await fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } }); const t = await r.text(); return t ? JSON.parse(t) : null; }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}));
  const ayar = await rest("sistem_ayar?select=anahtar,deger&anahtar=in.(yedek_token,koctas_oto)");
  const deger = (k: string) => ayar?.find((x: Record<string, string>) => x.anahtar === k)?.deger;
  if (!b.token || b.token !== deger("yedek_token")) return json({ hata: "Yetkisiz" }, 401);
  if (deger("koctas_oto") === "kapali") return json({ kapali: true });
  const [e] = await rest("entegrasyonlar?select=ayar&platform=eq.Ko%C3%A7ta%C5%9F");
  const anahtar = e?.ayar?.api_key; if (!anahtar) return json({ hata: "Koçtaş API anahtarı yok" });
  const mk = (yol: string, init: RequestInit = {}) => fetch(`https://koctas.mirakl.net${yol}`, { ...init, headers: { Authorization: anahtar, Accept: "application/json", "Content-Type": "application/json", ...(init.headers || {}) } });
  const out = { onaylanan: [] as string[], kargo: [] as string[], hatalar: [] as string[] };
  const bildir: { baslik: string; metin: string }[] = [];

  // 1) onay bekleyenler
  const r1 = await mk("/api/orders?order_state_codes=WAITING_ACCEPTANCE&max=100");
  const j1 = await r1.json().catch(() => ({}));
  for (const o of (j1.orders ?? []) as Record<string, any>[]) {
    const satir = ((o.order_lines ?? []) as Record<string, any>[]).filter((l) => l.order_line_state === "WAITING_ACCEPTANCE").map((l) => ({ accepted: true, id: l.order_line_id }));
    if (!satir.length) continue;
    const r = await mk(`/api/orders/${encodeURIComponent(o.order_id)}/accept`, { method: "PUT", body: JSON.stringify({ order_lines: satir }) });
    if (r.ok || r.status === 204) { out.onaylanan.push(o.order_id); bildir.push({ baslik: "Koçtaş siparişi onaylandı", metin: `${o.order_id} · ${(o.order_lines ?? []).map((l: any) => `${l.quantity > 1 ? l.quantity + " × " : ""}${l.product_shop_sku || l.offer_sku}`).join(", ")} · anlaşmalı kargo seçilecek` }); }
    else out.hatalar.push(`onay ${o.order_id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  // 2) kargoya hazir, kargo firmasi secilmemis olanlara anlasmali kargo
  const r2 = await mk("/api/orders?order_state_codes=SHIPPING&max=100");
  const j2 = await r2.json().catch(() => ({}));
  for (const o of (j2.orders ?? []) as Record<string, any>[]) {
    if (o.shipping_carrier_code || o.shipping_company || o.shipping_tracking) continue;
    const r = await mk(`/api/orders/${encodeURIComponent(o.order_id)}/tracking`, { method: "PUT", body: JSON.stringify({ carrier_code: "KOCTAS" }) });
    if (r.ok || r.status === 204) { out.kargo.push(o.order_id); bildir.push({ baslik: "Koçtaş: anlaşmalı kargo seçildi", metin: `${o.order_id} · barkodlu etiket 5-10 dakika içinde oluşur, programdan basabilirsiniz` }); }
    else out.hatalar.push(`kargo ${o.order_id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  for (const n of bildir) await fetch(`${URL_}/functions/v1/bildirim`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...n, url: "#/platform-siparisler" }) }).catch(() => {});
  if (out.onaylanan.length || out.kargo.length || out.hatalar.length) {
    await rest("sistem_ayar?on_conflict=anahtar", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ anahtar: "koctas_oto_son", deger: JSON.stringify({ zaman: new Date().toISOString(), ...out }) }) }).catch(() => {});
  }
  return json(out);
});
