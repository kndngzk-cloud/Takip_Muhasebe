// Kisiye ozel gider giris linki (gider.html#token) — herkese acik, token ile dogrular.
//  POST {islem:"bilgi", t}                       -> { ad, firma, kategoriler, son: [...] } (sadece bu linkle girilenler)
//  POST {islem:"ekle", t, tarih, tutar, kategori, aciklama, faturali, odeme_sekli}
//  POST {islem:"sil", t, id}                     -> bu linkle son 24 saatte girilmis kaydi siler (yanlis giris icin)
// Kisi kasa, cari ya da baska veri goremez. Link icin kasa secildiyse gider o kasadan duser.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const KAT = ["Yakıt / araç", "Yemek", "Kargo / ambalaj", "Ofis / kırtasiye", "Bakım / onarım", "Elektrik / su / doğalgaz", "İnternet / telefon", "Reklam", "Kira", "Maaş / SGK", "Muhasebe", "Banka / POS komisyonu", "Vergi", "Diğer"];
const planKat = (k: string) => (k === "Kira" ? "Kira" : k === "Maaş / SGK" ? "Maaş" : k === "Vergi" ? "Vergi / SGK" : ["Elektrik / su / doğalgaz", "İnternet / telefon"].includes(k) ? "Fatura / abonelik" : "Diğer");
const OS = ["Nakit", "Kredi kartı", "Havale / EFT", "Diğer"];
const bugun = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ hata: "Geçersiz istek" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    if (typeof b.t !== "string" || !/^[a-f0-9]{32}$/.test(b.t)) return json({ hata: "Link hatalı. Linki size gönderen kişiyle iletişime geçin." }, 404);
    const [l] = await rest(`gider_linkleri?select=*&token=eq.${b.t}`);
    if (!l) return json({ hata: "Link bulunamadı. Linki size gönderen kişiyle iletişime geçin." }, 404);
    if (!l.aktif) return json({ hata: "Bu gider giriş linki kapatılmış." }, 410);

    if (b.islem === "bilgi") {
      const [ay] = await rest("ayarlar?select=firma_adi&id=eq.1").catch(() => [null]);
      const son = await rest(`odeme_plani?select=id,odeme_tarihi,tutar,gider_kategori,aciklama,faturali,odeme_sekli,olusturma&gider_link_id=eq.${l.id}&order=olusturma.desc&limit=30`);
      const sinir = Date.now() - 24 * 3600e3;
      return json({ ad: l.ad, firma: (ay?.firma_adi || "").trim(), kategoriler: KAT, odeme_sekilleri: OS,
        son: son.map((x: Record<string, any>) => ({ id: x.id, tarih: x.odeme_tarihi, tutar: Number(x.tutar), kategori: x.gider_kategori, aciklama: x.aciklama || "", faturali: !!x.faturali, odeme_sekli: x.odeme_sekli, silinebilir: new Date(x.olusturma).getTime() > sinir })) });
    }

    if (b.islem === "ekle") {
      const tutar = Math.round(Number(b.tutar) * 100) / 100;
      if (!isFinite(tutar) || tutar <= 0) return json({ hata: "Tutarı girin." }, 400);
      if (tutar > 1000000) return json({ hata: "Tutar çok yüksek, kontrol edin." }, 400);
      const kat = KAT.includes(b.kategori) ? b.kategori : null;
      if (!kat) return json({ hata: "Kategori seçin." }, 400);
      let tarih = /^\d{4}-\d{2}-\d{2}$/.test(String(b.tarih)) ? String(b.tarih) : bugun();
      if (tarih > bugun()) tarih = bugun();
      const os = OS.includes(b.odeme_sekli) ? b.odeme_sekli : "Nakit";
      const aciklama = String(b.aciklama || "").trim().slice(0, 200) || null;
      // kotu niyetli / hatali cok giris olmasin: link basina saatte 60
      const son = await rest(`odeme_plani?select=id&gider_link_id=eq.${l.id}&olusturma=gte.${new Date(Date.now() - 3600e3).toISOString()}`);
      if (son.length >= 60) return json({ hata: "Çok fazla giriş yapıldı, biraz sonra tekrar deneyin." }, 429);
      let khId: number | null = null;
      if (l.kasa_id) {
        const [k] = await rest(`kasa?select=id,para_birimi&id=eq.${l.kasa_id}`);
        if (k && k.para_birimi === "TRY") {
          const [h] = await rest("kasa_hareketleri", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ kasa_id: k.id, tarih, tutar: -tutar, aciklama: `Gider · ${kat}${aciklama ? " · " + aciklama : ""} · ${l.ad}`, kaynak: "gider" }) });
          khId = h?.id ?? null;
        }
      }
      try {
        const [p] = await rest("odeme_plani", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
          yon: "Ödeme", kategori: planKat(kat), gider_kategori: kat, aciklama, tetik: "Tarih", vade_tarihi: tarih, tutar, para_birimi: "TRY", kaynak: "Gider",
          faturali: !!b.faturali, odendi: true, odeme_tarihi: tarih, odeme_sekli: os, kasa_hareket_id: khId, gider_link_id: l.id }) });
        return json({ ok: true, id: p.id });
      } catch (e) {
        if (khId) await rest(`kasa_hareketleri?id=eq.${khId}`, { method: "DELETE" }).catch(() => {});
        throw e;
      }
    }

    if (b.islem === "sil") {
      const id = Number(b.id);
      const [p] = await rest(`odeme_plani?select=id,olusturma&id=eq.${id}&gider_link_id=eq.${l.id}`);
      if (!p) return json({ hata: "Kayıt bulunamadı." }, 404);
      if (new Date(p.olusturma).getTime() < Date.now() - 24 * 3600e3) return json({ hata: "24 saatten eski kayıtlar silinemez; düzeltme için yöneticinize yazın." }, 403);
      await rest(`odeme_plani?id=eq.${id}`, { method: "DELETE" }); // kasa hareketi tetikleyiciyle geri alinir
      return json({ ok: true });
    }
    return json({ hata: "Geçersiz istek" }, 400);
  } catch (e) {
    console.error(e);
    return json({ hata: "Bir hata oluştu, lütfen tekrar deneyin." }, 500);
  }
});
