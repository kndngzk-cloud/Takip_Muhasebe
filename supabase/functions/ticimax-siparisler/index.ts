// Ticimax internet sitelerinin (gradde.com.tr, eviyeshop.com) siparislerini ceker, platform_siparisler'e yazar ve programa aktarir.
// 2 dakikada bir pg_cron ile ya da uygulamadan (yonetici) tetiklenir. Aktarma kurallari platform-siparisler ile aynidir.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.slice(0, 60)}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function yetkili(req: Request, body: Record<string, unknown>) {
  if (typeof body.token === "string" && body.token) { const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token"); if (r && r.deger === body.token) return true; }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!jwt) return false;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } }); if (!u.ok) return false;
  const user = await u.json(); if (!user?.id) return false;
  const [p] = await rest(`profiller?select=rol&id=eq.${user.id}`); return p?.rol === "admin";
}
const sayi = (v: unknown) => { if (typeof v === "number") return v; const s = String(v ?? "").trim(); if (!s) return NaN; return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); };
const para = (v: unknown) => { const n = sayi((v as Record<string, unknown>)?.amount ?? (v as Record<string, unknown>)?.value ?? v); return isNaN(n) ? 0 : n; };
const d10 = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "number") return new Date(v).toISOString().slice(0, 10); const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v)); return m ? m[1] : null; };
const iso = (v: unknown) => { if (v == null || v === "") return null; const d = typeof v === "number" ? new Date(v) : new Date(String(v)); return isNaN(+d) ? null : d.toISOString(); };
const r2 = (n: number) => Math.round(n * 100) / 100;
const TESHIS: Record<string, unknown> = {};
type Iade = { no: string; durum: string | null; tarih: string | null; adet: number | null; iade_no: string | null; neden: string | null };
const IADE: Record<string, Iade[]> = {};
const IADE_ALT = "2026-08-01";
const TALEP_AD: Record<string, string> = { MissingPart: "Eksik parça", RenewProduct: "Yenisiyle değişim", Warranty: "Garanti", WrongProduct: "Yanlış ürün", DamagedProduct: "Hasarlı ürün" };
const iadeDurum = (s: string) => /cancel/i.test(s) ? null : /reject|red/i.test(s) ? "Reddedildi" : /accept|approv|complete|finaliz|refund/i.test(s) ? "Kabul edildi" : "İade talebi";
type Satir = { kod: string; ad: string; miktar: number; tutar: number };
type Sip = { platform: string; siparis_no: string; platform_durum?: string; tarih?: string | null; musteri?: string | null; alici?: string | null; telefon?: string | null; eposta?: string | null; sehir?: string | null; adres?: string | null; vergi_no?: string | null;
  satirlar: Satir[]; brut: number; komisyon?: number | null; kargo_kesinti?: number | null; net?: number | null; kesinti_kesin?: boolean; kargo_firma?: string | null; kargo_takip?: string | null; kargo_link?: string | null; barkod?: string | null;
  sevk_tarihi?: string | null; teslim_tarihi?: string | null; paket_no?: string | null; son_kargo?: string | null; iptal?: boolean; bekle?: boolean; ham?: unknown };

/* ---------- Ticimax (kendi internet siteleri): SiparisServis.svc SOAP ----------
   Yetki kodu: Ticimax paneli -> Ayarlar -> WS Yetki Kodu Yonetimi. Durum kodlari:
   0 on siparis, 1 onay bekliyor, 2 onaylandi, 3 odeme bekliyor, 4 paketleniyor, 5 tedarik, 6 kargoda, 7 teslim,
   8 iptal, 9 iade, 10 silinmis, 11 iade talebi, 12 iade ulasti, 13 iade odendi, 14/15 iptal talebi, 16/17 kismi iade */
type XN = { n: string; c: XN[]; t: string; nil?: boolean };
function xmlAgac(x: string): XN {
  const kok: XN = { n: "#", c: [], t: "" }; const yig: XN[] = [kok];
  const re = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g; let m: RegExpExecArray | null;
  const ent = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
  while ((m = re.exec(x))) {
    if (m[5] !== undefined) { yig[yig.length - 1].t += ent(m[5]); continue; }
    const ad = m[2].includes(":") ? m[2].split(":")[1] : m[2];
    if (m[1]) { if (yig.length > 1) yig.pop(); continue; }
    if (m[2].startsWith("?") || m[2].startsWith("!")) continue;
    const d: XN = { n: ad, c: [], t: "", nil: /\bnil="true"/.test(m[3]) };
    yig[yig.length - 1].c.push(d);
    if (!m[4]) yig.push(d);
  }
  return kok;
}
// dugum -> nesne: tekrar eden ad dizi olur, cocuksuz dugum metin olur
function xmlNesne(d: XN): any {
  if (d.nil) return null;
  if (!d.c.length) return d.t.trim();
  const o: Record<string, any> = {};
  for (const c of d.c) { const v = xmlNesne(c); if (c.n in o) { if (!Array.isArray(o[c.n]) || !o[`__dizi_${c.n}`]) { o[c.n] = [o[c.n]]; o[`__dizi_${c.n}`] = true; } o[c.n].push(v); } else o[c.n] = v; }
  return o;
}
const dizi = (v: any) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const bul = (d: XN, ad: string): XN | null => { if (d.n === ad) return d; for (const c of d.c) { const r = bul(c, ad); if (r) return r; } return null; };
const tmxSay = (v: unknown) => { const n = Number(v); return isNaN(n) ? 0 : n; };
// Ticimax tarihleri saat dilimi olmadan Istanbul saatiyle gelir
const tmxT = (v: unknown) => { const s = String(v ?? "").trim(); if (!s) return null; return /([zZ]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}+03:00`; };

function ticimax(alan: string, etiket: string) {
  return async (a: Record<string, string>, gunSay: number, bitGun = 0): Promise<Sip[]> => {
    if (!a.yetki_kodu) throw new Error(`${etiket}: web servis yetki kodu girilmemiş`);
    const site = String(a.site || alan).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const url = `https://${site.startsWith("www.") ? site : "www." + site}/Servis/SiparisServis.svc`;
    const xe = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tar = (ms: number) => new Date(ms + 3 * 3600000).toISOString().slice(0, 19); // Istanbul saati
    // sadece aktarim baslangicindan (siparis_aktarim_baslangic) sonraki siparisler istenir; kargoya verilenlerin durumunu
    // yakalamak icin son 21 gune kadar geriye bakilir ama baslangic tarihinden oncesine asla
    const basT = a.__bas ? Date.parse(`${a.__bas}T00:00:00+03:00`) : 0;
    const bas = Math.max(Date.now() - Math.max(gunSay, 21) * 86400000, isNaN(basT) ? 0 : basT), bit = Date.now() - bitGun * 86400000 + 86400000;
    const tum: any[] = [];
    for (let sayfa = 0; sayfa < 20; sayfa++) {
      const f = [["EFaturaURL", "-1"], ["EntegrasyonAktarildi", "-1"], ["IptalEdilmisUrunler", "false"], ["KampanyaGetir", "false"], ["KargoEntegrasyonTakipDurumu", "-1"], ["KargoFirmaID", "-1"],
        ["OdemeDurumu", "-1"], ["OdemeGetir", "true"], ["OdemeTamamlandi", "-1"], ["OdemeTipi", "-1"], ["PaketlemeDurumu", "-1"], ["PazaryeriIhracat", "-1"], ["SiparisDurumu", "-1"], ["SiparisID", "-1"],
        ["SiparisTarihiBas", tar(bas)], ["SiparisTarihiSon", tar(bit)], ["TedarikciID", "-1"], ["TeslimatMagazaID", "-1"], ["UrunGetir", "true"], ["UyeID", "-1"]]
        .map(([k, v]) => `<d:${k}>${v}</d:${k}>`).join("");
      const zarf = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://tempuri.org/" xmlns:d="http://schemas.datacontract.org/2004/07/"><s:Body><t:SelectSiparis><t:UyeKodu>${xe(a.yetki_kodu)}</t:UyeKodu><t:f>${f}</t:f><t:s><d:BaslangicIndex>${sayfa * 100}</d:BaslangicIndex><d:KayitSayisi>100</d:KayitSayisi><d:SiralamaDegeri>ID</d:SiralamaDegeri><d:SiralamaYonu>DESC</d:SiralamaYonu></t:s></t:SelectSiparis></s:Body></s:Envelope>`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/ISiparisServis/SelectSiparis"' }, body: zarf });
      const x = await r.text();
      const agac = xmlAgac(x);
      const hata = bul(agac, "faultstring") || bul(agac, "Text");
      if (!r.ok || hata) throw new Error(`${etiket} ${r.status}: ${(hata?.t || x.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 250)}`);
      const sonuc = bul(agac, "SelectSiparisResult");
      const parca = sonuc ? sonuc.c.filter((c) => c.n === "WebSiparis").map(xmlNesne) : [];
      tum.push(...parca);
      if (parca.length < 100) break;
    }
    const iadeler: Iade[] = [];
    const out: Sip[] = [];
    for (const o of tum) {
      const durum = tmxSay(o.Durum);
      const no = String(o.SiparisNo || o.ID || "");
      if (!no || durum === 10) continue; // silinmis
      if (basT && tmxT(o.SiparisTarihi) && Date.parse(tmxT(o.SiparisTarihi)!) < basT) continue; // baslangictan once
      const ta = o.TeslimatAdresi || {}, fa = o.FaturaAdresi || {};
      const urunler = dizi(o.Urunler?.WebSiparisUrun);
      const satirlar = urunler.map((u: any) => {
        const adet = tmxSay(u.Adet) || 1;
        // Ticimax'ta ...FiyatKdv alani fiyatin KDV TUTARIDIR; KDV dahil birim = fiyat + KDV tutari
        const birim = (tmxSay(u.SatisAniIndirimliFiyat) + tmxSay(u.SatisAniIndirimliFiyatKdv)) || (tmxSay(u.SatisAniSatisFiyat) + tmxSay(u.SatisAniSatisFiyatKdv)) || (tmxSay(u.Tutar) + tmxSay(u.KdvTutari));
        return { kod: String(u.StokKodu || u.Barkod || u.UrunKartiID || ""), ad: String(u.UrunAdi || "").trim(), miktar: adet, tutar: r2(birim * adet) };
      });
      const brut = r2(tmxSay(o.SiparisToplamTutari) || tmxSay(o.ToplamTutar) || satirlar.reduce((t: number, x: any) => t + x.tutar, 0));
      // satir tutarlari siparis toplamina orantili olcekle (kargo / indirim dahil toplam satirlara dagilir)
      const satTop = satirlar.reduce((t: number, x: any) => t + x.tutar, 0);
      if (satTop > 0 && brut > 0 && Math.abs(satTop - brut) > 0.01) { let kalan = brut; satirlar.forEach((x: any, i: number) => { x.tutar = i === satirlar.length - 1 ? r2(kalan) : r2(x.tutar * brut / satTop); kalan -= x.tutar; }); }
      else if (!(satTop > 0) && satirlar.length) { const adetTop = satirlar.reduce((t: number, x: any) => t + x.miktar, 0) || 1; satirlar.forEach((x: any) => { x.tutar = r2(brut * x.miktar / adetTop); }); }
      const tarih = iso(tmxT(o.SiparisTarihi));
      const degis = d10(o.DurumGuncellemeTarihi) || d10(o.DuzenlemeTarihi); // takvim gunu (Istanbul)
      if ([9, 11, 12, 13, 16, 17].includes(durum) && (d10(tarih) || "") >= IADE_ALT) iadeler.push({ no, durum: durum === 11 || durum === 16 ? "İade talebi" : "Kabul edildi", tarih: degis, adet: null, iade_no: null, neden: String(o.SiparisDurumu || "") || null });
      const ods = dizi(o.Odemeler?.WebSiparisOdeme); const odeme = ods[0] || {};
      // Ticimax'ta odenmis siparis de "Siparisiniz Alindi" (0) durumunda kalabilir: karar odeme kaydina gore verilir.
      // Onaylandi: 0 bekliyor, 1 onaylandi, 2 hatali. OdemeTipi 2/3: kapida odeme (teslimde odenir, beklemeden aktarilir)
      const onayli = ods.filter((p: any) => tmxSay(p.Onaylandi) === 1).reduce((t: number, p: any) => t + tmxSay(p.Tutar), 0);
      const kapida = ods.some((p: any) => [2, 3].includes(tmxSay(p.OdemeTipi)));
      const odendi = kapida || Math.max(tmxSay(o.OdenenTutar), onayli) >= brut - 0.01;
      const hatali = !odendi && ods.length > 0 && ods.every((p: any) => tmxSay(p.Onaylandi) === 2) && tmxSay(o.OdenenTutar) <= 0;
      const erken = [0, 1, 3].includes(durum); // henuz onaylanip paketlenmemis
      out.push({
        platform: etiket, siparis_no: no, platform_durum: String(o.SiparisDurumu || durum), tarih,
        musteri: String(o.AdiSoyadi || `${o.UyeAdi || ""} ${o.UyeSoyadi || ""}`).trim() || null, alici: ta.AliciAdi || null,
        telefon: ta.AliciTelefon || fa.AliciTelefon || null, eposta: o.Mail || null, sehir: ta.Il || fa.Il || null,
        adres: [ta.Adres, ta.Ilce, ta.Il].filter(Boolean).join(" ") || null, vergi_no: fa.VergiNo || null,
        satirlar, brut, komisyon: null, kargo_kesinti: null, net: null, kesinti_kesin: false,
        kargo_firma: o.KargoFirmaTanim || null, kargo_takip: o.KargoTakipNo || null, kargo_link: o.KargoTakipLink || null, barkod: o.KargoTakipNo || null,
        sevk_tarihi: durum === 6 || durum === 7 ? (degis || d10(tarih)) : null, teslim_tarihi: durum === 7 ? degis : null,
        paket_no: o.ID ? String(o.ID) : null, son_kargo: iso(tmxT(o.KargoyaSonVerilmeTarihi)), iptal: durum === 8 || (erken && hatali),
        bekle: erken && !odendi && !hatali,
        ham: { durum, durum_ad: o.SiparisDurumu || null, odeme_tipi: odeme.OdemeTipi ?? null, kargo_tutari: tmxSay(o.KargoTutari) || null,
          fatura: { ad: fa.AliciAdi || null, firma: fa.FirmaAdi || null, vergi_dairesi: fa.VergiDairesi || null, vergi_no: fa.VergiNo || null, telefon: fa.AliciTelefon || null, adres: [fa.Adres, fa.Ilce, fa.Il].filter(Boolean).join(" ") || null },
          odemeler: dizi(o.Odemeler?.WebSiparisOdeme).map((p: any) => ({ tip: p.OdemeTipi, onay: p.Onaylandi, tutar: p.Tutar, taksit: p.TaksitSayisi, tarih: p.Tarih,
            // odeme referanslari (PayTR eslestirmesi icin); kart bilgisi alinmaz
            ref: Object.fromEntries(Object.entries(p).filter(([k, v]) => v != null && typeof v !== "object" && String(v) !== "" && !/kart|card|cvv|cvc|bin/i.test(k))) })),
          toplam: { SiparisToplamTutari: o.SiparisToplamTutari, ToplamTutar: o.ToplamTutar, Tutar: o.Tutar, ToplamKdv: o.ToplamKdv, KargoTutari: o.KargoTutari, IndirimTutari: o.IndirimTutari, OdenenTutar: o.OdenenTutar, Bakiye: o.Bakiye },
          urunler: urunler.map((u: any) => ({ kod: u.StokKodu, Adet: u.Adet, Tutar: u.Tutar, KdvTutari: u.KdvTutari, KdvOrani: u.KdvOrani, SatisAniSatisFiyat: u.SatisAniSatisFiyat, SatisAniSatisFiyatKdv: u.SatisAniSatisFiyatKdv, SatisAniIndirimliFiyat: u.SatisAniIndirimliFiyat, SatisAniIndirimliFiyatKdv: u.SatisAniIndirimliFiyatKdv, KampanyaIndirimTutari: u.KampanyaIndirimTutari, Durum: u.Durum, DurumAd: u.DurumAd })) },
      } as Sip);
    }
    IADE[etiket] = iadeler;
    TESHIS[etiket] = { siparis: out.length, ham: tum.length };
    return out;
  };
}

/* Programda kargoya verilen site siparisi Ticimax'ta da "Kargoya verildi" yapilir (musteri sitede ve e-postada gorur) */
async function tmxKargoyaVerildi(a: Record<string, string>, alan: string, tmxId: string) {
  const site = String(a.site || alan).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const url = `https://${site.startsWith("www.") ? site : "www." + site}/Servis/SiparisServis.svc`;
  const xe = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const zarf = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://tempuri.org/"><s:Body><t:SetSiparisKargoyaVerildi><t:UyeKodu>${xe(a.yetki_kodu)}</t:UyeKodu><t:siparisId>${Number(tmxId)}</t:siparisId></t:SetSiparisKargoyaVerildi></s:Body></s:Envelope>`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/ISiparisServis/SetSiparisKargoyaVerildi"' }, body: zarf });
  const t = await r.text();
  const hata = /<(?:\w+:)?faultstring[^>]*>([\s\S]*?)</.exec(t)?.[1] || /<(?:\w+:)?ErrorMessage>([^<]+)</.exec(t)?.[1];
  if (!r.ok || hata) throw new Error(`Ticimax kargoya verildi: ${hata || r.status}`);
}

const PLATFORM: Record<string, (a: Record<string, string>, g: number, b?: number) => Promise<Sip[]>> = { "gradde.com.tr": ticimax("gradde.com.tr", "gradde.com.tr"), "eviyeshop.com": ticimax("eviyeshop.com", "eviyeshop.com") };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const [ba] = await rest("sistem_ayar?select=deger&anahtar=eq.siparis_aktarim_baslangic");
    const baslangic = String(ba?.deger || "2100-01-01");
    const kuru = body.kuru === true; // sadece cek, aktarma
    const sadece = typeof body.platform === "string" ? body.platform : null;
    const ent = await rest(`entegrasyonlar?select=platform,ayar,son_yanit&platform=in.(${encodeURIComponent('"gradde.com.tr","eviyeshop.com"')})`);
    const sonuc: Record<string, unknown> = {};
    const olaylar: { baslik: string; metin: string; url: string; etiket: string }[] = [];
    const ozet = (s: Sip) => `${s.alici || s.musteri || ""} · ${s.satirlar.map((x) => `${x.miktar > 1 ? x.miktar + " × " : ""}${x.kod || x.ad}`).join(", ")} · ${s.brut.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;
    for (const e of ent) {
      if (sadece && e.platform !== sadece) continue;
      const a = e.ayar || {};
      if (!Object.keys(a).length) continue;
      try {
        const gunSay = typeof body.gun === "number" ? body.gun : 3;
        const liste = await PLATFORM[e.platform]({ ...a, __bas: baslangic }, gunSay, typeof body.bitis_gun === "number" ? body.bitis_gun : 0);
        let yeni = 0, aktarilan = 0, baglanan = 0, guncellenen = 0, eslesmedi = 0; const hatalar: string[] = [];
        if (liste.length) {
          const mevcut = await rest(`platform_siparisler?select=id,siparis_no,durum,siparis_id&platform=eq.${encodeURIComponent(e.platform)}&siparis_no=in.(${liste.map((s) => `"${s.siparis_no.replace(/"/g, "")}"`).join(",")})`);
          const m = new Map<string, Record<string, any>>(mevcut.map((x: Record<string, any>) => [x.siparis_no, x]));
          const satirlar = liste.map(({ iptal, bekle, ...s }) => ({ ...s, guncelleme: new Date().toISOString() }));
          const kayit = await rest("platform_siparisler?on_conflict=platform,siparis_no&select=id,siparis_no,durum,siparis_id,tarih", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(satirlar) });
          for (const k of kayit as Record<string, any>[]) {
            const s = liste.find((x) => x.siparis_no === k.siparis_no)!;
            const eski = m.get(k.siparis_no);
            if (!eski) yeni++;
            let durum = k.durum;
            if (s.iptal && durum !== "İptal") { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "İptal" }) }); durum = "İptal"; }
            else if (s.bekle && !k.siparis_id) {
              if (durum !== "Onay bekliyor") { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "Onay bekliyor" }) }); if (!kuru) olaylar.push({ baslik: `${e.platform}: onayınızı bekleyen sipariş`, metin: `${ozet(s)} — panelden onaylayın, onaylanınca programa kendiliğinden aktarılır`, url: "#/platform-siparisler", etiket: `o-${e.platform}-${k.siparis_no}` }); }
              continue;
            }
            else if (durum === "Onay bekliyor") { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "Bekliyor" }) }); durum = "Bekliyor"; }
            else if (!eski && !k.siparis_id && (d10(k.tarih) || "9999") < baslangic) { await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: "Eski" }) }); durum = "Eski"; }
            if (kuru) continue;
            try {
              if (k.siparis_id) { const r = await rest("rpc/platform_siparis_senkron", { method: "POST", body: JSON.stringify({ p_id: k.id }) }); if (r && Object.keys(r).length) guncellenen++; }
              else if (durum === "Bekliyor" || durum === "Eşleşmedi" || durum === "Eski") { const r = await rest("rpc/platform_siparis_aktar", { method: "POST", body: JSON.stringify({ p_id: k.id }) }); if (r?.id) { if (r.elle) baglanan++; else { aktarilan++; if (!eski || eski.durum === "Onay bekliyor") olaylar.push({ baslik: `Yeni ${e.platform} siparişi`, metin: ozet(s), url: `#/siparis/${r.id}`, etiket: `s-${e.platform}-${k.siparis_no}` }); } } else if (r?.eslesmedi) { eslesmedi++; if (!eski || eski.durum !== "Eşleşmedi") olaylar.push({ baslik: `${e.platform} siparişi: ürün seçin`, metin: `${ozet(s)} — bu ürün programdaki hiçbir ürünle eşleşmedi`, url: "#/platform-siparisler", etiket: `e-${e.platform}-${k.siparis_no}` }); } }
            } catch (err) {
              const msg = String((err as Error).message || err).slice(0, 300); hatalar.push(`${k.siparis_no}: ${msg}`);
              await rest(`platform_siparisler?id=eq.${k.id}`, { method: "PATCH", body: JSON.stringify({ durum: k.siparis_id ? durum : "Hata", hata: msg }) }).catch(() => {});
            }
          }
        }
        // programda sevk edilmis ama sitede hala kargoya verilmemis gorunen siparisler Ticimax'ta guncellenir
        let kargoGun = 0;
        if (!kuru) {
          try {
            const acik = await rest(`platform_siparisler?select=id,siparis_no,paket_no,siparis_id,ham&platform=eq.${encodeURIComponent(e.platform)}&durum=eq.${encodeURIComponent("Aktarıldı")}&sevk_tarihi=is.null&siparis_id=not.is.null&paket_no=not.is.null`) as Record<string, any>[];
            const erken = acik.filter((x) => [0, 1, 2, 3, 4, 5].includes(Number(x.ham?.durum)));
            if (erken.length) {
              const sev = await rest(`siparisler?select=id,sevk_tarihi&durum=eq.${encodeURIComponent("Sevk Edildi")}&id=in.(${erken.map((x) => x.siparis_id).join(",")})`) as Record<string, any>[];
              const sm = new Map(sev.map((x) => [x.id, x.sevk_tarihi]));
              for (const x of erken.filter((x) => sm.has(x.siparis_id)).slice(0, 15)) {
                try {
                  await tmxKargoyaVerildi(a, e.platform, x.paket_no);
                  await rest(`platform_siparisler?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ sevk_tarihi: sm.get(x.siparis_id), platform_durum: "Kargoya Verildi", ham: { ...(x.ham || {}), durum: 6 } }) });
                  kargoGun++;
                } catch (err) { hatalar.push(`${x.siparis_no}: ${String((err as Error).message || err).slice(0, 200)}`); }
              }
            }
          } catch (err) { hatalar.push(`kargo durumu: ${String((err as Error).message || err).slice(0, 200)}`); }
        }
        let iadeSay = 0;
        if (!kuru && IADE[e.platform]) {
          const plq = `platform=eq.${encodeURIComponent(e.platform)}`;
          for (const i of IADE[e.platform]) {
            if (!i.durum) continue;
            try {
              const once = await rest(`platform_siparisler?${plq}&siparis_no=eq.${encodeURIComponent(i.no)}&select=id,iade_durum`);
              if (!once?.length) continue; // siparis sistemde yok (aktarim baslangicindan once)
              await rest(`platform_siparisler?${plq}&siparis_no=eq.${encodeURIComponent(i.no)}`, { method: "PATCH", body: JSON.stringify({ iade_durum: i.durum, iade_tarihi: i.tarih, iade_adet: i.adet, iade_no: i.iade_no, iade_neden: i.neden }) });
              if (i.durum === "Talep bekliyor" && once[0].iade_durum !== "Talep bekliyor") olaylar.push({ baslik: `${e.platform}: sizden işlem bekleyen talep`, metin: `Sipariş ${i.no} · ${i.neden || ""}`.slice(0, 300), url: "#/platform-siparisler", etiket: `t-${i.no}` });
              if (i.durum === "İade talebi" && once[0].iade_durum !== "İade talebi") olaylar.push({ baslik: `${e.platform}: yeni iade talebi`, metin: `Sipariş ${i.no}${i.neden ? " · " + i.neden : ""}`.slice(0, 300), url: "#/platform-siparisler", etiket: `it-${i.no}` });
              for (const x of once as Record<string, any>[]) { const r = await rest("rpc/platform_iade_isle", { method: "POST", body: JSON.stringify({ p_id: x.id }) }); if (r && (r.iptal || r.kismi)) { iadeSay++; olaylar.push({ baslik: `${e.platform} iadesi: ${i.durum}`, metin: `Sipariş ${i.no}${r.kismi ? " · kısmi iade, siparişi elle düzenleyin" : " · sipariş iptal edildi, stok geri alındı"}${i.neden ? " · " + i.neden : ""}`, url: "#/platform-siparisler", etiket: `i-${i.no}` }); } }
            } catch (err) { hatalar.push(`iade ${i.no}: ${String((err as Error).message || err).slice(0, 150)}`); }
          }
          // cozulen talepler (artik aksiyon beklemiyor) isaretten kaldirilir
          const bekleyen = IADE[e.platform].filter((i) => i.durum === "Talep bekliyor" || i.durum === "İade talebi").map((i) => `"${i.no}"`);
          await rest(`platform_siparisler?${plq}&iade_durum=in.(${encodeURIComponent('"Talep bekliyor","İade talebi"')})${bekleyen.length ? `&siparis_no=not.in.(${encodeURIComponent(bekleyen.join(","))})` : ""}`, { method: "PATCH", body: JSON.stringify({ iade_durum: null }) }).catch(() => {});
        }
        const durumMetni = `Siparişler: ${liste.length} çekildi${kargoGun ? ` · ${kargoGun} sipariş sitede kargoya verildi yapıldı` : ""}${iadeSay ? ` · ${iadeSay} iade işlendi` : ""} · ${yeni} yeni · ${aktarilan} aktarıldı${baglanan ? ` · ${baglanan} elle girilmiş siparişe bağlandı` : ""}${eslesmedi ? ` · ${eslesmedi} ürün eşleşmedi` : ""}${hatalar.length ? ` · ${hatalar.length} hata` : ""}`;
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: durumMetni, hatalar: hatalar.slice(0, 5), teshis: TESHIS[e.platform] ?? null } } }) });
        sonuc[e.platform] = { teshis: TESHIS[e.platform], iade: (IADE[e.platform] ?? []).length, kargo_guncellenen: kargoGun, cekilen: liste.length, yeni, aktarilan, baglanan, guncellenen, eslesmedi, hatalar: hatalar.slice(0, 5) };
      } catch (err) {
        const m = String((err as Error).message || err).slice(0, 400);
        await rest(`entegrasyonlar?platform=eq.${encodeURIComponent(e.platform)}`, { method: "PATCH", body: JSON.stringify({ son_yanit: { ...(e.son_yanit || {}), siparis: { zaman: new Date().toISOString(), durum: `Sipariş hatası: ${m}` } } }) }).catch(() => {});
        sonuc[e.platform] = { hata: m };
      }
    }
    if (olaylar.length && !kuru) {
      const tek = olaylar.length === 1;
      await fetch(`${URL_}/functions/v1/bildirim`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(tek ? olaylar[0] : { baslik: `${olaylar.length} yeni platform bildirimi`, metin: olaylar.map((o) => `${o.baslik}: ${o.metin}`).join("\n").slice(0, 380), url: "#/platform-siparisler" }) }).catch(() => {});
    }
    return json({ sonuc, bildirim: olaylar.length });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
