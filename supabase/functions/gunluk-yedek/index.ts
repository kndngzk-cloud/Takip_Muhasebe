// Gunluk Excel yedegi: tum verileri .xlsx olarak "yedekler" klasorune yazar,
// 7 gunden eski yedekleri siler. Her gece pg_cron ile, istenirse uygulamadan
// (yonetici) elle tetiklenir. Dis kutuphane kullanmaz.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "yedekler";
const SAKLA_GUN = 7;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(path: string) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return await r.json();
}

// ---- yetki: cron anahtari ya da yonetici kullanici ----
async function yetkili(req: Request, body: Record<string, unknown>) {
  if (typeof body.token === "string" && body.token) {
    const [r] = await rest("sistem_ayar?select=deger&anahtar=eq.yedek_token");
    if (r && r.deger === body.token) return true;
  }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) return false;
  const user = await u.json();
  if (!user?.id) return false;
  const [p] = await rest(`profiller?select=rol&id=eq.${user.id}`);
  return p?.rol === "admin";
}

// ---- xlsx yazici (zip STORE + inlineStr) ----
const enc = new TextEncoder();
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files: Record<string, string>) {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const nb = enc.encode(name), data = enc.encode(content), c = crc(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const n = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
function xlsx(sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const x = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const col = (n: number) => { let s = ""; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const f: Record<string, string> = {};
  sheets.forEach((sh, si) => {
    const keys = sh.rows.length ? Object.keys(sh.rows[0]) : ["(bos)"];
    const rowXml = (vals: unknown[], r: number) => `<row r="${r}">${vals.map((v, c) => {
      const ref = col(c) + r;
      if (v === null || v === undefined || v === "") return "";
      if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 && !/^0\d/.test(v))) return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === "boolean") return `<c r="${ref}" t="inlineStr"><is><t>${v ? "Evet" : "Hayır"}</t></is></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join("")}</row>`;
    const body = [rowXml(keys, 1), ...sh.rows.map((r, i) => rowXml(keys.map((k) => r[k]), i + 2))].join("");
    f[`xl/worksheets/sheet${si + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`;
  });
  f["[Content_Types].xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  f["_rels/.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  f["xl/workbook.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  f["xl/_rels/workbook.xml.rels"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  f["xl/styles.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  return zip(f);
}

const TABLOLAR: [string, string, string][] = [
  ["Urunler", "v_stok", "select=kod,ad,kategori,birim,satis_fiyati,min_stok,toplam_giris,toplam_cikis,real_stok,bekleyen_siparis,sevk_sonrasi_stok,son_alis_fiyati,durum,aktif&order=kod"],
  ["Cariler", "v_cariler", "select=kod,unvan,tip,yetkili,telefon,eposta,sehir,adres,vergi_no,bakiye_r,bakiye_gr,bakiye,aktif,notlar&order=kod"],
  ["Siparisler", "v_siparisler", "select=fis_no,tarih,cari_kod,cari_unvan,fatura_tipi,para_birimi,kur,maliyet_yontemi,gonderim_sekli,sevk_sehri,durum,sevk_tarihi,kdv_orani,ara_toplam,kdv_tutari,genel_toplam,aciklama&order=fis_no"],
  ["Siparis Kalemleri", "siparis_kalemleri", "select=siparisler(fis_no),urunler(kod,ad),miktar,birim_fiyat,doviz_fiyat,tutar&order=id"],
  ["Stok Hareketleri", "stok_hareketleri", "select=tarih,urunler(kod,ad),tur,islem,fatura_tipi,kdv_orani,para_birimi,kur,doviz_maliyet,miktar,birim_maliyet,tedarikci,belge_no,aciklama,siparisler(fis_no)&order=tarih,id"],
  ["Cari Hareketler", "v_cari_ekstre", "select=tarih,cari_kod,cari_unvan,islem,fatura_tipi,belge_no,matrah,kdv_tutari,borc,alacak,para_birimi,kur,doviz_tutar,odeme_sekli,aciklama,yuruyen_bakiye&order=cari_kod,tarih,id"],
  ["Musteri Fiyatlari", "musteri_fiyatlari", "select=cariler(kod,unvan),urunler(kod,ad),fiyat,para_birimi,odeme_kosulu,tarih&order=id"],
  ["Fabrikalar", "v_fabrikalar", "select=ad,sehir,iletisim,siparis_toplam,odenen,bakiye,aktif_siparis,aktif,notlar&order=ad"],
  ["Ithalat Siparisleri", "v_cin_siparisler", "select=no,tarih,fabrika_ad,durum,para_birimi,kur,toplam,toplam_miktar,fabrika_odenen,fabrika_kalan,masraf_tl,nakliye_sekli,liman,konteyner_no,takip_no,tahmini_uretim,tahmini_yukleme,tahmini_varis,uretim_bitis,yukleme_tarihi,varis_tarihi,teslim_tarihi,aciklama&order=no"],
  ["Ithalat Kalemleri", "cin_kalemler", "select=cin_siparisler(no),urunler(kod,ad),miktar,birim_fiyat,vergi_tl&order=id"],
  ["Kasa", "kasa", "select=ad,para_birimi,tutar,kur,aciklama,guncelleme&order=sira,id"],
  ["Cek ve Platform", "v_nakit_girisleri", "select=tur,kaynak,belge_no,cari_kod,cari_unvan,kesideci,alis_tarihi,vade,tutar,para_birimi,kur,durum,tahsil_tarihi,ciro_edilen,aciklama&order=vade"],
  ["Odeme Plani", "v_odeme_takvimi", "select=yon,kategori,cin_no,fabrika_ad,fis_no,cari_unvan,aciklama,tetik,gun_sonra,yuzde,tutar_hesap,para_birimi,vade,vade_kesin,maliyete_dahil,odendi,odeme_tarihi,odenen_kur&order=id"],
];
const flat = (o: Record<string, unknown>, p = ""): Record<string, unknown> =>
  Object.entries(o).reduce((a, [k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? Object.assign(a, flat(v as Record<string, unknown>, p + k + "_")) : ((a[p + k] = v), a)), {} as Record<string, unknown>);

// Istanbul saatine gore YYYY-MM-DD
const gun = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await yetkili(req, body))) return json({ hata: "Yetkisiz" }, 401);

    const sheets = [];
    for (const [name, t, q] of TABLOLAR) sheets.push({ name, rows: (await rest(`${t}?${q}&limit=100000`)).map((r: Record<string, unknown>) => flat(r)) });
    const dosya = `yedek-${gun(new Date())}.xlsx`;
    const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${dosya}`, {
      method: "POST",
      headers: { ...H, "x-upsert": "true", "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: xlsx(sheets),
    });
    if (!up.ok) throw new Error(`Yükleme: ${up.status} ${await up.text()}`);

    // 7 gunden eski yedekleri sil (bugun dahil son 7 gun kalir)
    const sinir = gun(new Date(Date.now() - (SAKLA_GUN - 1) * 86400000));
    const ls = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "asc" } }),
    });
    const liste: { name: string }[] = ls.ok ? await ls.json() : [];
    const eski = liste.map((o) => o.name).filter((n) => /^yedek-\d{4}-\d{2}-\d{2}\.xlsx$/.test(n) && n.slice(6, 16) < sinir);
    if (eski.length) {
      await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: eski }),
      });
    }
    return json({ dosya, satir: sheets.reduce((a, s) => a + s.rows.length, 0), silinen: eski });
  } catch (e) {
    return json({ hata: String((e as Error).message || e) }, 500);
  }
});
