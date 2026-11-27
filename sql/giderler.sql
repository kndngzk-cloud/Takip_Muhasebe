-- Gider defteri + sabit giderler
-- Giderler odeme_plani'nda tutulur (kaynak = 'Gider'): odenmemisler Odemeler'de ve nakit akisinda gorunur,
-- odenince secilen kasadan duser. Sabit giderler her ay icin otomatik odeme_plani satiri uretir (6 ay ileri).

-- (kategori kisitina dokunulmaz: ozel karsiligi olmayan giderler 'Diğer' olarak yazilir, gider_kategori'de asil kategori durur)

create table if not exists public.sabit_giderler (
  id bigint generated always as identity primary key,
  ad text not null,
  kategori text not null,
  tutar numeric not null check (tutar > 0),
  gun int not null default 1 check (gun between 1 and 31),
  baslangic date not null default date_trunc('month', current_date)::date,
  bitis date,
  faturali boolean not null default false,
  aktif boolean not null default true,
  aciklama text,
  olusturma timestamptz not null default now()
);
alter table public.sabit_giderler enable row level security;
create policy okuma on public.sabit_giderler for select to authenticated using (true);
create policy ekleme on public.sabit_giderler for insert to authenticated with check (true);
create policy guncelleme on public.sabit_giderler for update to authenticated using (true) with check (true);
create policy "admin silme" on public.sabit_giderler for delete to authenticated using ((select private.is_admin()));

alter table public.odeme_plani add column if not exists gider_kategori text;
alter table public.odeme_plani add column if not exists faturali boolean not null default false;
alter table public.odeme_plani add column if not exists sabit_gider_id bigint references public.sabit_giderler(id) on delete set null;
create unique index if not exists odeme_plani_sabit_ay on public.odeme_plani (sabit_gider_id, vade_tarihi) where sabit_gider_id is not null;

-- gider kategorisinin Odemeler'deki genel karsiligi
create or replace function public.gider_plan_kategori(k text) returns text language sql immutable set search_path to '' as $$
  select case
    when k = 'Kira' then 'Kira'
    when k in ('Maaş / SGK', 'Maaş') then 'Maaş'
    when k in ('Vergi', 'Vergi / SGK') then 'Vergi / SGK'
    when k in ('Elektrik / su / doğalgaz', 'İnternet / telefon', 'Fatura / abonelik') then 'Fatura / abonelik'
    when k = 'Kredi' then 'Kredi'
    else 'Diğer' end $$;

-- sabit giderlerin bu aydan itibaren 6 aylik odeme satirlarini uretir / gunceller
create or replace function public.sabit_gider_uret(p_id bigint default null) returns int language plpgsql security definer set search_path to '' as $$
declare s public.sabit_giderler; ay date; v date; n int := 0; bas date := date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date;
begin
  for s in select * from public.sabit_giderler where (p_id is null or id = p_id) loop
    -- pasif, silinen ya da bitis sonrasi: odenmemis gelecek satirlar kalkar
    delete from public.odeme_plani where sabit_gider_id = s.id and not odendi and vade_tarihi >= bas
      and (not s.aktif or (s.bitis is not null and vade_tarihi > s.bitis) or vade_tarihi < s.baslangic);
    if not s.aktif then continue; end if;
    for i in 0..5 loop
      ay := (bas + make_interval(months => i))::date;
      v := least(ay + (s.gun - 1), (ay + interval '1 month' - interval '1 day')::date);
      if v < s.baslangic or (s.bitis is not null and v > s.bitis) then continue; end if;
      insert into public.odeme_plani (yon, kategori, gider_kategori, aciklama, tetik, vade_tarihi, tutar, para_birimi, kaynak, faturali, sabit_gider_id)
      values ('Ödeme', public.gider_plan_kategori(s.kategori), s.kategori, s.ad, 'Tarih', v, s.tutar, 'TRY', 'Gider', s.faturali, s.id)
      on conflict (sabit_gider_id, vade_tarihi) where sabit_gider_id is not null do update
        set tutar = excluded.tutar, aciklama = excluded.aciklama, kategori = excluded.kategori, gider_kategori = excluded.gider_kategori, faturali = excluded.faturali
        where not public.odeme_plani.odendi and p_id is not null; -- gunluk calisma tek tek duzeltilmis aylari ezmez
      n := n + 1;
    end loop;
    -- gun degistiyse eski gunlu odenmemis satirlar kalkar
    delete from public.odeme_plani where sabit_gider_id = s.id and not odendi and vade_tarihi >= bas
      and extract(day from vade_tarihi)::int <> least(s.gun, extract(day from (date_trunc('month', vade_tarihi) + interval '1 month' - interval '1 day'))::int);
  end loop;
  return n;
end $$;
revoke all on function public.sabit_gider_uret(bigint) from public, anon;
grant execute on function public.sabit_gider_uret(bigint) to authenticated, service_role;

create or replace function private.tg_sabit_gider() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.odeme_plani where sabit_gider_id = old.id and not odendi;
    return old;
  end if;
  perform public.sabit_gider_uret(new.id);
  return new;
end $$;
create trigger sabit_gider_ekle after insert or update on public.sabit_giderler for each row execute function private.tg_sabit_gider();
create trigger sabit_gider_sil before delete on public.sabit_giderler for each row execute function private.tg_sabit_gider();

-- her ayin basinda yeni ayin satiri eklensin
select cron.schedule('sabit-giderler', '7 3 * * *', 'select public.sabit_gider_uret()');

-- Odemeler ekraninda gider kategorisi gorunsun: v_odeme_takvimi'ne gider_kategori, faturali, sabit_gider_id eklenir
do $$
declare d text := pg_get_viewdef('public.v_odeme_takvimi'::regclass);
begin
  if position('gider_kategori' in d) > 0 then return; end if;
  d := replace(d, E'    p.kasa_hareket_id\n           FROM (((odeme_plani p', E'    p.kasa_hareket_id,\n    p.gider_kategori,\n    p.faturali,\n    p.sabit_gider_id\n           FROM (((odeme_plani p');
  d := replace(d, E'    kasa_hareket_id\n   FROM b', E'    kasa_hareket_id,\n    gider_kategori,\n    faturali,\n    sabit_gider_id\n   FROM b');
  if position('sabit_gider_id' in d) = 0 then raise exception 'v_odeme_takvimi bicimi beklenenden farkli'; end if;
  execute 'create or replace view public.v_odeme_takvimi with (security_invoker = true) as ' || d;
end $$;
