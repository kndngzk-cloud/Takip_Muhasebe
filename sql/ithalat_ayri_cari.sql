-- Ithalat siparisine bagli (cin_siparis_id dolu) ve henuz sevk edilmemis (Beklemede) musteri siparislerinin
-- TUM cari hareketleri (otomatik satis borcu + o siparise alinan tahsilatlar + kur farki) normal cari bakiyesine girmez;
-- siparisin kendi hesabinda izlenir ("sevk bekleyen"). Siparis sevk edilince hepsi birlikte normal bakiyeye gecer.
-- Normal (ithalatsiz) siparislerde eski kural aynen: sadece otomatik satis kaydi bekler.
-- v_cariler.ithalat_tahsil: bu sekilde bekleyen tahsilatlarin neti (sermaye raporunda musteri avansi olarak dusulur).

create or replace view public.v_cariler with (security_invoker = true) as
 select c.id, c.kod, c.unvan, c.tip, c.yetkili, c.telefon, c.eposta, c.sehir, c.adres, c.vergi_no, c.aktif, c.notlar, c.olusturma,
    coalesce(h.borc_r, 0) - coalesce(h.alacak_r, 0) as bakiye_r,
    coalesce(h.borc_gr, 0) - coalesce(h.alacak_gr, 0) as bakiye_gr,
    coalesce(h.borc, 0) as toplam_borc,
    coalesce(h.alacak, 0) as toplam_odeme,
    coalesce(h.borc, 0) - coalesce(h.alacak, 0) as bakiye,
    h.son_hareket,
    case when coalesce(h.borc, 0) - coalesce(h.alacak, 0) > 0.005 then 'Borçlu'::text
         when coalesce(h.borc, 0) - coalesce(h.alacak, 0) < -0.005 then 'Alacaklı'::text
         else 'Kapalı'::text end as durum,
    coalesce(h.bek_borc, 0) - coalesce(h.bek_alacak, 0) as sevk_bekleyen,
    coalesce(h.bek_sayi, 0::bigint) as sevk_bekleyen_sayi,
    c.risk_limiti,
    coalesce(h.borc, 0) - coalesce(h.alacak, 0) + (coalesce(h.bek_borc, 0) - coalesce(h.bek_alacak, 0)) as risk_toplam,
    coalesce(h.ith_tahsil, 0) as ithalat_tahsil
   from public.cariler c
   left join (
     select x.cari_id,
        sum(x.borc) filter (where not x.bek) as borc,
        sum(x.alacak) filter (where not x.bek) as alacak,
        sum(x.borc) filter (where not x.bek and x.fatura_tipi = 'R') as borc_r,
        sum(x.alacak) filter (where not x.bek and x.fatura_tipi = 'R') as alacak_r,
        sum(x.borc) filter (where not x.bek and x.fatura_tipi = 'GR') as borc_gr,
        sum(x.alacak) filter (where not x.bek and x.fatura_tipi = 'GR') as alacak_gr,
        sum(x.borc) filter (where x.bek) as bek_borc,
        sum(x.alacak) filter (where x.bek) as bek_alacak,
        count(distinct x.siparis_id) filter (where x.bek and x.islem = 'Satış') as bek_sayi,
        sum(x.alacak - x.borc) filter (where x.bek and not x.otomatik) as ith_tahsil,
        max(x.tarih) as son_hareket
       from (select h_1.*, (h_1.siparis_id is not null and s.durum = 'Beklemede' and (h_1.otomatik or s.cin_siparis_id is not null)) as bek
               from public.cari_hareketler h_1
               left join public.siparisler s on s.id = h_1.siparis_id) x
      group by x.cari_id) h on h.cari_id = c.id;

create or replace view public.v_cari_ekstre with (security_invoker = true) as
 select h.id, h.tarih, h.cari_id, h.islem, h.fatura_tipi, h.belge_no, h.matrah, h.kdv_tutari, h.borc, h.alacak, h.odeme_sekli, h.aciklama,
    h.otomatik, h.siparis_id, h.olusturan, h.olusturma, h.para_birimi, h.kur, h.doviz_tutar,
    c.kod as cari_kod, c.unvan as cari_unvan,
    sum(case when b.bek then 0::numeric else h.borc - h.alacak end) over (partition by h.cari_id order by h.tarih, h.id) as yuruyen_bakiye,
    sum(case when b.bek then 0::numeric else h.borc - h.alacak end) over (partition by h.cari_id, h.fatura_tipi order by h.tarih, h.id) as yuruyen_bakiye_tip,
    b.bek as sevk_bekliyor,
    (b.bek and s.cin_siparis_id is not null) as ithalat_bekliyor
   from public.cari_hareketler h
   join public.cariler c on c.id = h.cari_id
   left join public.siparisler s on s.id = h.siparis_id
   cross join lateral (select (h.siparis_id is not null and coalesce(s.durum, '') = 'Beklemede' and (h.otomatik or s.cin_siparis_id is not null)) as bek) b;

-- Sermaye: ithalat siparisine alinan tahsilat kasada; musteri alacagindan avans olarak dusulmeye devam eder (cift sayilmasin)
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.sermaye_ozet'::regproc);
  d := replace(d, 'select coalesce(sum(bakiye), 0), count(*) into al_top, al_say from public.v_cariler where bakiye > 0.005;',
                  'select coalesce(sum(bakiye - ithalat_tahsil), 0), count(*) into al_top, al_say from public.v_cariler where bakiye - ithalat_tahsil > 0.005;');
  d := replace(d, 'select coalesce(-sum(bakiye), 0), count(*) into borc_top, borc_say from public.v_cariler where bakiye < -0.005;',
                  'select coalesce(-sum(bakiye - ithalat_tahsil), 0), count(*) into borc_top, borc_say from public.v_cariler where bakiye - ithalat_tahsil < -0.005;');
  if position('ithalat_tahsil' in d) = 0 then raise exception 'sermaye_ozet guncellenemedi'; end if;
  execute d;
end $do$;

-- v_siparisler'e siparise bagli TL tahsilat toplami (tahsil_tl) eklendi: mevcut tanimin sonuna
--   COALESCE((SELECT sum(h.alacak) FROM cari_hareketler h WHERE h.siparis_id = s.id AND h.islem = 'Tahsilat'), 0) AS tahsil_tl
-- (pg_get_viewdef ile alinan tanima eklenip create or replace view ... with (security_invoker = true) ile uygulandi)

-- v2.29: sevk edilen ithalat siparisi normal cariye aktarilir (tahsilatlar ayri satirlar olarak kalir).
-- v_cariler: ithalat_kalan / ithalat_kalan_sayi = sevk edilmis ithalat siparislerinin (kendi hareketlerinin neti > 0) kalan TL'si; bakiyeye dahildir, ayrica gosterilir.
-- v_cari_ekstre: ithalat_fis = harekete bagli siparis ithalata bagliysa fis no.
-- v_siparisler: hesap_kalan = siparise bagli tum cari hareketlerin (borc - alacak) neti.
-- (uygulanan tanimlar: migration "ithalat_kalan_normal_cari")
