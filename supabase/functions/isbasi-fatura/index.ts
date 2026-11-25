// Logo Isbasi: programdaki siparisten e-Fatura / e-Arsiv fatura keser.
// Uygulamadan (yonetici) cagrilir. Eylemler:
//   { eylem: "test" }                     -> Isbasi'na giris yapmayi dener
//   { eylem: "kes", siparis_id: 123 }     -> siparisin faturasini keser, isbasi_faturalar'a yazar
// Ayarlar entegrasyonlar.platform='İşbaşı' satirinda: api_key, kullanici, sifre, sunucu, kargo_vkn, site
// Isbasi musterinin TCKN/VKN'sine bakip mukellefse e-Fatura, degilse e-Arsiv keser (API kagit faturaya izin vermez).
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
const num = (v: unknown) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const TEST_SUNUCU = "https://soho-isbasi-mwv2-test.logo-paas.com";
// Isbasi'na giden platform siparisleri: bunlarin faturasini pazaryeri ya da baska yer kesiyor
const HARIC = ["Hepsiburada", "Trendyol", "Koçtaş", "N11"];
// Ticimax OdemeTipi -> Isbasi e-Arsiv odeme sekli (1 kredi karti, 2 EFT/havale, 3 kapida odeme, 4 odeme aracisi, 99 diger)
const ODEME: Record<string, number> = { "0": 1, "1": 2, "2": 3 };

// yanit nesnesinde adi verilen alanlardan ilk dolu olani bulur (buyuk/kucuk harf duyarsiz, ic ice)
function ara(o: unknown, adlar: string[], derin = 0): string | null {
  if (!o || typeof o !== "object" || derin > 4) return null;
  const k = Object.keys(o as Record<string, unknown>);
  for (const ad of adlar) { const x = k.find((y) => y.toLowerCase() === ad.toLowerCase()); const v = x ? (o as Record<string, unknown>)[x] : null; if (v != null && v !== "" && typeof v !== "object") return String(v); }
  for (const y of k) { const r = ara((o as Record<string, unknown>)[y], adlar, derin + 1); if (r) return r; }
  return null;
}

type Oturum = { base: string; token: string; tenant: string; apiKey: string; ham: Record<string, unknown> };
async function giris(a: Record<string, string>): Promise<Oturum> {
  for (const k of ["api_key", "kullanici", "sifre"]) if (!a[k]) throw new Error(`İşbaşı ${({ api_key: "API anahtarı", kullanici: "kullanıcı (e-posta)", sifre: "şifre" } as Record<string, string>)[k]} girilmemiş`);
  const sunucu = String(a.sunucu || TEST_SUNUCU).trim().replace(/\/+$/, "").replace(/\/api\/.*$/, "");
  const r = await fetch(`${sunucu}/api/v1.0/user/integrationLogin`, { method: "POST", headers: { apiKey: a.api_key.trim(), "Content-Type": "application/json" }, body: JSON.stringify({ username: a.kullanici.trim(), password: a.sifre }) });
  const t = await r.text(); let j: Record<string, unknown> = {}; try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok || j.isError === true) throw new Error(`İşbaşı girişi başarısız (${r.status}): ${String(j.message || t).slice(0, 200)}`);
  const token = ara(j, ["accessToken", "access_token", "token"]);
  const tenant = ara(j, ["tenantId", "tenant_id", "tenant"]);
  if (!token) throw new Error(`İşbaşı girişi: yanıtta erişim anahtarı yok (alanlar: ${Object.keys((j.data as Record<string, unknown>) || j).join(", ")})`);
  let base = ara(j, ["baseUrl", "base_url", "serviceUrl", "apiUrl"]) || sunucu;
  base = base.replace(/\/+$/, "").replace(/\/api\/.*$/, ""); if (!/^https?:\/\//.test(base)) base = `https://${base}`;
  // yanittan gizli olmayan alan adlarini teshis icin sakla
  const ham = Object.fromEntries(Object.entries((j.data as Record<string, unknown>) || {}).map(([k, v]) => [k, /token|key|pass|sifre/i.test(k) ? "***" : typeof v === "object" ? "{…}" : v]));
  return { base, token, tenant: tenant || "", apiKey: a.api_key.trim(), ham };
}
async function isbasi(o: Oturum, yol: string, init: RequestInit = {}) {
  const r = await fetch(`${o.base}${yol}`, { ...init, headers: { Authorization: `Bearer ${o.token}`, tenantId: o.tenant, apiKey: o.apiKey, "Content-Type": "application/json; charset=utf-8", lang: "tr-TR", ...(init.headers || {}) } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  return { ok: r.ok && j?.isError !== true, status: r.status, j, t };
}

// il plaka sirasi: posta kodu bilinmiyorsa il merkezinin genel kodu (plaka + "000") gonderilir
const ILLER = "Adana,Adıyaman,Afyonkarahisar,Ağrı,Amasya,Ankara,Antalya,Artvin,Aydın,Balıkesir,Bilecik,Bingöl,Bitlis,Bolu,Burdur,Bursa,Çanakkale,Çankırı,Çorum,Denizli,Diyarbakır,Edirne,Elazığ,Erzincan,Erzurum,Eskişehir,Gaziantep,Giresun,Gümüşhane,Hakkari,Hatay,Isparta,Mersin,İstanbul,İzmir,Kars,Kastamonu,Kayseri,Kırklareli,Kırşehir,Kocaeli,Konya,Kütahya,Malatya,Manisa,Kahramanmaraş,Mardin,Muğla,Muş,Nevşehir,Niğde,Ordu,Rize,Sakarya,Samsun,Siirt,Sinop,Sivas,Tekirdağ,Tokat,Trabzon,Tunceli,Şanlıurfa,Uşak,Van,Yozgat,Zonguldak,Aksaray,Bayburt,Karaman,Kırıkkale,Batman,Şırnak,Bartın,Ardahan,Iğdır,Yalova,Karabük,Kilis,Osmaniye,Düzce".split(",");
const kucuk = (v: string) => v.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9]/g, "");
const ilBul = (v: string) => { const k = kucuk(v); if (!k) return -1; let i = ILLER.findIndex((x) => kucuk(x) === k); if (i < 0) i = ILLER.findIndex((x) => k.endsWith(kucuk(x))); return i; };
// adresten ilce: "…, Yüregir/Adana" ya da "… Selçuklu Konya" bicimleri
function ilceBul(adres: string, sehir: string) {
  const a = adres.replace(/\s+/g, " ").trim(); const sk = kucuk(sehir);
  const m = /([A-Za-zÇĞİÖŞÜçğıöşü.]+)\s*\/\s*([A-Za-zÇĞİÖŞÜçğıöşü.]+)/.exec(a);
  if (m && (!sk || kucuk(m[2]) === sk)) return m[1];
  const w = a.split(/[\s,]+/).filter(Boolean);
  for (let i = w.length - 1; i > 0; i--) if (kucuk(w[i]) === sk && kucuk(w[i - 1]) !== sk && !/^\d/.test(w[i - 1])) return w[i - 1];
  return "Merkez";
}
const posta = (adres: string, il: number) => /\b(\d{5})\b/.exec(adres)?.[1] || (il >= 0 ? String((il + 1) * 1000).padStart(5, "0") : "00000");
const bolAd = (ad: string) => { const p = ad.trim().split(/\s+/); return p.length > 1 ? { firstName: p.slice(0, -1).join(" "), lastName: p[p.length - 1] } : { firstName: ad.trim(), lastName: "." }; };
const tarihSaat = (d: Date) => new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 19).replace("T", " "); // Istanbul saati

async function faturaKes(siparisId: number, a: Record<string, string>, ek: Record<string, any> | null = null) {
  const ortam = String(a.sunucu || TEST_SUNUCU).includes("-test.") ? "test" : "canli";
  const [s] = await rest(`siparisler?select=*&id=eq.${siparisId}`);
  if (!s) throw new Error("Sipariş bulunamadı");
  if (s.fatura_tipi !== "R") throw new Error("Sadece R (faturalı) siparişlere fatura kesilir");
  if (s.durum === "İptal") throw new Error("İptal edilmiş siparişe fatura kesilmez");
  const onceki = await rest(`isbasi_faturalar?select=id,fatura_no&siparis_id=eq.${siparisId}&ortam=eq.${ortam}&durum=eq.Kesildi`);
  if (onceki.length) throw new Error(`Bu siparişin faturası zaten kesilmiş${onceki[0].fatura_no ? ` (${onceki[0].fatura_no})` : ""}`);
  const [c] = await rest(`cariler?select=*&id=eq.${s.cari_id}`);
  const kal = await rest(`siparis_kalemleri?select=*,urunler(kod,ad,birim)&siparis_id=eq.${siparisId}&order=id.asc`);
  if (!kal.length) throw new Error("Siparişte ürün yok");
  const [p] = await rest(`platform_siparisler?select=*&siparis_id=eq.${siparisId}&order=id.desc&limit=1`);
  if (p && HARIC.includes(p.platform)) throw new Error(`${p.platform} siparişinin faturası programdan kesilmiyor`);
  const site = !!p; // gradde.com.tr / eviyeshop.com: e-Arsiv internet satisi
  const kdv = Math.round(num(s.kdv_orani) * 100);
  const doviz = s.para_birimi && s.para_birimi !== "TRY";

  // musteri: site siparisinde fatura adresi, digerlerinde cari karti
  const fa = (p?.ham as any)?.fatura || {};
  const ad = String((site ? fa.firma || p.musteri || p.alici : c?.unvan) || "").trim();
  if (!ad) throw new Error("Müşteri adı yok");
  let vkn = String((site ? fa.vergi_no || p.vergi_no : c?.vergi_no) || "").replace(/\D/g, "");
  if (!site && !vkn) throw new Error(`${ad} carisinde vergi no / TC kimlik no yok. Cari kartına ekleyip tekrar deneyin.`);
  if (vkn && vkn.length !== 10 && vkn.length !== 11) throw new Error(`Vergi no / TCKN hatalı: ${vkn} (VKN 10, TCKN 11 hane olmalı)`);
  if (!vkn) vkn = "11111111111"; // bireysel, TCKN bilinmiyor (GIB kurali)
  const sahis = vkn.length === 11;
  const adres = String((site ? fa.adres || p.adres : c?.adres) || "").trim();
  let sehir = String((site ? p.sehir : c?.sehir) || "").trim();
  if (!sehir) { const w = adres.split(/[\s,/]+/).filter(Boolean); sehir = w.reverse().find((x) => ilBul(x) >= 0) || ""; }
  const il = ilBul(sehir);
  if (il >= 0) sehir = ILLER[il];
  if (!adres || !sehir) throw new Error(`${ad}: fatura için adres ve şehir gerekli${site ? "" : " (cari kartına ekleyin)"}`);
  const customer: Record<string, unknown> = {
    code: "", isPerson: sahis, name: ad, tcknVkn: vkn, taxOffice: String((site ? fa.vergi_dairesi : "") || ""),
    country: "Türkiye", city: sehir, district: ilceBul(adres, sehir), postalCode: posta(adres, il), address: adres,
    email: String((site ? p.eposta : c?.eposta) || ""), phone: String((site ? fa.telefon || p.telefon : c?.telefon) || ""),
    ...(sahis ? bolAd(ad) : {})
  };

  // satirlar: programdaki birim fiyatlar KDV haric; siparis iskontosu satirlara oranla dagitilir
  const brut = kal.reduce((t: number, k: any) => t + num(k.tutar), 0);
  const iskOran = brut > 0 && num(s.iskonto_tutar) > 0 ? r4((num(s.iskonto_tutar) / brut) * 100) : 0;
  const salesInvoiceDetails = kal.map((k: any) => ({
    quantity: num(k.miktar),
    price: doviz && k.doviz_fiyat != null ? r4(num(k.doviz_fiyat)) : r4(num(k.birim_fiyat)),
    taxRate: kdv,
    ...(iskOran ? { discountRate: iskOran } : {}),
    productDetail: { itemCode: k.urunler?.kod || `U${k.urun_id}`, name: k.urunler?.ad || "Ürün", vat: kdv, unit: k.urunler?.birim || "Adet", itemType: 1 }
  }));

  const simdi = new Date();
  const body: Record<string, unknown> = {
    invoiceId: 0,
    invoiceDate: tarihSaat(simdi),
    currency: doviz ? s.para_birimi : "TL",
    exchangeRate: doviz ? num(s.kur) || 1 : 1,
    vatIncluded: false,
    description: [site ? `${p.platform} sipariş no ${p.siparis_no}` : null, `Fiş ${s.fis_no}`].filter(Boolean).join(" · "),
    customer,
    salesInvoiceDetails
  };
  if (site) {
    // e-Arsiv internet satisi: odeme sekli/tarihi, web sitesi ve kargo (tasiyici) bilgisi zorunlu
    const odm = ((p.ham as any)?.odemeler || [])[0] || {};
    const kargoVkn = String(a.kargo_vkn || "").replace(/\D/g, "");
    if (kargoVkn.length !== 10) throw new Error("İnternet satışı faturası için kargo firmasının VKN'si gerekli: Ayarlar → İşbaşı → Kargo firması VKN");
    body.sendingDate = tarihSaat(p.sevk_tarihi ? new Date(p.sevk_tarihi) : simdi);
    // odeme tarihi: Isbasi bazi surumlerde fatura kokunde (paymentDate), bazilarinda eGovernmentInvoice icinde arar; ikisine de yazilir
    const odemeT = tarihSaat(new Date(odm.tarih ? `${odm.tarih}+03:00` : p.tarih || simdi));
    body.paymentDate = odemeT;
    body.eArchivePaymentDate = odemeT;
    body.eGovernmentInvoice = {
      invoiceTypeForEinvoice: 3,
      eArchivePaymentType: ODEME[String((p.ham as any)?.odeme_tipi ?? odm.tip ?? "0")] ?? 1,
      eArchivePaymentDate: odemeT,
      website: String(a.site || `www.${p.platform}`)
    };
    body.shipmentAgentItem = { firmType: 1, identifier: kargoVkn, title: String(a.kargo_ad || (/aras/i.test(p.kargo_firma || "") ? "ARAS KARGO YURT İÇİ YURT DIŞI TAŞIMACILIK A.Ş." : p.kargo_firma) || "Kargo").trim() };
  }

  // teshis: istege ek alanlar (sadece yonetici/token ile, deneme icin)
  if (ek && typeof ek === "object") for (const [k, v] of Object.entries(ek)) body[k] = v && typeof v === "object" && !Array.isArray(v) && body[k] && typeof body[k] === "object" ? { ...(body[k] as Record<string, unknown>), ...v } : v;
  const toplam = r2(num(s.genel_toplam));
  const o = await giris(a);
  const r = await isbasi(o, "/api/v1.0/invoices/integrationInvoices", { method: "POST", body: JSON.stringify(body) });
  const isbasiId = r.ok ? ara(r.j?.data ?? r.j, ["invoiceId", "id"]) : null;
  const kayit: Record<string, unknown> = {
    siparis_id: siparisId, ortam, durum: r.ok ? "Kesildi" : "Hata", isbasi_id: isbasiId, tur: site ? "e-Arşiv internet" : "e-Fatura / e-Arşiv",
    tutar: toplam, hata: r.ok ? null : String(r.j?.message || r.t || `HTTP ${r.status}`).slice(0, 500), istek: body, yanit: r.j ?? { ham: r.t.slice(0, 2000), status: r.status }
  };
  // fatura numarasi ve ETTN: kesilen faturayi sorgula
  if (r.ok && isbasiId) {
    const d = await isbasi(o, `/api/v1.0/invoices/${encodeURIComponent(isbasiId)}`).catch(() => null);
    if (d?.ok) { kayit.fatura_no = ara(d.j?.data, ["number", "invoiceNumber", "einvoiceNumber", "documentNumber"]); kayit.ettn = ara(d.j?.data, ["guid", "uuid", "ettn"]); }
  }
  const [yaz] = await rest("isbasi_faturalar", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(kayit) });
  return { ok: r.ok, fatura: { id: yaz.id, durum: yaz.durum, fatura_no: yaz.fatura_no, ettn: yaz.ettn, hata: yaz.hata, ortam } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);
    const [e] = await rest(`entegrasyonlar?select=ayar,son_yanit&platform=eq.${encodeURIComponent("İşbaşı")}`);
    const a = (e?.ayar || {}) as Record<string, string>;
    const durumYaz = (durum: string, ek: Record<string, unknown> = {}) => rest(`entegrasyonlar?platform=eq.${encodeURIComponent("İşbaşı")}`, { method: "PATCH", body: JSON.stringify({ son_calisma: new Date().toISOString(), son_durum: durum, son_yanit: { ...(e?.son_yanit || {}), ...ek } }) }).catch(() => {});
    if (body.eylem === "test") {
      try {
        const o = await giris(a);
        await durumYaz("Tamam · giriş başarılı", { giris: { zaman: new Date().toISOString(), base: o.base, tenant: !!o.tenant, alanlar: o.ham } });
        return json({ ok: true, mesaj: `İşbaşı girişi başarılı${String(a.sunucu || TEST_SUNUCU).includes("-test.") ? " (test ortamı)" : ""}` });
      } catch (err) { const m = err instanceof Error ? err.message : String(err); await durumYaz(`Hata: ${m}`); return json({ ok: false, hata: m }); }
    }
    if (body.eylem === "kes") {
      const id = Number(body.siparis_id); if (!id) return json({ hata: "siparis_id gerekli" }, 400);
      try { const r = await faturaKes(id, a, body.ek && typeof body.ek === "object" ? body.ek : null); return json(r); }
      catch (err) { return json({ ok: false, hata: err instanceof Error ? err.message : String(err) }); }
    }
    return json({ hata: "Bilinmeyen eylem" }, 400);
  } catch (err) { return json({ hata: err instanceof Error ? err.message : String(err) }, 500); }
});
