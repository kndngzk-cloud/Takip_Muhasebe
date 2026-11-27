-- Sabit gelirler (kira geliri vb.): sabit_giderler tablosu yon = 'Tahsilat' ile kullanilir.
-- Uretilen satirlar Odemeler'de "tahsil edilecek" (yon Tahsilat, kaynak 'Gelir') olarak gorunur, nakit akisinda gelecek tarafina sayilir.
alter table public.sabit_giderler add column if not exists yon text not null default 'Ödeme' check (yon in ('Ödeme', 'Tahsilat'));

create or replace function public.sabit_gider_uret(p_id bigint default null) returns int language plpgsql security definer set search_path to '' as $$
declare s public.sabit_giderler; ay date; v date; n int := 0; bas date := date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date;
begin
  for s in select * from public.sabit_giderler where (p_id is null or id = p_id) loop
    delete from public.odeme_plani where sabit_gider_id = s.id and not odendi and vade_tarihi >= bas
      and (not s.aktif or (s.bitis is not null and vade_tarihi > s.bitis) or vade_tarihi < s.baslangic);
    if not s.aktif then continue; end if;
    for i in 0..5 loop
      ay := (bas + make_interval(months => i))::date;
      v := least(ay + (s.gun - 1), (ay + interval '1 month' - interval '1 day')::date);
      if v < s.baslangic or (s.bitis is not null and v > s.bitis) then continue; end if;
      insert into public.odeme_plani (yon, kategori, gider_kategori, aciklama, tetik, vade_tarihi, tutar, para_birimi, kaynak, faturali, sabit_gider_id)
      values (s.yon, case when s.yon = 'Tahsilat' then 'Diğer' else public.gider_plan_kategori(s.kategori) end, s.kategori, s.ad, 'Tarih', v, s.tutar, 'TRY',
              case when s.yon = 'Tahsilat' then 'Gelir' else 'Gider' end, s.faturali, s.id)
      on conflict (sabit_gider_id, vade_tarihi) where sabit_gider_id is not null do update
        set tutar = excluded.tutar, aciklama = excluded.aciklama, kategori = excluded.kategori, gider_kategori = excluded.gider_kategori, faturali = excluded.faturali,
            yon = excluded.yon, kaynak = excluded.kaynak
        where not public.odeme_plani.odendi and p_id is not null;
      n := n + 1;
    end loop;
    delete from public.odeme_plani where sabit_gider_id = s.id and not odendi and vade_tarihi >= bas
      and extract(day from vade_tarihi)::int <> least(s.gun, extract(day from (date_trunc('month', vade_tarihi) + interval '1 month' - interval '1 day'))::int);
  end loop;
  return n;
end $$;
