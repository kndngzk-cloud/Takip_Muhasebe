-- Musteri odeme linkleri (PayTR Linkle Odeme API)
-- Akis: cari ekraninda link olusturulur -> musteri odeme.html#<token> sayfasinda tutari yazar ->
-- cari-odeme edge function PayTR'de o tutara tek kullanimlik link acar (callback_link = cari-odeme) ->
-- odeme basarili olunca PayTR cari-odeme'ye bildirir -> paytr_link_odendi() tahsilati cariye duser.

create table if not exists public.odeme_linkleri (
  id bigint generated always as identity primary key,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  cari_id bigint not null references public.cariler(id) on delete cascade,
  fatura_tipi text not null default 'R' check (fatura_tipi in ('R', 'GR')),
  max_taksit int not null default 1 check (max_taksit between 1 and 3),
  bakiye_goster boolean not null default true,
  aciklama text,
  aktif boolean not null default true,
  olusturan uuid default auth.uid(),
  olusturma timestamptz not null default now()
);
create index if not exists odeme_linkleri_cari_idx on public.odeme_linkleri (cari_id);

create table if not exists public.odeme_link_odemeleri (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.odeme_linkleri(id) on delete cascade,
  callback_id text not null unique,
  tutar numeric not null check (tutar > 0),
  paytr_link_id text,
  paytr_url text,
  durum text not null default 'Bekliyor' check (durum in ('Bekliyor', 'Ödendi')),
  merchant_oid text,
  toplam numeric,            -- karttan cekilen (vade farki dahil)
  odeme_zamani timestamptz,
  paytr_islem_id bigint references public.paytr_islemler(id) on delete set null,
  cari_hareket_id bigint,
  makbuz_no int,
  olusturma timestamptz not null default now()
);
create index if not exists odeme_link_odemeleri_link_idx on public.odeme_link_odemeleri (link_id);

alter table public.odeme_linkleri enable row level security;
alter table public.odeme_link_odemeleri enable row level security;
drop policy if exists okuma on public.odeme_linkleri;
drop policy if exists ekleme on public.odeme_linkleri;
drop policy if exists guncelleme on public.odeme_linkleri;
drop policy if exists "admin silme" on public.odeme_linkleri;
create policy okuma on public.odeme_linkleri for select to authenticated using (true);
create policy ekleme on public.odeme_linkleri for insert to authenticated with check (true);
create policy guncelleme on public.odeme_linkleri for update to authenticated using (true) with check (true);
create policy "admin silme" on public.odeme_linkleri for delete to authenticated using ((select private.is_admin()));
drop policy if exists okuma on public.odeme_link_odemeleri;
create policy okuma on public.odeme_link_odemeleri for select to authenticated using (true);

-- Basarili link odemesi: PayTR islemi + cari tahsilati + makbuz, tek seferde ve tekrar gelirse bir daha yazmaz.
create or replace function public.paytr_link_odendi(p_callback_id text, p_merchant_oid text, p_tutar numeric, p_toplam numeric, p_odeme_tipi text, p_ham jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare o public.odeme_link_odemeleri; l public.odeme_linkleri; v_m int; v_p bigint; v_h bigint; v_an timestamp := (now() at time zone 'Europe/Istanbul');
begin
  select * into o from public.odeme_link_odemeleri where callback_id = p_callback_id for update;
  if not found then raise exception 'Link ödemesi bulunamadı: %', p_callback_id; end if;
  if o.durum = 'Ödendi' then return jsonb_build_object('tekrar', true, 'makbuz_no', o.makbuz_no); end if;
  select * into l from public.odeme_linkleri where id = o.link_id;
  v_m := nextval('public.makbuz_no_seq');
  insert into public.paytr_islemler (hesap, dis_ref, islem_tipi, islem_tarihi, islem_zamani, siparis_no, islem_tutari, odeme_tutari, para_birimi, odeme_tipi, ham,
                                     durum, cari_id, fatura_tipi, makbuz_no, eslesme_zamani)
  values ('PayTR', 'link:' || p_merchant_oid, 'Satış', v_an::date, to_char(v_an, 'DD.MM.YYYY HH24:MI'), p_merchant_oid, round(p_tutar, 2), round(p_toplam, 2), 'TRY', p_odeme_tipi, p_ham,
          'Cari', l.cari_id, l.fatura_tipi, v_m, now())
  on conflict (dis_ref) do nothing
  returning id into v_p;
  if v_p is null then raise exception 'Bu PayTR ödemesi zaten kayıtlı: %', p_merchant_oid; end if;
  insert into public.cari_hareketler (tarih, cari_id, islem, fatura_tipi, alacak, borc, para_birimi, kur, odeme_sekli, belge_no, aciklama, olusturan)
  values (v_an::date, l.cari_id, 'Tahsilat', l.fatura_tipi, round(p_tutar, 2), 0, 'TRY', 1, 'Kredi kartı', 'Makbuz ' || v_m,
          'PayTR ödeme linki · sipariş ' || p_merchant_oid
            || case when round(p_toplam, 2) > round(p_tutar, 2) then ' · karttan ' || to_char(round(p_toplam, 2), 'FM999G999G990D00') || ' TL çekildi (vade farkı dahil)' else '' end,
          l.olusturan)
  returning id into v_h;
  update public.paytr_islemler set cari_hareket_id = v_h where id = v_p;
  update public.odeme_link_odemeleri set durum = 'Ödendi', merchant_oid = p_merchant_oid, toplam = round(p_toplam, 2), odeme_zamani = now(),
         paytr_islem_id = v_p, cari_hareket_id = v_h, makbuz_no = v_m where id = o.id;
  return jsonb_build_object('makbuz_no', v_m, 'cari_hareket_id', v_h, 'paytr_islem_id', v_p);
end $$;
revoke all on function public.paytr_link_odendi(text, text, numeric, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.paytr_link_odendi(text, text, numeric, numeric, text, jsonb) to service_role;

-- Gece/2 saatte bir gelen PayTR islem dokumu, link odemesini ikinci kez "eslesmemis" olarak eklemesin:
-- ayni odemenin link kaydi varsa dokumdeki ayrintilar (kart, kesinti, net, taksit) o kayda islenir.
create or replace function private.paytr_link_birlestir() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  if new.dis_ref like 'link:%' or new.islem_tipi <> 'Satış' then return new; end if;
  if exists (select 1 from public.paytr_islemler where dis_ref = new.dis_ref) then return new; end if; -- normal guncelleme
  select id into v_id from public.paytr_islemler
   where dis_ref like 'link:%' and hesap = new.hesap and nullif(new.siparis_no, '') is not null and siparis_no = new.siparis_no limit 1;
  if v_id is null then -- siparis no tutmazsa: ayni gun, ayni tutar, tek aday
    select min(id) into v_id from public.paytr_islemler
     where dis_ref like 'link:%' and hesap = new.hesap and islem_tarihi between new.islem_tarihi - 1 and new.islem_tarihi + 1 and islem_tutari = new.islem_tutari
     having count(*) = 1;
  end if;
  if v_id is null then return new; end if;
  update public.paytr_islemler set dis_ref = new.dis_ref, islem_tarihi = new.islem_tarihi,
         odeme_tutari = coalesce(new.odeme_tutari, odeme_tutari), net_tutar = new.net_tutar, kesinti_tutari = new.kesinti_tutari, kesinti_orani = new.kesinti_orani,
         taksit = new.taksit, kart_marka = new.kart_marka, kart_no = new.kart_no, odeme_tipi = coalesce(new.odeme_tipi, odeme_tipi),
         ham = coalesce(ham, '{}'::jsonb) || jsonb_build_object('islem_dokumu', new.ham)
   where id = v_id;
  return null;
end $$;
drop trigger if exists paytr_link_birlestir on public.paytr_islemler;
create trigger paytr_link_birlestir before insert on public.paytr_islemler for each row execute function private.paytr_link_birlestir();

-- v2: 12 taksite kadar, komisyonu kim oduyor (Firma / Müşteri), oranlar ve sayfa bilgileri ayarlar.odeme_link'te
-- (Supabase'e uygulanacak hali: odeme_linkleri_komisyon migration'i)

-- Yeni linkler 32 karakterlik token ile olusur (daha kisa link)
-- alter table public.odeme_linkleri alter column token set default replace(gen_random_uuid()::text, '-', '');
