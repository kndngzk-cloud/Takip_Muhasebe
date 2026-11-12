-- Platform odemeleri: platformdan "yatti" bilgisi gelince kayit Tahsil edildi yapilmaz,
-- yatti_tarihi isaretlenir ve "Kasaya isle" icin bekler (para kasaya/hesaba kullanici onayiyla girer).
alter table nakit_girisleri add column if not exists yatti_tarihi date;
create or replace view v_nakit_girisleri with (security_invoker = true) as
 SELECT n.id, n.tur, n.kaynak, n.belge_no, n.cari_id, n.kesideci, n.alis_tarihi, n.vade, n.tutar, n.para_birimi, n.kur,
    n.fatura_tipi, n.durum, n.tahsil_tarihi, n.ciro_edilen, n.cari_hareket_id, n.aciklama, n.olusturma, n.dis_ref, n.otomatik,
    c.unvan AS cari_unvan, c.kod AS cari_kod,
    round(n.tutar * CASE WHEN n.para_birimi = 'TRY'::text THEN 1::numeric ELSE n.kur END, 2) AS tutar_tl,
    n.kasa_hareket_id, n.yatti_tarihi
   FROM nakit_girisleri n LEFT JOIN cariler c ON c.id = n.cari_id;
