-- sermaye_ozet: eksiye dusen cikislar (alistan once tarihlenmis satis) sonraki girislerden dusulur; depodaki stok gercek stokla ayni olur (Supabase'e uygulandi, 16.11.2026)
CREATE OR REPLACE FUNCTION public.sermaye_ozet()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_yon text := coalesce((select maliyet_yontemi from public.ayarlar where id = 1), 'FIFO');
  r record; q numeric[]; c numeric[]; v_urun bigint := -1; v_son numeric; kalan numeric; al numeric; idx int; v_acik numeric := 0; v_gir numeric;
  st jsonb := '[]'::jsonb; v_deger numeric := 0; v_adet numeric := 0; v_eksik numeric := 0; d numeric; m numeric; e numeric; i int;
  yl jsonb; pf jsonb; pl jsonb; plb jsonb; al_top numeric; al_say int; borc_top numeric; borc_say int;
begin
  -- 1) stok: her urunun hareketleri sirayla oynatilir, cikislar FIFO/LIFO ile partilerden duser; kalan partiler maliyetiyle degerlenir.
  -- Eksiye dusen cikis (alistan once tarihlenmis satis) kaybolmaz: acik olarak tutulur ve sonraki girislerden once dusulur
  -- (kar raporundaki gibi). Boylece kalan miktar her zaman gercek stokla (giris - cikis, eksi ise 0) ayni olur.
  for r in
    select h.urun_id, h.tur, h.miktar, h.birim_maliyet, u.kod, u.ad, u.son_alis_fiyati
      from public.stok_hareketleri h
      join public.v_stok u on u.id = h.urun_id
      left join public.siparisler s on s.id = h.siparis_id
     where coalesce(u.stok_takibi, true) and not (coalesce(s.durum, '') = 'İptal' and h.islem in ('Sevk', 'İade'))
     order by h.urun_id, h.tarih, (h.tur = 'Çıkış'), h.id
  loop
    if r.urun_id <> v_urun then
      if v_urun <> -1 then
        d := 0; m := 0; e := 0;
        for i in 1 .. coalesce(array_length(q, 1), 0) loop
          m := m + q[i];
          if coalesce(c[i], v_son) is null then e := e + q[i]; else d := d + q[i] * coalesce(c[i], v_son); end if;
        end loop;
        if m > 0 then st := st || jsonb_build_object('urun_id', v_urun, 'miktar', m, 'deger', round(d, 2), 'maliyetsiz', e); v_deger := v_deger + d; v_adet := v_adet + m; v_eksik := v_eksik + e; end if;
      end if;
      v_urun := r.urun_id; q := '{}'; c := '{}'; v_son := r.son_alis_fiyati; v_acik := 0;
    end if;
    if r.tur = 'Giriş' then
      v_gir := r.miktar;
      if v_acik > 0 and v_gir > 0 then al := least(v_acik, v_gir); v_acik := v_acik - al; v_gir := v_gir - al; end if;
      if v_gir > 0 then q := q || v_gir; c := c || r.birim_maliyet; end if;
      if r.birim_maliyet is not null then v_son := r.birim_maliyet; end if;
    else
      kalan := r.miktar;
      while kalan > 0 and coalesce(array_length(q, 1), 0) > 0 loop
        idx := case when v_yon = 'LIFO' then array_length(q, 1) else 1 end;
        al := least(kalan, q[idx]); q[idx] := q[idx] - al; kalan := kalan - al;
        if q[idx] <= 0 then q := q[1:idx-1] || q[idx+1:array_length(q,1)]; c := c[1:idx-1] || c[idx+1:array_length(c,1)]; end if;
      end loop;
      if kalan > 0 then v_acik := v_acik + kalan; end if;
    end if;
  end loop;
  if v_urun <> -1 then
    d := 0; m := 0; e := 0;
    for i in 1 .. coalesce(array_length(q, 1), 0) loop
      m := m + q[i];
      if coalesce(c[i], v_son) is null then e := e + q[i]; else d := d + q[i] * coalesce(c[i], v_son); end if;
    end loop;
    if m > 0 then st := st || jsonb_build_object('urun_id', v_urun, 'miktar', m, 'deger', round(d, 2), 'maliyetsiz', e); v_deger := v_deger + d; v_adet := v_adet + m; v_eksik := v_eksik + e; end if;
  end if;

  -- 2) yoldaki ithalat: teslim alinmamis siparisler icin fabrikaya ve masraflara yapilmis odemeler (TL)
  select coalesce(jsonb_agg(x order by x->>'tarih'), '[]'::jsonb) into yl from (
    select jsonb_build_object('id', cs.id, 'no', cs.no, 'kod', cs.kod, 'durum', cs.durum, 'tarih', cs.tarih, 'fabrika', cs.fabrika_ad, 'pb', cs.para_birimi,
             'toplam', cs.toplam, 'fabrika_odenen', cs.fabrika_odenen, 'fabrika_kalan', cs.fabrika_kalan,
             'fabrika_tl', coalesce((select sum(o.tutar_tl) from public.v_odeme_takvimi o where o.cin_siparis_id = cs.id and o.kategori = 'Fabrika' and o.odendi), 0),
             'masraf_tl', coalesce((select sum(o.tutar_tl) from public.v_odeme_takvimi o where o.cin_siparis_id = cs.id and o.kategori <> 'Fabrika' and o.yon = 'Ödeme' and o.odendi), 0)) x
      from public.v_cin_siparisler cs where cs.durum not in ('Teslim Alındı', 'İptal')) t;

  -- 3) musteri alacaklari ve (bilgi icin) bizim borclarimiz
  select coalesce(sum(bakiye), 0), count(*) into al_top, al_say from public.v_cariler where bakiye > 0.005;
  select coalesce(-sum(bakiye), 0), count(*) into borc_top, borc_say from public.v_cariler where bakiye < -0.005;

  -- 4) portfoydeki cek/senet (tahsil edilmemis, ciro edilmemis) ve platformlardan yatacaklar
  select coalesce(jsonb_agg(x), '[]'::jsonb) into pf from (
    select jsonb_build_object('tur', coalesce(tur, 'Çek'), 'adet', count(*), 'tl', round(sum(tutar * case when coalesce(para_birimi, 'TRY') = 'TRY' then 1 else coalesce(nullif(kur, 0), (select (a.doviz_kur->>para_birimi)::numeric from public.ayarlar a where a.id = 1), 1) end), 2), 'en_yakin', min(vade)) x
      from public.nakit_girisleri where durum = 'Bekliyor' and coalesce(tur, 'Çek') <> 'Platform' group by coalesce(tur, 'Çek')) t;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into pl from (
    select jsonb_build_object('kaynak', coalesce(kaynak, 'Platform'), 'adet', count(*), 'tl', round(sum(tutar * case when coalesce(para_birimi, 'TRY') = 'TRY' then 1 else coalesce(nullif(kur, 0), (select (a.doviz_kur->>para_birimi)::numeric from public.ayarlar a where a.id = 1), 1) end), 2),
             'hesapta', round(coalesce(sum(tutar) filter (where yatti_tarihi is not null), 0), 2)) x
      from public.nakit_girisleri where durum = 'Bekliyor' and tur = 'Platform' group by coalesce(kaynak, 'Platform')) t;
  -- henuz teslim edilmemis pazaryeri siparisleri: teslimden sonra hakedise girer (net tahmini; site siparisleri PayTR, Koctas kargolaninca hakedis listesinde zaten var)
  select coalesce(jsonb_agg(x), '[]'::jsonb) into plb from (
    select jsonb_build_object('platform', platform, 'adet', count(*), 'tl', round(sum(coalesce(net, brut - coalesce(komisyon, 0) - coalesce(kargo_kesinti, kargo_tahmin, 0))), 2)) x
      from public.platform_siparisler where durum = 'Aktarıldı' and teslim_tarihi is null and iade_durum is null and platform not in ('gradde.com.tr', 'eviyeshop.com', 'Koçtaş') group by platform) t;

  return jsonb_build_object('portfoy', pf, 'platform', pl, 'platform_teslim', plb, 'yontem', v_yon,
    'stok', jsonb_build_object('deger', round(v_deger, 2), 'adet', v_adet, 'maliyetsiz_adet', v_eksik, 'urunler', st),
    'yolda', yl, 'alacak', jsonb_build_object('toplam', al_top, 'cari', al_say), 'borc', jsonb_build_object('toplam', borc_top, 'cari', borc_say));
end
 $function$;
