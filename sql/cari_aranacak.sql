-- Uygulandi (2026-11-22): Aranacaklar listesi (cari listesinde kirmizi isaret, ekipte ortak)
alter table cariler add column if not exists aranacak_tarih timestamptz, add column if not exists aranacak_not text;
-- v_cariler sonuna c.aranacak_tarih, c.aranacak_not eklendi (pg_get_viewdef + create or replace, security_invoker = on)
