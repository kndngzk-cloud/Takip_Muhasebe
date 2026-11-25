-- Uygulandi. Logo Isbasi e-Fatura / e-Arsiv entegrasyonu
-- isbasi_faturalar: programdaki siparisten Isbasi'nda kesilen fatura kaydi (bir sipariste en fazla bir gecerli fatura).
-- Yazma sadece isbasi-fatura edge function'i (service role) uzerinden; uygulama sadece okur.
-- entegrasyonlar'a 'İşbaşı' satiri: ayar = api_key, kullanici, sifre, sunucu (test/canli adresi)
create table if not exists public.isbasi_faturalar (
  id bigserial primary key,
  siparis_id bigint not null references public.siparisler(id) on delete cascade,
  ortam text not null default 'test',            -- test | canli
  durum text not null default 'Bekliyor',         -- Kesildi | Hata
  isbasi_id text,                                 -- Isbasi fatura id
  fatura_no text,
  ettn text,
  tur text,                                       -- e-Arşiv internet | e-Fatura / e-Arşiv
  tutar numeric,
  hata text,
  istek jsonb,
  yanit jsonb,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists isbasi_faturalar_siparis on public.isbasi_faturalar (siparis_id);
-- ayni sipariste ayni ortamda ikinci gecerli fatura kesilemez
create unique index if not exists isbasi_faturalar_tek on public.isbasi_faturalar (siparis_id, ortam) where durum = 'Kesildi';
alter table public.isbasi_faturalar enable row level security;
drop policy if exists okuma on public.isbasi_faturalar;
create policy okuma on public.isbasi_faturalar for select to authenticated using (true);

alter table public.entegrasyonlar drop constraint entegrasyonlar_platform_check;
alter table public.entegrasyonlar add constraint entegrasyonlar_platform_check check (platform = any (array['PayTR','PayTR 2','Trendyol','Hepsiburada','Koçtaş','N11','gradde.com.tr','eviyeshop.com','İşbaşı']));
insert into public.entegrasyonlar (platform, aktif, ayar) values ('İşbaşı', false, '{}'::jsonb) on conflict do nothing;
