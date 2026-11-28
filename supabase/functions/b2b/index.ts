// B2B BAYİ PORTALI (bayi.html) — herkese acik, kullanici adi + sifre ile girilen oturum anahtariyla (t) dogrular.
// Musteri sadece kendi carisinin verisini gorur; ne yapabilecegini yonetici b2b_kullanicilari.yetkiler ile secer.
//  POST {islem:"giris", kullanici, sifre}            -> { t }
//  POST {islem:"bilgi", t}                           -> kullanici, cari, yetkiler, bakiye (yetkiye gore), gonderim secenekleri
//  POST {islem:"urunler", t}                         -> musteriye ozel fiyatli urunler (yetki varsa liste fiyatli diger urunler), stok durumu
//  POST {islem:"siparis_ver", t, kalemler:[{urun_id, miktar}], fatura_tipi, gonderim_sekli, aciklama}
//       -> fiyatlar SUNUCUDA musteriye ozel fiyattan hesaplanir (istemciden gelen fiyat kullanilmaz). Talep "Onay bekliyor" olur;
//          otomatik onay yetkisi varsa (ve risk limiti asilmiyorsa) hemen gercek siparis acilir.
//  POST {islem:"siparislerim", t}                    -> talepler + siparisler (durum, sevk tarihi, gonderim)
//  POST {islem:"siparis_detay", t, id} | {islem:"talep_detay", t, id}
//  POST {islem:"talep_iptal", t, id}                 -> onay bekleyen talebini iptal eder
//  POST {islem:"ekstre", t, tip:"R"|"GR"}            -> cari hareketleri, yuruyen bakiye
//  POST {islem:"odeme", t, tip:"R"|"GR"}             -> kartla odeme sayfasi (odeme.html) anahtari (tip: odemenin dusecegi hesap)
//  POST {islem:"sifre", t, eski, yeni}               -> { t } (yeni oturum anahtari)
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Kullanici extends Error {}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) {
    // veritabanindaki "raise exception" mesajlari (Türkçe, kullaniciya yonelik) aynen gosterilir
    try { const j = JSON.parse(t); if (j.code === "P0001" && j.message) throw new Kullanici(j.message); } catch (e) { if (e instanceof Kullanici) throw e; }
    throw new Error(`${path.split("?")[0]}: ${r.status} ${t.slice(0, 300)}`);
  }
  return t ? JSON.parse(t) : null;
}
const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const VARS = { siparis: true, oto_onay: false, tum_urunler: false, stok: true, siparislerim: true, ekstre_r: true, ekstre_gr: false, kart_odeme: false, odeme_tipi: "R", max_taksit: 1, fatura: "R" };
type Yetki = typeof VARS;
const yetki = (y: Record<string, unknown>): Yetki => {
  const v = { ...VARS, ...(y || {}) } as Yetki;
  if (!["R", "GR", "ikisi"].includes(v.fatura)) v.fatura = "R";
  if (!["R", "GR", "ikisi"].includes(v.odeme_tipi)) v.odeme_tipi = "R";
  v.max_taksit = Math.min(3, Math.max(1, Math.round(n(v.max_taksit) || 1)));
  return v;
};
const faturalar = (y: Yetki) => (y.fatura === "ikisi" ? ["R", "GR"] : [y.fatura]);
// musterinin gorebilecegi fatura tipleri (siparis gecmisi ve bakiye icin)
const gorulen = (y: Yetki) => Array.from(new Set([...(y.ekstre_r ? ["R"] : []), ...(y.ekstre_gr ? ["GR"] : []), ...(y.siparis ? faturalar(y) : [])]));

async function ayar() {
  const [a] = await rest("ayarlar?select=firma_adi,kdv_orani,gonderim_sekilleri,doviz_kur,odeme_link&id=eq.1").catch(() => [null]);
  return a || {};
}
// Musteriye fiyat: musteriye ozel fiyat (doviz ise guncel kurla TL), yetki varsa diger urunler icin liste fiyati.
// Yonetici bu cari icin urun secimi yaptiysa (b2b_urun_secimi.aktif) SADECE secilen urunler gorunur; ozel fiyati yoksa liste fiyatiyla.
async function katalog(cariId: number, y: Yetki, a: Record<string, any>) {
  const mf = await rest(`musteri_fiyatlari?select=urun_id,fiyat,para_birimi,odeme_kosulu&cari_id=eq.${cariId}`);
  const [sec] = await rest(`b2b_urun_secimi?select=aktif,urunler&cari_id=eq.${cariId}`).catch(() => []);
  const secili: Set<number> | null = sec?.aktif ? new Set((sec.urunler || []).map(Number)) : null;
  const urun = await rest(`v_stok?select=id,kod,ad,kategori,birim,satis_fiyati,min_stok,sevk_sonrasi_stok,yolda,stok_takibi&aktif=is.true&order=ad.asc&limit=5000`);
  const kur = (pb: string) => (pb === "TRY" ? 1 : n(a.doviz_kur?.[pb]));
  const M = new Map(mf.map((x: Record<string, any>) => [x.urun_id, x]));
  const liste: Record<string, any>[] = [];
  for (const u of urun) {
    if (secili && !secili.has(u.id)) continue;
    const m = M.get(u.id) as Record<string, any> | undefined;
    let fiyat: number | null = null, pb = "TRY", doviz: number | null = null, k = 1, ozel = false;
    if (m && n(m.fiyat) > 0) {
      pb = m.para_birimi || "TRY"; k = kur(pb);
      if (!(k > 0)) continue; // kur yoksa fiyat verilemez
      doviz = pb === "TRY" ? null : n(m.fiyat); fiyat = r2(n(m.fiyat) * k); ozel = true;
    } else if ((secili || y.tum_urunler) && n(u.satis_fiyati) > 0) fiyat = r2(n(u.satis_fiyati));
    if (fiyat === null) continue;
    const s = n(u.sevk_sonrasi_stok);
    const stok = !y.stok || u.stok_takibi === false ? null : s > Math.max(0, n(u.min_stok)) ? "Var" : s > 0 ? "Az" : n(u.yolda) > 0 ? "Yolda" : "Yok";
    liste.push({ id: u.id, kod: u.kod || "", ad: u.ad, kategori: u.kategori || "", birim: u.birim || "Adet", fiyat, pb, doviz_fiyat: doviz, kur: pb === "TRY" ? null : k, ozel, kosul: m?.odeme_kosulu || "", stok });
  }
  return liste;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ hata: "Geçersiz istek" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    if (b.islem === "giris") {
      const k = String(b.kullanici || "").trim(), s = String(b.sifre || "");
      if (!k || !s) return json({ hata: "Kullanıcı adı ve şifreyi girin." }, 400);
      const t = await rest("rpc/b2b_giris", { method: "POST", body: JSON.stringify({ p_kullanici: k, p_sifre: s }) });
      if (!t) { await new Promise((r) => setTimeout(r, 1200)); return json({ hata: "Kullanıcı adı ya da şifre hatalı." }, 401); }
      return json({ t });
    }
    if (typeof b.t !== "string" || !/^[a-f0-9]{32}$/.test(b.t)) return json({ hata: "Oturum bulunamadı. Tekrar giriş yapın." }, 404);
    const [u] = await rest(`b2b_kullanicilari?select=id,cari_id,ad,kullanici,aktif,yetkiler,odeme_link_id&token=eq.${b.t}`);
    if (!u) return json({ hata: "Oturumunuz sona erdi (şifre değişmiş olabilir). Tekrar giriş yapın." }, 404);
    if (!u.aktif) return json({ hata: "Hesabınız kapatılmış. Firmayla iletişime geçin." }, 410);
    const y = yetki(u.yetkiler);
    const [c] = await rest(`v_cariler?select=id,kod,unvan,sehir,adres,telefon,eposta,bakiye_r,bakiye_gr,sevk_bekleyen,risk_limiti,risk_toplam,aktif&id=eq.${u.cari_id}`);
    if (!c) return json({ hata: "Cari hesabınız bulunamadı. Firmayla iletişime geçin." }, 410);
    const yok = () => json({ hata: "Bu işlem için yetkiniz yok." }, 403);

    if (b.islem === "bilgi") {
      const a = await ayar();
      const bek = await rest(`b2b_talepler?select=id&cari_id=eq.${c.id}&durum=eq.${encodeURIComponent("Onay bekliyor")}`).catch(() => []);
      const ol = (a.odeme_link || {}) as Record<string, string>;
      return json({
        ad: u.ad, kullanici: u.kullanici, firma: (a.firma_adi || "").trim(), cari: { kod: c.kod, unvan: c.unvan, sehir: c.sehir || "" },
        yetkiler: { ...y, oto_onay: undefined }, fatura_secenek: faturalar(y), kdv_orani: n(a.kdv_orani),
        gonderimler: Array.isArray(a.gonderim_sekilleri) ? a.gonderim_sekilleri : [],
        bakiye: { r: y.ekstre_r ? r2(n(c.bakiye_r)) : null, gr: y.ekstre_gr ? r2(n(c.bakiye_gr)) : null },
        onay_bekleyen: bek.length, iletisim: { web: ol.web || "", telefon: ol.telefon || "", eposta: ol.eposta || "" },
      });
    }

    if (b.islem === "urunler") {
      if (!y.siparis) return yok();
      return json({ urunler: await katalog(c.id, y, await ayar()) });
    }

    if (b.islem === "siparis_ver") {
      if (!y.siparis) return yok();
      const ft = faturalar(y).includes(b.fatura_tipi) ? b.fatura_tipi : faturalar(y)[0];
      const gel = Array.isArray(b.kalemler) ? b.kalemler : [];
      if (!gel.length) return json({ hata: "Siparişe en az bir ürün ekleyin." }, 400);
      if (gel.length > 200) return json({ hata: "Bir siparişte en fazla 200 kalem olabilir." }, 400);
      const son = await rest(`b2b_talepler?select=id&kullanici_id=eq.${u.id}&olusturma=gte.${new Date(Date.now() - 3600e3).toISOString()}`);
      if (son.length >= 20) return json({ hata: "Çok fazla sipariş gönderildi, biraz sonra tekrar deneyin." }, 429);
      const a = await ayar();
      const K = new Map((await katalog(c.id, y, a)).map((x) => [x.id, x]));
      const birles = new Map<number, number>();
      for (const k of gel) {
        const id = Math.round(n(k?.urun_id)), m = r2(n(k?.miktar));
        if (!K.has(id)) return json({ hata: "Listede olmayan bir ürün seçildi. Sayfayı yenileyip tekrar deneyin." }, 400);
        if (!(m > 0) || m > 100000) return json({ hata: `${K.get(id)!.ad}: miktarı kontrol edin.` }, 400);
        birles.set(id, r2((birles.get(id) || 0) + m));
      }
      const kalemler = Array.from(birles, ([id, miktar]) => {
        const x = K.get(id)!;
        return { urun_id: id, kod: x.kod, ad: x.ad, birim: x.birim, miktar, birim_fiyat: x.fiyat, pb: x.pb, doviz_fiyat: x.doviz_fiyat, kur: x.kur };
      });
      const ara = r2(kalemler.reduce((t, k) => t + r2(k.miktar * k.birim_fiyat), 0));
      const kdvO = ft === "R" ? n(a.kdv_orani) : 0, kdv = r2(ara * kdvO), genel = r2(ara + kdv);
      const gonderimler: string[] = Array.isArray(a.gonderim_sekilleri) ? a.gonderim_sekilleri : [];
      const gon = gonderimler.includes(b.gonderim_sekli) ? b.gonderim_sekli : null;
      const aciklama = String(b.aciklama || "").trim().slice(0, 500) || null;
      // otomatik onay: risk limiti tanimliysa ve bu siparisle asiliyorsa onaya duser
      const riskAsim = c.risk_limiti !== null && n(c.risk_toplam) + genel > n(c.risk_limiti) + 0.005;
      const oto = !!y.oto_onay && !riskAsim;
      const [t] = await rest("b2b_talepler", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        cari_id: c.id, kullanici_id: u.id, kullanici_ad: u.ad, kalemler, fatura_tipi: ft, gonderim_sekli: gon, aciklama,
        ara_toplam: ara, kdv_orani: kdvO, kdv_tutari: kdv, genel_toplam: genel, oto }) });
      if (oto) {
        try {
          const r = await rest("rpc/b2b_talep_onayla", { method: "POST", body: JSON.stringify({ p_id: t.id }) });
          return json({ ok: true, id: t.id, durum: "Onaylandı", fis_no: r?.fis_no, genel_toplam: n(r?.genel_toplam) || genel });
        } catch (e) {
          console.error("oto onay", e);
          await rest(`b2b_talepler?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ oto: false }) }).catch(() => {});
        }
      }
      return json({ ok: true, id: t.id, durum: "Onay bekliyor", genel_toplam: genel, risk: riskAsim && !!y.oto_onay });
    }

    if (b.islem === "siparislerim") {
      if (!y.siparislerim && !y.siparis) return yok();
      const talep = await rest(`b2b_talepler?select=id,olusturma,durum,fatura_tipi,genel_toplam,kalemler,red_nedeni,siparis_id,kullanici_ad,gonderim_sekli&cari_id=eq.${c.id}&order=olusturma.desc&limit=100`);
      const tipler = gorulen(y);
      let sip: Record<string, any>[] = [];
      if (y.siparislerim && tipler.length) {
        sip = await rest(`v_siparisler?select=id,fis_no,tarih,durum,fatura_tipi,genel_toplam,para_birimi,doviz_toplam,sevk_tarihi,gonderim_sekli,urun_ozet,kalem_sayisi&cari_id=eq.${c.id}&fatura_tipi=in.(${tipler.join(",")})&order=tarih.desc,id.desc&limit=200`);
      }
      return json({
        talepler: talep.filter((x: Record<string, any>) => x.durum !== "Onaylandı" || !y.siparislerim).map((x: Record<string, any>) => ({ id: x.id, zaman: x.olusturma, durum: x.durum, fatura_tipi: x.fatura_tipi, genel_toplam: n(x.genel_toplam), kalem: x.kalemler?.length || 0,
          ozet: (x.kalemler || []).slice(0, 3).map((k: Record<string, any>) => `${k.ad} × ${k.miktar}`).join(", "), red_nedeni: x.red_nedeni || "", kim: x.kullanici_ad || "", siparis_id: x.siparis_id })),
        siparisler: sip.map((s) => ({ id: s.id, fis_no: s.fis_no, tarih: s.tarih, durum: s.durum, fatura_tipi: s.fatura_tipi, genel_toplam: n(s.genel_toplam), para_birimi: s.para_birimi, doviz_toplam: s.doviz_toplam,
          sevk_tarihi: s.sevk_tarihi, gonderim: s.gonderim_sekli || "", ozet: s.urun_ozet || "", kalem: s.kalem_sayisi })),
      });
    }

    if (b.islem === "talep_detay") {
      const [x] = await rest(`b2b_talepler?select=*&id=eq.${Math.round(n(b.id))}&cari_id=eq.${c.id}`);
      if (!x) return json({ hata: "Sipariş bulunamadı." }, 404);
      return json({ id: x.id, zaman: x.olusturma, durum: x.durum, fatura_tipi: x.fatura_tipi, gonderim: x.gonderim_sekli || "", aciklama: x.aciklama || "", red_nedeni: x.red_nedeni || "", kim: x.kullanici_ad || "",
        kalemler: (x.kalemler || []).map((k: Record<string, any>) => ({ urun_id: k.urun_id, kod: k.kod, ad: k.ad, birim: k.birim, miktar: n(k.miktar), birim_fiyat: n(k.birim_fiyat), tutar: r2(n(k.miktar) * n(k.birim_fiyat)), pb: k.pb, doviz_fiyat: k.doviz_fiyat })),
        ara_toplam: n(x.ara_toplam), kdv_tutari: n(x.kdv_tutari), genel_toplam: n(x.genel_toplam), siparis_id: x.siparis_id });
    }

    if (b.islem === "siparis_detay") {
      if (!y.siparislerim) return yok();
      const tipler = gorulen(y);
      const [s] = await rest(`v_siparisler?select=id,fis_no,tarih,durum,fatura_tipi,genel_toplam,ara_toplam,kdv_tutari,kdv_orani,iskonto_tutar,nakliye_tutar,para_birimi,kur,doviz_toplam,sevk_tarihi,gonderim_sekli&id=eq.${Math.round(n(b.id))}&cari_id=eq.${c.id}`);
      if (!s || !tipler.includes(s.fatura_tipi)) return json({ hata: "Sipariş bulunamadı." }, 404);
      const kal = await rest(`siparis_kalemleri?select=urun_id,miktar,birim_fiyat,tutar,doviz_fiyat,urunler(kod,ad,birim)&siparis_id=eq.${s.id}&order=id.asc`);
      return json({ ...s,
        kalemler: kal.map((k: Record<string, any>) => ({ urun_id: k.urun_id, kod: k.urunler?.kod || "", ad: k.urunler?.ad || "", birim: k.urunler?.birim || "", miktar: n(k.miktar), birim_fiyat: n(k.birim_fiyat), tutar: n(k.tutar), doviz_fiyat: k.doviz_fiyat })) });
    }

    if (b.islem === "talep_iptal") {
      const r = await rest(`b2b_talepler?id=eq.${Math.round(n(b.id))}&cari_id=eq.${c.id}&durum=eq.${encodeURIComponent("Onay bekliyor")}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ durum: "İptal", karar_zamani: new Date().toISOString() }) });
      if (!r?.length) return json({ hata: "Bu sipariş artık iptal edilemez (onaylanmış olabilir). Firmayla iletişime geçin." }, 409);
      return json({ ok: true });
    }

    if (b.islem === "ekstre") {
      const tip = b.tip === "GR" ? "GR" : "R";
      if (!(tip === "R" ? y.ekstre_r : y.ekstre_gr)) return yok();
      const h = await rest(`v_cari_ekstre?select=id,tarih,islem,belge_no,borc,alacak,odeme_sekli,aciklama,yuruyen_bakiye_tip,sevk_bekliyor,ithalat_bekliyor,para_birimi,kur,doviz_tutar,siparis_id&cari_id=eq.${c.id}&fatura_tipi=eq.${tip}&order=tarih.asc,id.asc&limit=5000`);
      return json({ tip, bakiye: r2(n(tip === "R" ? c.bakiye_r : c.bakiye_gr)), hareketler: h.map((x: Record<string, any>) => ({
        tarih: x.tarih, islem: x.islem, belge: x.belge_no || "", borc: n(x.borc), alacak: n(x.alacak), odeme_sekli: x.odeme_sekli || "", aciklama: x.aciklama || "",
        bakiye: n(x.yuruyen_bakiye_tip), bekliyor: !!x.sevk_bekliyor, ithalat: !!x.ithalat_bekliyor,
        doviz: x.para_birimi && x.para_birimi !== "TRY" && x.doviz_tutar !== null ? { pb: x.para_birimi, tutar: n(x.doviz_tutar), kur: n(x.kur) } : null, siparis_id: x.siparis_id })) });
    }

    if (b.islem === "odeme") {
      if (!y.kart_odeme) return yok();
      // odeme_tipi "ikisi" ise musteri R ya da GR hesabina odemeyi secer; her hesap icin ayri odeme linki tutulur
      const izinli = y.odeme_tipi === "ikisi" ? ["R", "GR"] : [y.odeme_tipi];
      const tip = izinli.includes(b.tip) ? b.tip : izinli[0];
      const ist = { cari_id: c.id, fatura_tipi: tip, max_taksit: y.max_taksit, bakiye_goster: tip === "R" ? y.ekstre_r : y.ekstre_gr, aktif: true };
      const isaret = `Bayi portalı #${u.id} · ${tip}`; // linkin adi (yonetici odeme linkleri listesinde gorur; musteriye gosterilmez)
      const SEC = "id,token,fatura_tipi,max_taksit,bakiye_goster,aktif,cari_id";
      let [l] = await rest(`odeme_linkleri?select=${SEC}&cari_id=eq.${c.id}&ad=eq.${encodeURIComponent(isaret)}&order=id.desc&limit=1`);
      if (!l && u.odeme_link_id) { // ilk surumde acilan link (tek hesap)
        const [e] = await rest(`odeme_linkleri?select=${SEC}&id=eq.${u.odeme_link_id}`);
        if (e && e.cari_id === c.id && e.fatura_tipi === tip) { l = e; await rest(`odeme_linkleri?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ ad: isaret }) }); }
      }
      if (!l) {
        [l] = await rest("odeme_linkleri", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...ist, ad: isaret, aciklama: "Bayi portalından kartla ödeme" }) });
        if (!u.odeme_link_id) await rest(`b2b_kullanicilari?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ odeme_link_id: l.id }) });
      } else if (l.max_taksit !== ist.max_taksit || l.bakiye_goster !== ist.bakiye_goster || !l.aktif) {
        await rest(`odeme_linkleri?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ max_taksit: ist.max_taksit, bakiye_goster: ist.bakiye_goster, aktif: true }) });
      }
      return json({ token: l.token, tip });
    }

    if (b.islem === "sifre") {
      const t = await rest("rpc/b2b_sifre_degistir", { method: "POST", body: JSON.stringify({ p_token: b.t, p_eski: String(b.eski || ""), p_yeni: String(b.yeni || "") }) });
      if (!t) return json({ hata: "Mevcut şifreniz hatalı." }, 400);
      return json({ t });
    }
    return json({ hata: "Geçersiz istek" }, 400);
  } catch (e) {
    if (e instanceof Kullanici) return json({ hata: e.message }, 400);
    console.error(e);
    return json({ hata: "Bir hata oluştu, lütfen tekrar deneyin." }, 500);
  }
});
