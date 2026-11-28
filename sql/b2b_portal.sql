-- (Supabase'e b2b_portal migration'i ile uygulandi) B2B bayi portali: musteri kullanicilari, yetkiler, siparis talepleri.
-- Musteri bayi.html'e kullanici adi + sifreyle girer; tum islemler b2b edge function'indan (servis anahtari) gecer.
-- Musteri siparisi once "Onay bekliyor" talebi olur; stok ve cariye dokunmaz. Yonetici onaylayinca siparis_kaydet ile
-- gercek siparis acilir (fiyatlar musteriye ozel fiyattan sunucuda hesaplanir; musteri fiyat gonderemez / degistiremez).

create table if not exists public.b2b_kullanicilari (
  id bigint generated always as identity primary key,
  cari_id bigint not null references public.cariler(id) on delete cascade,
  ad text not null,
  kullanici text unique,
  sifre_hash text,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  aktif boolean not null default true,
  yetkiler jsonb not null default '{"siparis":true,"oto_onay":false,"tum_urunler":false,"stok":true,"siparislerim":true,"ekstre_r":true,"ekstre_gr":false,"kart_odeme":false,"odeme_tipi":"R","max_taksit":1,"fatura":"R"}'::jsonb,
  odeme_link_id bigint references public.odeme_linkleri(id) on delete set null,
  son_giris timestamptz,
  olusturan uuid default auth.uid(),
  olusturma timestamptz not null default now()
);
create index if not exists b2b_kullanicilari_cari_idx on public.b2b_kullanicilari (cari_id);

create table if not exists public.b2b_talepler (
  id bigint generated always as identity primary key,
  cari_id bigint not null references public.cariler(id) on delete cascade,
  kullanici_id bigint references public.b2b_kullanicilari(id) on delete set null,
  kullanici_ad text,
  kalemler jsonb not null,          -- [{urun_id, kod, ad, birim, miktar, birim_fiyat (TL, KDV haric), pb, doviz_fiyat, kur}]
  fatura_tipi text not null default 'R' check (fatura_tipi in ('R', 'GR')),
  gonderim_sekli text,
  aciklama text,
  ara_toplam numeric not null default 0,
  kdv_orani numeric not null default 0,
  kdv_tutari numeric not null default 0,
  genel_toplam numeric not null default 0,
  durum text not null default 'Onay bekliyor' check (durum in ('Onay bekliyor', 'Onaylandı', 'Reddedildi', 'İptal')),
  red_nedeni text,
  oto boolean not null default false,  -- musteriye otomatik onay yetkisi verildiyse
  siparis_id bigint references public.siparisler(id) on delete set null,
  karar_veren uuid,
  karar_zamani timestamptz,
  olusturma timestamptz not null default now()
);
create index if not exists b2b_talepler_cari_idx on public.b2b_talepler (cari_id);
create index if not exists b2b_talepler_durum_idx on public.b2b_talepler (durum);
create index if not exists b2b_talepler_sip_idx on public.b2b_talepler (siparis_id);
create index if not exists b2b_talepler_kul_idx on public.b2b_talepler (kullanici_id);
create index if not exists b2b_kullanicilari_link_idx on public.b2b_kullanicilari (odeme_link_id);

alter table public.b2b_kullanicilari enable row level security;
alter table public.b2b_talepler enable row level security;
drop policy if exists "admin" on public.b2b_kullanicilari;
create policy "admin" on public.b2b_kullanicilari for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists okuma on public.b2b_talepler;
drop policy if exists guncelleme on public.b2b_talepler;
create policy okuma on public.b2b_talepler for select to authenticated using (true);
create policy guncelleme on public.b2b_talepler for update to authenticated using (true) with check (true);
revoke all on public.b2b_kullanicilari from anon;
revoke all on public.b2b_talepler from anon;
revoke all on public.b2b_kullanicilari from authenticated;
revoke all on public.b2b_talepler from authenticated;
-- sifre ozeti ve oturum anahtari istemciye hic gitmesin: sadece bu kolonlar okunur / yazilir
grant select (id, cari_id, ad, kullanici, aktif, yetkiler, odeme_link_id, son_giris, olusturan, olusturma) on public.b2b_kullanicilari to authenticated;
grant insert (cari_id, ad, aktif, yetkiler, odeme_link_id) on public.b2b_kullanicilari to authenticated;
grant update (ad, aktif, yetkiler, odeme_link_id) on public.b2b_kullanicilari to authenticated;
grant delete on public.b2b_kullanicilari to authenticated;
grant select, update on public.b2b_talepler to authenticated;

create or replace function public.b2b_kullanici_ayarla(p_id bigint, p_kullanici text, p_sifre text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_admin() then raise exception 'Bu işlem için yönetici olmalısınız.'; end if;
  if coalesce(trim(p_kullanici), '') = '' then raise exception 'Kullanıcı adı girin.'; end if;
  if p_sifre is not null and length(p_sifre) < 6 then raise exception 'Şifre en az 6 karakter olmalı.'; end if;
  if exists (select 1 from public.b2b_kullanicilari where lower(kullanici) = lower(trim(p_kullanici)) and id <> p_id) then raise exception 'Bu kullanıcı adı başkasında kullanılıyor.'; end if;
  update public.b2b_kullanicilari set kullanici = lower(trim(p_kullanici)),
    sifre_hash = case when p_sifre is null then sifre_hash else extensions.crypt(p_sifre, extensions.gen_salt('bf')) end,
    token = case when p_sifre is null then token else replace(gen_random_uuid()::text, '-', '') end
  where id = p_id;
end $$;
revoke execute on function public.b2b_kullanici_ayarla(bigint, text, text) from anon, public;
grant execute on function public.b2b_kullanici_ayarla(bigint, text, text) to authenticated;

-- giris: sadece servis anahtari (b2b edge function) cagirir
create or replace function public.b2b_giris(p_kullanici text, p_sifre text)
returns text language plpgsql security definer set search_path to '' as $$
declare t text;
begin
  update public.b2b_kullanicilari set son_giris = now()
   where aktif and lower(kullanici) = lower(trim(p_kullanici)) and sifre_hash is not null and sifre_hash = extensions.crypt(p_sifre, sifre_hash)
   returning token into t;
  return t;
end $$;
revoke execute on function public.b2b_giris(text, text) from anon, authenticated, public;

-- musteri kendi sifresini degistirir (eski sifre dogrulanir, token yenilenir)
create or replace function public.b2b_sifre_degistir(p_token text, p_eski text, p_yeni text)
returns text language plpgsql security definer set search_path to '' as $$
declare t text;
begin
  if length(coalesce(p_yeni, '')) < 6 then raise exception 'Yeni şifre en az 6 karakter olmalı.'; end if;
  update public.b2b_kullanicilari set sifre_hash = extensions.crypt(p_yeni, extensions.gen_salt('bf')), token = replace(gen_random_uuid()::text, '-', '')
   where token = p_token and aktif and sifre_hash = extensions.crypt(p_eski, sifre_hash)
   returning token into t;
  return t;
end $$;
revoke execute on function public.b2b_sifre_degistir(text, text, text) from anon, authenticated, public;

-- Talebi onayla: gercek siparis acar (siparis_kaydet). p_kalemler verilirse (yonetici miktar/fiyat duzelttiyse) onlar kullanilir.
create or replace function public.b2b_talep_onayla(p_id bigint, p_kalemler jsonb default null)
returns jsonb language plpgsql set search_path to '' as $$
declare t public.b2b_talepler; v_k jsonb; r jsonb;
begin
  select * into t from public.b2b_talepler where id = p_id for update;
  if not found then raise exception 'Talep bulunamadı.'; end if;
  if t.durum <> 'Onay bekliyor' then raise exception 'Bu talep zaten %.', lower(t.durum); end if;
  v_k := coalesce(p_kalemler, (select jsonb_agg(jsonb_build_object('urun_id', x->'urun_id', 'miktar', x->'miktar', 'birim_fiyat', x->'birim_fiyat')) from jsonb_array_elements(t.kalemler) x));
  r := public.siparis_kaydet(t.cari_id, v_k, t.fatura_tipi, t.gonderim_sekli, (now() at time zone 'Europe/Istanbul')::date, null,
        trim(both ' ·' from concat_ws(' · ', 'Bayi siparişi #' || t.id, nullif(t.kullanici_ad, ''), nullif(t.aciklama, ''))), null, null);
  update public.b2b_talepler set durum = 'Onaylandı', siparis_id = (r->>'id')::bigint, karar_veren = auth.uid(), karar_zamani = now() where id = p_id;
  return r;
end $$;
revoke execute on function public.b2b_talep_onayla(bigint, jsonb) from anon, public;
grant execute on function public.b2b_talep_onayla(bigint, jsonb) to authenticated;

create or replace function public.b2b_talep_reddet(p_id bigint, p_neden text)
returns void language plpgsql set search_path to '' as $$
begin
  update public.b2b_talepler set durum = 'Reddedildi', red_nedeni = nullif(trim(p_neden), ''), karar_veren = auth.uid(), karar_zamani = now()
   where id = p_id and durum = 'Onay bekliyor';
  if not found then raise exception 'Talep bulunamadı ya da zaten karara bağlanmış.'; end if;
end $$;
revoke execute on function public.b2b_talep_reddet(bigint, text) from anon, public;
grant execute on function public.b2b_talep_reddet(bigint, text) to authenticated;

-- yeni bayi siparisi bildirimi
-- (oto=true talep onaylaninca: "otomatik onaylandi")
create or replace function private.tg_bld_b2b() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  -- otomatik onayda bildirim onaydan sonra gider; otomatik onay basarisiz olursa (oto=false yapilir) "onay bekliyor" gider
  if tg_op = 'INSERT' and new.oto then return null; end if;
  if tg_op = 'UPDATE' and not ((new.oto and new.durum = 'Onaylandı' and old.durum <> 'Onaylandı') or (old.oto and not new.oto and new.durum = 'Onay bekliyor')) then return null; end if;
  perform private.bildir('b2b_siparis', case when new.oto and new.durum = 'Onaylandı' then '🛒 Bayi siparişi (otomatik onaylandı)' else '🛒 Bayi siparişi onay bekliyor' end,
    coalesce((select unvan from public.cariler where id = new.cari_id), 'Cari') || ' · ' || private.tl(new.genel_toplam) || ' · ' || jsonb_array_length(new.kalemler) || ' kalem'
    || coalesce(' · ' || nullif(new.kullanici_ad, ''), ''), '#/b2b', 'b2b-' || new.id);
  return null;
end $$;
drop trigger if exists bld_b2b on public.b2b_talepler;
create trigger bld_b2b after insert or update of durum, oto on public.b2b_talepler for each row execute function private.tg_bld_b2b();
