-- Bildirim secenekleri kurulumu (her hareket icin anlik bildirim). Supabase > SQL Editor'de bir kez calistirin.
-- Hicbir veri silinmez / degistirilmez; sadece yeni kolon, fonksiyon ve tetikleyiciler eklenir.

alter table public.push_abonelik add column if not exists konular text[];

-- para bicimi: 12.345,67 ₺
create or replace function private.tl(v numeric, pb text default 'TRY') returns text language sql immutable set search_path to '' as $$
  select translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,') || ' ' || case coalesce(pb, 'TRY') when 'TRY' then '₺' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' else pb end $$;

-- anlik bildirim gonder (islem tamamlaninca pg_net ile bildirim fonksiyonuna gider; konu = cihazda secilen bildirim turu)
create or replace function private.bildir(p_konu text, p_baslik text, p_metin text, p_url text default '#/', p_etiket text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform net.http_post(
    url := 'https://zxlbtpimbygbagwouwmc.supabase.co/functions/v1/bildirim',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bGJ0cGltYnlnYmFnd291d21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzc2OTEsImV4cCI6MjEwODgxMzY5MX0.nOWOKUALuxXzbSxsh8P2Uxpfsnf13RF7Unamm52yJdw'),
    body := jsonb_build_object('token', (select deger from public.sistem_ayar where anahtar = 'yedek_token'), 'konu', p_konu, 'baslik', left(p_baslik, 120), 'metin', left(coalesce(p_metin, ''), 380),
              'url', p_url, 'etiket', p_etiket, 'yapan', auth.uid()),
    timeout_milliseconds := 20000);
exception when others then null; -- bildirim hatasi islemi asla bozmasin
end $$;

-- cari hareketleri: tahsilat, kartla odeme, elle borc / duzeltme
create or replace function private.tg_bld_cari() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_unvan text := (select unvan from public.cariler where id = new.cari_id); v_konu text; v_bas text;
begin
  if new.islem = 'Tahsilat' and not new.otomatik then
    if coalesce(new.aciklama, '') ilike 'PayTR%' or new.odeme_sekli = 'Kredi kartı' then v_konu := 'kart'; v_bas := '💳 Kartla ödeme geldi';
    else v_konu := 'tahsilat'; v_bas := '💰 Tahsilat: ' || coalesce(new.odeme_sekli, 'ödeme'); end if;
    perform private.bildir(v_konu, v_bas, coalesce(v_unvan, 'Cari') || ' · ' || private.tl(coalesce(new.doviz_tutar, new.alacak), case when new.doviz_tutar is not null then new.para_birimi else 'TRY' end)
      || coalesce(' · ' || nullif(new.aciklama, ''), ''), '#/cari/' || new.cari_id, 'ch-' || new.id);
  elsif not new.otomatik and new.islem in ('Açılış', 'Düzeltme', 'Satış') then
    perform private.bildir('cari_duzeltme', 'Cari hareket: ' || new.islem, coalesce(v_unvan, 'Cari') || ' · ' || case when new.borc > 0 then 'borç ' || private.tl(new.borc) else 'alacak ' || private.tl(new.alacak) end
      || coalesce(' · ' || nullif(new.aciklama, ''), ''), '#/cari/' || new.cari_id, 'ch-' || new.id);
  end if;
  return null;
end $$;
create or replace trigger bld_cari after insert on public.cari_hareketler for each row execute function private.tg_bld_cari();

-- kasa / banka hareketleri (her giris-cikis)
create or replace function private.tg_bld_kasa() returns trigger language plpgsql security definer set search_path to '' as $$
declare k record;
begin
  select ad, para_birimi, tutar into k from public.kasa where id = new.kasa_id;
  perform private.bildir('kasa', case when new.tutar >= 0 then '⬆ Kasaya giriş: ' else '⬇ Kasadan çıkış: ' end || coalesce(k.ad, 'Kasa'),
    private.tl(abs(new.tutar), k.para_birimi) || coalesce(' · ' || nullif(new.aciklama, ''), '') || ' · bakiye ' || private.tl(k.tutar, k.para_birimi), '#/', 'kh-' || new.id);
  return null;
end $$;
create or replace trigger bld_kasa after insert on public.kasa_hareketleri for each row execute function private.tg_bld_kasa();

-- cek / senet ve platform hakedisleri
create or replace function private.tg_bld_nakit() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_kim text := coalesce(new.kesideci, (select unvan from public.cariler where id = new.cari_id), new.kaynak, new.tur);
begin
  if coalesce(new.tur, 'Çek') <> 'Platform' then
    if tg_op = 'INSERT' and new.durum = 'Bekliyor' then
      perform private.bildir('cek', '🧾 ' || coalesce(new.tur, 'Çek') || ' alındı', v_kim || ' · ' || private.tl(new.tutar, new.para_birimi) || coalesce(' · vade ' || to_char(new.vade, 'DD.MM.YYYY'), ''), '#/odemeler', 'ng-' || new.id);
    elsif tg_op = 'UPDATE' and new.durum is distinct from old.durum and new.durum = 'Tahsil edildi' then
      perform private.bildir('cek', '✅ ' || coalesce(new.tur, 'Çek') || ' tahsil edildi', v_kim || ' · ' || private.tl(new.tutar, new.para_birimi) || coalesce(' · ' || nullif(new.ciro_edilen, ''), ''), '#/odemeler', 'ng-' || new.id);
    end if;
  elsif tg_op = 'UPDATE' and ((new.yatti_tarihi is not null and old.yatti_tarihi is null) or (new.durum = 'Tahsil edildi' and old.durum is distinct from 'Tahsil edildi' and old.yatti_tarihi is null)) then
    perform private.bildir('platform_odeme', '🏦 Platform ödemesi yattı: ' || coalesce(new.kaynak, 'Platform'), private.tl(new.tutar, new.para_birimi) || coalesce(' · ' || to_char(coalesce(new.yatti_tarihi, new.tahsil_tarihi), 'DD.MM.YYYY'), ''), '#/odemeler', 'ng-' || new.id);
  end if;
  return null;
end $$;
create or replace trigger bld_nakit after insert or update of durum, yatti_tarihi on public.nakit_girisleri for each row execute function private.tg_bld_nakit();

-- odeme plani: yapilan odemeler, gelen gelirler, ev harcamalari
create or replace function private.tg_bld_plan() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_ac text := coalesce(nullif(new.aciklama, ''), new.gider_kategori, new.kategori, ''); v_kim text;
begin
  if new.gider_link_id is not null then
    if tg_op = 'INSERT' then
      v_kim := (select ad from public.gider_linkleri where id = new.gider_link_id);
      perform private.bildir('ev_harcama', '🏠 Ev harcaması: ' || coalesce(new.gider_kategori, 'Diğer'), private.tl(new.tutar) || coalesce(' · ' || nullif(new.aciklama, ''), '') || coalesce(' · ' || v_kim, ''), '#/ev-planlama', 'op-' || new.id);
    end if;
    return null;
  end if;
  if new.odendi and (tg_op = 'INSERT' or not old.odendi) then
    v_kim := (select unvan from public.cariler where id = new.cari_id);
    if new.yon = 'Ödeme' then
      perform private.bildir('odeme_yapildi', '💸 Ödeme yapıldı' || case when new.kaynak = 'Gider' then ' (gider)' else '' end, private.tl(new.tutar, new.para_birimi) || ' · ' || v_ac || coalesce(' · ' || v_kim, ''), '#/odemeler', 'op-' || new.id);
    else
      perform private.bildir('gelir', '📥 Gelir / tahsilat alındı', private.tl(new.tutar, new.para_birimi) || ' · ' || v_ac || coalesce(' · ' || v_kim, ''), '#/odemeler', 'op-' || new.id);
    end if;
  end if;
  return null;
end $$;
create or replace trigger bld_plan after insert or update of odendi on public.odeme_plani for each row execute function private.tg_bld_plan();

-- siparisler: programda elle acilan siparis, sevk, iptal (platform siparisleri kendi bildirimiyle gelir)
create or replace function private.tg_bld_siparis() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_unvan text := (select unvan from public.cariler where id = new.cari_id);
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      perform private.bildir('siparis', '🧾 Yeni sipariş ' || coalesce(new.fis_no, ''), coalesce(v_unvan, '') || ' · ' || private.tl(new.genel_toplam, coalesce(new.para_birimi, 'TRY')), '#/siparis/' || new.id, 'sp-' || new.id);
    end if;
  elsif new.durum is distinct from old.durum then
    perform private.bildir('siparis_durum', case new.durum when 'Sevk Edildi' then '🚚 Sipariş sevk edildi ' when 'İptal' then '✖ Sipariş iptal edildi ' else 'Sipariş: ' || new.durum || ' ' end || coalesce(new.fis_no, ''),
      coalesce(v_unvan, '') || ' · ' || private.tl(new.genel_toplam, coalesce(new.para_birimi, 'TRY')), '#/siparis/' || new.id, 'spd-' || new.id);
  end if;
  return null;
end $$;
create or replace trigger bld_siparis after insert or update of durum on public.siparisler for each row execute function private.tg_bld_siparis();

-- stok girisleri (mal alisi, ithalat teslimi): bir islemde girilen tum satirlar tek bildirim
create or replace function private.tg_bld_stok() returns trigger language plpgsql security definer set search_path to '' as $$
declare r record;
begin
  select count(*) n, sum(y.miktar) m, string_agg(distinct u.ad, ', ') ad, max(y.tedarikci) ted, sum(y.miktar * coalesce(y.birim_maliyet, 0)) tut
    into r from yeni y left join public.urunler u on u.id = y.urun_id where y.tur = 'Giriş' and y.siparis_id is null;
  if r.n > 0 then
    perform private.bildir('stok', '📦 Stok girişi' || coalesce(' · ' || nullif(r.ted, ''), ''), translate(to_char(r.m, 'FM999,999,990.###'), ',.', '.,') || ' adet · ' || left(r.ad, 200) || case when r.tut > 0 then ' · ' || private.tl(r.tut) else '' end, '#/stok', null);
  end if;
  return null;
end $$;
create or replace trigger bld_stok after insert on public.stok_hareketleri referencing new table as yeni for each statement execute function private.tg_bld_stok();

-- ithalat siparisi durum degisikligi
create or replace function private.tg_bld_cin() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.durum is distinct from old.durum then
    perform private.bildir('ithalat', '🚢 İthalat: ' || new.durum, coalesce(new.kod, new.no::text, '') || ' · ' || coalesce((select ad from public.fabrikalar where id = new.fabrika_id), ''), '#/cin/' || new.id, 'cin-' || new.id);
  end if;
  return null;
end $$;
create or replace trigger bld_cin after update of durum on public.cin_siparisler for each row execute function private.tg_bld_cin();

-- ev ihtiyaclari listesine eklenenler
create or replace function private.tg_bld_ihtiyac() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  perform private.bildir('ev_ihtiyac', '📝 ' || case new.liste when 'Yapılacak' then 'Yapılacaklar' when 'Mutfak' then 'Mutfak eksikleri' else 'Ev eksikleri' end || ' listesine eklendi', new.metin || coalesce(' · ' || new.ekleyen, ''), '#/ev-planlama', 'ei-' || new.id);
  return null;
end $$;
create or replace trigger bld_ihtiyac after insert on public.ev_ihtiyaclari for each row execute function private.tg_bld_ihtiyac();

-- her sabah 09:00: bugun vadesi gelen (ve geciken) odemeler, tahsilatlar ve cekler
create or replace function private.vade_bildirim() returns void language plpgsql security definer set search_path to '' as $$
declare v_gun date := (now() at time zone 'Europe/Istanbul')::date; o record; c record; m text;
begin
  select count(*) filter (where yon = 'Ödeme') od, coalesce(sum(tutar_tl) filter (where yon = 'Ödeme'), 0) odt,
         count(*) filter (where yon <> 'Ödeme') th, coalesce(sum(tutar_tl) filter (where yon <> 'Ödeme'), 0) tht,
         count(*) filter (where vade_tarihi < v_gun) gec
    into o from public.v_odeme_takvimi where not odendi and vade_tarihi <= v_gun;
  select count(*) n, coalesce(sum(tutar), 0) t into c from public.nakit_girisleri where durum = 'Bekliyor' and coalesce(tur, 'Çek') <> 'Platform' and vade = v_gun;
  if o.od + o.th + c.n = 0 then return; end if;
  m := concat_ws(' · ', case when o.od > 0 then o.od || ' ödeme ' || private.tl(o.odt) end, case when o.th > 0 then o.th || ' tahsilat ' || private.tl(o.tht) end,
                 case when c.n > 0 then c.n || ' çek ' || private.tl(c.t) end, case when o.gec > 0 then o.gec || ' tanesi gecikmiş' end);
  perform private.bildir('vade', '📅 Bugün vadesi gelenler', m, '#/odemeler', 'vade-' || v_gun);
end $$;
select cron.schedule('vade-bildirim', '0 6 * * *', $$select private.vade_bildirim()$$);

select 'Bildirim kurulumu tamam' as sonuc;
