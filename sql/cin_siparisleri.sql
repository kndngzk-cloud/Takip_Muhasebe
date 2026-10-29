-- =====================================================================
-- CIN SIPARISLERI: fabrikalar, siparisler, kalemler, odeme plani,
-- vergi/masraf, maliyet dagitimi, teslimde otomatik stok girisi
-- =====================================================================

create table public.fabrikalar (
  id bigint generated always as identity primary key,
  ad text not null unique check (length(trim(ad)) > 0),
  sehir text, iletisim text, notlar text,
  aktif boolean not null default true,
  olusturma timestamptz not null default now()
);

create sequence public.cin_no_seq start 1001;

create table public.cin_siparisler (
  id bigint generated always as identity primary key,
  no bigint not null unique default nextval('public.cin_no_seq'),
  fabrika_id bigint not null references public.fabrikalar(id),
  tarih date not null default current_date,
  durum text not null default 'Sipariş Verildi'
    check (durum in ('Sipariş Verildi','Üretimde','Üretim Bitti','Yüklendi','Limanda','Teslim Alındı','İptal')),
  para_birimi text not null default 'USD' check (para_birimi in ('TRY','USD','EUR','GBP')),
  kur numeric(14,4) check (kur > 0),
  fatura_tipi text not null default 'R' check (fatura_tipi in ('R','GR')),
  nakliye_sekli text, liman text, konteyner_no text, takip_no text,
  tahmini_uretim date, tahmini_yukleme date, tahmini_varis date,
  uretim_baslangic date, uretim_bitis date, yukleme_tarihi date, varis_tarihi date, teslim_tarihi date,
  aciklama text,
  olusturma timestamptz not null default now()
);
alter sequence public.cin_no_seq owned by public.cin_siparisler.no;

create table public.cin_kalemler (
  id bigint generated always as identity primary key,
  cin_siparis_id bigint not null references public.cin_siparisler(id) on delete cascade,
  urun_id bigint not null references public.urunler(id),
  miktar numeric(14,3) not null check (miktar > 0),
  birim_fiyat numeric(14,4) not null default 0 check (birim_fiyat >= 0),
  aciklama text,
  sira int not null default 0
);
create index on public.cin_kalemler (cin_siparis_id);
create index on public.cin_kalemler (urun_id);

alter table public.stok_hareketleri
  add column cin_kalem_id bigint unique references public.cin_kalemler(id) on delete cascade;
alter table public.siparisler
  add column cin_siparis_id bigint references public.cin_siparisler(id) on delete set null;
create index on public.siparisler (cin_siparis_id);

-- Odeme plani / takvimi: fabrika taksitleri, vergi ve masraflar, musteri tahsilat plani
create table public.odeme_plani (
  id bigint generated always as identity primary key,
  yon text not null check (yon in ('Ödeme','Tahsilat')),
  kategori text not null check (kategori in ('Fabrika','Gümrük vergisi','İthalat KDV','Navlun','Sigorta','Gümrük masrafı','Diğer','Müşteri')),
  cin_siparis_id bigint references public.cin_siparisler(id) on delete cascade,
  siparis_id bigint references public.siparisler(id) on delete cascade,
  aciklama text,
  tetik text not null default 'Tarih'
    check (tetik in ('Tarih','Sipariş','Üretim Bitti','Yüklendi','Limanda','Teslim Alındı','Sevk')),
  gun_sonra int not null default 0,
  yuzde numeric(7,3) check (yuzde > 0 and yuzde <= 100),
  tutar numeric(14,2) check (tutar >= 0),
  para_birimi text not null default 'TRY' check (para_birimi in ('TRY','USD','EUR','GBP')),
  kur numeric(14,4) check (kur > 0),
  vade_tarihi date,
  maliyete_dahil boolean not null default false,
  dagitim text not null default 'Değer' check (dagitim in ('Değer','Adet')),
  odendi boolean not null default false,
  odeme_tarihi date,
  odenen_kur numeric(14,4) check (odenen_kur > 0),
  odeme_sekli text,
  cari_hareket_id bigint references public.cari_hareketler(id) on delete set null,
  sira int not null default 0,
  olusturma timestamptz not null default now(),
  check (yuzde is not null or tutar is not null),
  check (tetik <> 'Tarih' or vade_tarihi is not null)
);
create index on public.odeme_plani (cin_siparis_id);
create index on public.odeme_plani (siparis_id);

-- RLS (diger tablolarla ayni duzen)
do $$ declare t text; begin
  foreach t in array array['fabrikalar','cin_siparisler','cin_kalemler','odeme_plani'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy okuma on public.%I for select to authenticated using (true)', t);
    execute format('create policy ekleme on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy guncelleme on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "admin silme" on public.%I for delete to authenticated using ((select private.is_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Gorunumler
-- ---------------------------------------------------------------------
create view public.v_odeme_takvimi with (security_invoker = true) as
with cs as (
  select c.*, f.ad as fabrika_ad,
         (select coalesce(sum(k.miktar * k.birim_fiyat), 0) from public.cin_kalemler k where k.cin_siparis_id = c.id) as toplam
  from public.cin_siparisler c join public.fabrikalar f on f.id = c.fabrika_id
), b as (
  select p.*, x.id as cin_id, x.no as cin_no, x.fabrika_ad, x.durum as cin_durum, x.para_birimi as cin_para_birimi, x.kur as cin_kur,
         s.fis_no, s.cari_id, cr.unvan as cari_unvan, s.durum as siparis_durum,
         case when p.yuzde is null then p.tutar
              when p.siparis_id is not null then round(s.genel_toplam * p.yuzde / 100, 2)
              else round(x.toplam * p.yuzde / 100, 2) end as tutar_hesap,
         case p.tetik
           when 'Tarih' then p.vade_tarihi
           when 'Sipariş' then coalesce(s.tarih, x.tarih)
           when 'Üretim Bitti' then x.uretim_bitis
           when 'Yüklendi' then x.yukleme_tarihi
           when 'Limanda' then x.varis_tarihi
           when 'Teslim Alındı' then x.teslim_tarihi
           when 'Sevk' then s.sevk_tarihi end as gercek_tarih,
         case p.tetik
           when 'Üretim Bitti' then x.tahmini_uretim
           when 'Yüklendi' then x.tahmini_yukleme
           when 'Limanda' then x.tahmini_varis
           when 'Teslim Alındı' then x.tahmini_varis end as tahmini_tarih
  from public.odeme_plani p
  left join public.siparisler s on s.id = p.siparis_id
  left join public.cariler cr on cr.id = s.cari_id
  left join cs x on x.id = coalesce(p.cin_siparis_id, s.cin_siparis_id)
)
select b.*,
       case when b.tetik = 'Tarih' then b.vade_tarihi
            else coalesce(b.gercek_tarih, b.tahmini_tarih) + b.gun_sonra end as vade,
       (b.tetik = 'Tarih' or b.gercek_tarih is not null) as vade_kesin,
       round(b.tutar_hesap * case when b.para_birimi = 'TRY' then 1 else coalesce(b.odenen_kur, b.kur, b.cin_kur) end, 2) as tutar_tl
from b
where coalesce(b.cin_durum, '') <> 'İptal' and coalesce(b.siparis_durum, '') <> 'İptal';

create view public.v_cin_siparisler with (security_invoker = true) as
select c.*, f.ad as fabrika_ad,
       coalesce(k.toplam, 0) as toplam, coalesce(k.toplam_miktar, 0) as toplam_miktar, coalesce(k.kalem_sayisi, 0) as kalem_sayisi,
       coalesce(o.odenen, 0) as fabrika_odenen,
       coalesce(k.toplam, 0) - coalesce(o.odenen, 0) as fabrika_kalan,
       coalesce(m.masraf_tl, 0) as masraf_tl,
       (select count(*) from public.siparisler s where s.cin_siparis_id = c.id and s.durum <> 'İptal') as musteri_siparis_sayisi
from public.cin_siparisler c
join public.fabrikalar f on f.id = c.fabrika_id
left join (select cin_siparis_id, sum(miktar * birim_fiyat) as toplam, sum(miktar) as toplam_miktar, count(*) as kalem_sayisi
           from public.cin_kalemler group by 1) k on k.cin_siparis_id = c.id
left join (select cin_siparis_id, sum(tutar_hesap) as odenen from public.odeme_plani p
           join lateral (select case when p.yuzde is null then p.tutar
                                     else round((select coalesce(sum(miktar * birim_fiyat), 0) from public.cin_kalemler where cin_siparis_id = p.cin_siparis_id) * p.yuzde / 100, 2) end as tutar_hesap) t on true
           where p.kategori = 'Fabrika' and p.odendi group by 1) o on o.cin_siparis_id = c.id
left join (select cin_siparis_id, sum(tutar_tl) as masraf_tl from public.v_odeme_takvimi
           where kategori <> 'Fabrika' and yon = 'Ödeme' and cin_siparis_id is not null group by 1) m on m.cin_siparis_id = c.id;

create view public.v_fabrikalar with (security_invoker = true) as
select f.*,
       coalesce(sum(v.toplam) filter (where v.durum <> 'İptal'), 0) as siparis_toplam,
       coalesce(sum(v.fabrika_odenen) filter (where v.durum <> 'İptal'), 0) as odenen,
       coalesce(sum(v.fabrika_kalan) filter (where v.durum <> 'İptal'), 0) as bakiye,
       count(v.id) filter (where v.durum not in ('Teslim Alındı','İptal')) as aktif_siparis
from public.fabrikalar f left join public.v_cin_siparisler v on v.fabrika_id = f.id
group by f.id;

-- Stok gorunumune "Yolda" (Cin'den gelmekte olan) eklenir
create or replace view public.v_stok with (security_invoker = true) as
 SELECT u.id, u.kod, u.ad, u.kategori, u.birim, u.satis_fiyati, u.min_stok, u.aktif, u.notlar, u.olusturma,
    COALESCE(h.giris, 0::numeric) AS toplam_giris,
    COALESCE(h.cikis, 0::numeric) AS toplam_cikis,
    COALESCE(h.giris, 0::numeric) - COALESCE(h.cikis, 0::numeric) AS real_stok,
    COALESCE(b.bekleyen, 0::numeric) AS bekleyen_siparis,
    COALESCE(h.giris, 0::numeric) - COALESCE(h.cikis, 0::numeric) - COALESCE(b.bekleyen, 0::numeric) AS sevk_sonrasi_stok,
    h.son_alis_fiyati,
    CASE
      WHEN (COALESCE(h.giris, 0::numeric) - COALESCE(h.cikis, 0::numeric) - COALESCE(b.bekleyen, 0::numeric)) <= 0::numeric THEN 'TÜKENDİ'::text
      WHEN (COALESCE(h.giris, 0::numeric) - COALESCE(h.cikis, 0::numeric) - COALESCE(b.bekleyen, 0::numeric)) <= u.min_stok THEN 'KRİTİK'::text
      ELSE 'Yeterli'::text
    END AS durum,
    COALESCE(y.yolda, 0::numeric) AS yolda,
    COALESCE(h.giris, 0::numeric) - COALESCE(h.cikis, 0::numeric) - COALESCE(b.bekleyen, 0::numeric) + COALESCE(y.yolda, 0::numeric) AS yolda_dahil_stok
   FROM public.urunler u
     LEFT JOIN ( SELECT stok_hareketleri.urun_id,
            sum(stok_hareketleri.miktar) FILTER (WHERE stok_hareketleri.tur = 'Giriş'::text) AS giris,
            sum(stok_hareketleri.miktar) FILTER (WHERE stok_hareketleri.tur = 'Çıkış'::text) AS cikis,
            (array_agg(stok_hareketleri.birim_maliyet ORDER BY stok_hareketleri.tarih DESC, stok_hareketleri.id DESC) FILTER (WHERE stok_hareketleri.islem = 'Alış'::text AND stok_hareketleri.birim_maliyet IS NOT NULL))[1] AS son_alis_fiyati
           FROM public.stok_hareketleri GROUP BY stok_hareketleri.urun_id) h ON h.urun_id = u.id
     LEFT JOIN ( SELECT k.urun_id, sum(k.miktar) AS bekleyen
           FROM public.siparis_kalemleri k JOIN public.siparisler s ON s.id = k.siparis_id
          WHERE s.durum = 'Beklemede'::text GROUP BY k.urun_id) b ON b.urun_id = u.id
     LEFT JOIN ( SELECT k.urun_id, sum(k.miktar) AS yolda
           FROM public.cin_kalemler k JOIN public.cin_siparisler c ON c.id = k.cin_siparis_id
          WHERE c.durum NOT IN ('Teslim Alındı','İptal') GROUP BY k.urun_id) y ON y.urun_id = u.id;

create or replace view public.v_siparisler with (security_invoker = true) as
 SELECT s.id, s.fis_no, s.tarih, s.cari_id, s.fatura_tipi, s.gonderim_sekli, s.sevk_sehri, s.durum, s.sevk_tarihi,
    s.kdv_orani, s.ara_toplam, s.kdv_tutari, s.genel_toplam, s.aciklama, s.olusturan, s.olusturma, s.maliyet_yontemi,
    s.para_birimi, s.kur, c.kod AS cari_kod, c.unvan AS cari_unvan, c.tip AS cari_tip,
    ( SELECT count(*) FROM public.siparis_kalemleri k WHERE k.siparis_id = s.id) AS kalem_sayisi,
    s.cin_siparis_id,
    cs.no AS cin_no,
    cs.durum AS cin_durum
   FROM public.siparisler s
     JOIN public.cariler c ON c.id = s.cari_id
     LEFT JOIN public.cin_siparisler cs ON cs.id = s.cin_siparis_id;

-- ---------------------------------------------------------------------
-- Maliyet: FOB x kur + maliyete dahil vergi/masraflar (degere veya adede gore dagitilir)
-- Kur: siparisteki kur; yoksa odenmis fabrika taksitlerinin agirlikli kuru
-- ---------------------------------------------------------------------
create or replace function public.cin_kur(p_id bigint) returns numeric
language sql stable set search_path = '' as $$
  select case when c.para_birimi = 'TRY' then 1 else coalesce(c.kur,
           (select sum(o.tutar_hesap * o.odenen_kur) / nullif(sum(o.tutar_hesap), 0)
              from public.v_odeme_takvimi o
             where o.cin_siparis_id = p_id and o.kategori = 'Fabrika' and o.odendi and o.odenen_kur is not null)) end
  from public.cin_siparisler c where c.id = p_id
$$;

create or replace function public.cin_maliyet(p_id bigint)
returns table (kalem_id bigint, urun_id bigint, miktar numeric, birim_fiyat numeric, kur numeric,
               fob_tl numeric, masraf_tl numeric, birim_maliyet numeric)
language plpgsql stable set search_path = '' as $$
declare v_kur numeric; v_top numeric; v_adet numeric; v_deger numeric; v_adetm numeric;
begin
  v_kur := public.cin_kur(p_id);
  select coalesce(sum(k.miktar * k.birim_fiyat), 0), coalesce(sum(k.miktar), 0) into v_top, v_adet
    from public.cin_kalemler k where k.cin_siparis_id = p_id;
  select coalesce(sum(o.tutar_hesap * case when o.para_birimi = 'TRY' then 1 else coalesce(o.odenen_kur, o.kur, v_kur) end)
                  filter (where o.dagitim = 'Değer'), 0),
         coalesce(sum(o.tutar_hesap * case when o.para_birimi = 'TRY' then 1 else coalesce(o.odenen_kur, o.kur, v_kur) end)
                  filter (where o.dagitim = 'Adet'), 0)
    into v_deger, v_adetm
    from public.v_odeme_takvimi o
   where o.cin_siparis_id = p_id and o.maliyete_dahil and o.kategori <> 'Fabrika' and o.yon = 'Ödeme';
  if v_top = 0 then v_adetm := v_adetm + v_deger; v_deger := 0; end if;
  return query
  select k.id, k.urun_id, k.miktar, k.birim_fiyat, v_kur,
         round(k.miktar * k.birim_fiyat * v_kur, 2),
         round(coalesce(v_deger * (k.miktar * k.birim_fiyat) / nullif(v_top, 0), 0) + coalesce(v_adetm * k.miktar / nullif(v_adet, 0), 0), 2),
         round((k.miktar * k.birim_fiyat * v_kur
                + coalesce(v_deger * (k.miktar * k.birim_fiyat) / nullif(v_top, 0), 0)
                + coalesce(v_adetm * k.miktar / nullif(v_adet, 0), 0)) / k.miktar, 4)
    from public.cin_kalemler k where k.cin_siparis_id = p_id order by k.sira, k.id;
end $$;

-- Teslim alinmis siparisin stok girislerini kalemlere ve maliyetlere esitler
create or replace function public.cin_stok_senkron(p_id bigint) returns void
language plpgsql set search_path = '' as $$
declare c public.cin_siparisler; v_fab text; r record;
begin
  select * into c from public.cin_siparisler where id = p_id;
  if not found or c.durum <> 'Teslim Alındı' then return; end if;
  select ad into v_fab from public.fabrikalar where id = c.fabrika_id;
  for r in select * from public.cin_maliyet(p_id) loop
    update public.stok_hareketleri
       set urun_id = r.urun_id, miktar = r.miktar, tarih = coalesce(c.teslim_tarihi, current_date),
           birim_maliyet = r.birim_maliyet, para_birimi = c.para_birimi,
           kur = case when c.para_birimi = 'TRY' then 1 else coalesce(r.kur, 1) end,
           doviz_maliyet = case when c.para_birimi = 'TRY' then null else r.birim_fiyat end,
           fatura_tipi = c.fatura_tipi, tedarikci = v_fab, belge_no = 'CN-' || c.no
     where cin_kalem_id = r.kalem_id;
    if not found then
      insert into public.stok_hareketleri (tarih, urun_id, tur, islem, miktar, birim_maliyet, fatura_tipi, kdv_orani,
                                           para_birimi, kur, doviz_maliyet, tedarikci, belge_no, aciklama, cin_kalem_id)
      values (coalesce(c.teslim_tarihi, current_date), r.urun_id, 'Giriş', 'Alış', r.miktar, r.birim_maliyet, c.fatura_tipi,
              coalesce((select kdv_orani from public.ayarlar where id = 1), 0.2), c.para_birimi,
              case when c.para_birimi = 'TRY' then 1 else coalesce(r.kur, 1) end,
              case when c.para_birimi = 'TRY' then null else r.birim_fiyat end,
              v_fab, 'CN-' || c.no, 'Çin siparişi teslim', r.kalem_id);
    end if;
  end loop;
end $$;

create or replace function private.tg_cin_senkron() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'cin_siparisler' then
    perform public.cin_stok_senkron(new.id);
  elsif tg_table_name = 'cin_kalemler' then
    perform public.cin_stok_senkron(coalesce(new.cin_siparis_id, old.cin_siparis_id));
  elsif tg_table_name = 'odeme_plani' then
    if coalesce(new.cin_siparis_id, old.cin_siparis_id) is not null then
      perform public.cin_stok_senkron(coalesce(new.cin_siparis_id, old.cin_siparis_id));
    end if;
  end if;
  return null;
end $$;

create trigger cin_senkron after update on public.cin_siparisler for each row execute function private.tg_cin_senkron();
create trigger cin_senkron after insert or update or delete on public.cin_kalemler for each row execute function private.tg_cin_senkron();
create trigger cin_senkron after insert or update or delete on public.odeme_plani for each row execute function private.tg_cin_senkron();

grant execute on function public.cin_kur(bigint), public.cin_maliyet(bigint), public.cin_stok_senkron(bigint) to authenticated;
grant execute on function private.tg_cin_senkron() to authenticated;

-- Sonraki eklemeler (Supabase'e uygulandi): ithalat_vergi_hesabi (urunler.gumruk, ayarlar.ithalat,
-- cin_kalemler.vergi_tl/vergi_detay, odeme_plani.kaynak + yeni kategoriler, cin_maliyet vergi_tl dahil),
-- v_stok_gumruk (v_stok + gumruk), v_odeme_takvimi_kaynak (gorunume kaynak kolonu)
-- nakit_girisleri (cek, senet, platform) + v_nakit_girisleri + ayarlar.platformlar uygulandi
-- kasa tablosu uygulandi
