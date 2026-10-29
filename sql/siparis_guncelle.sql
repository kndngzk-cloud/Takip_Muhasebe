-- Siparis duzenleme islemi. Supabase > SQL Editor > New query: bu metnin tamamini yapistirip Run deyin.
create or replace function public.siparis_guncelle(
  p_siparis_id bigint,
  p_kalemler jsonb,
  p_fatura_tipi text,
  p_gonderim_sekli text default null,
  p_tarih date default null,
  p_kdv_orani numeric default null,
  p_aciklama text default null,
  p_sevk_sehri text default null,
  p_maliyet_yontemi text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_sip public.siparisler;
  v_kdv numeric;
  v_ara numeric;
  v_k jsonb;
begin
  select * into v_sip from public.siparisler where id = p_siparis_id for update;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  if v_sip.durum = 'İptal' then raise exception 'İptal edilmiş sipariş düzenlenemez.'; end if;
  if p_kalemler is null or jsonb_typeof(p_kalemler) <> 'array' or jsonb_array_length(p_kalemler) = 0 then
    raise exception 'Siparişte en az bir ürün olmalı.';
  end if;
  if p_fatura_tipi not in ('R','GR') then raise exception 'Fatura tipi R veya GR olmalı.'; end if;
  if coalesce(p_maliyet_yontemi, v_sip.maliyet_yontemi) not in ('FIFO','LIFO') then raise exception 'Maliyet yöntemi FIFO veya LIFO olmalı.'; end if;

  v_kdv := case when p_fatura_tipi = 'R'
                then coalesce(p_kdv_orani, (select kdv_orani from public.ayarlar where id = 1), 0) else 0 end;

  -- bu siparisin eski sevk cikislari ve kalemleri (sadece bu siparis)
  delete from public.stok_hareketleri where siparis_id = v_sip.id and islem = 'Sevk';
  delete from public.siparis_kalemleri where siparis_id = v_sip.id;

  for v_k in select * from jsonb_array_elements(p_kalemler) loop
    if coalesce((v_k->>'miktar')::numeric, 0) <= 0 then raise exception 'Miktar 0''dan büyük olmalı.'; end if;
    insert into public.siparis_kalemleri (siparis_id, urun_id, miktar, birim_fiyat)
    values (v_sip.id, (v_k->>'urun_id')::bigint, (v_k->>'miktar')::numeric, coalesce((v_k->>'birim_fiyat')::numeric, 0));
  end loop;

  select coalesce(sum(tutar), 0) into v_ara from public.siparis_kalemleri where siparis_id = v_sip.id;
  update public.siparisler set
      tarih = coalesce(p_tarih, tarih),
      fatura_tipi = p_fatura_tipi,
      gonderim_sekli = nullif(trim(p_gonderim_sekli), ''),
      sevk_sehri = coalesce(nullif(trim(p_sevk_sehri), ''), sevk_sehri),
      aciklama = nullif(trim(p_aciklama), ''),
      maliyet_yontemi = coalesce(p_maliyet_yontemi, maliyet_yontemi),
      kdv_orani = v_kdv,
      ara_toplam = v_ara,
      kdv_tutari = round(v_ara * v_kdv, 2),
      genel_toplam = v_ara + round(v_ara * v_kdv, 2)
    where id = v_sip.id returning * into v_sip;

  if v_sip.durum = 'Sevk Edildi' then
    insert into public.stok_hareketleri (tarih, urun_id, tur, islem, miktar, belge_no, aciklama, siparis_id, kalem_id)
    select coalesce(v_sip.sevk_tarihi, v_sip.tarih), urun_id, 'Çıkış', 'Sevk', miktar, 'Fiş ' || v_sip.fis_no,
           coalesce(v_sip.gonderim_sekli, ''), v_sip.id, id
    from public.siparis_kalemleri where siparis_id = v_sip.id;
  end if;

  update public.cari_hareketler set
      tarih = v_sip.tarih, fatura_tipi = v_sip.fatura_tipi, matrah = v_sip.ara_toplam,
      kdv_tutari = v_sip.kdv_tutari, borc = v_sip.genel_toplam, aciklama = v_sip.aciklama
    where siparis_id = v_sip.id and islem = 'Satış' and otomatik;
  update public.cari_hareketler set
      tarih = v_sip.tarih, fatura_tipi = v_sip.fatura_tipi, alacak = v_sip.genel_toplam
    where siparis_id = v_sip.id and islem = 'Tahsilat' and otomatik;

  return jsonb_build_object('id', v_sip.id, 'fis_no', v_sip.fis_no, 'genel_toplam', v_sip.genel_toplam);
end $$;

revoke execute on function public.siparis_guncelle(bigint, jsonb, text, text, date, numeric, text, text, text) from public, anon;
grant execute on function public.siparis_guncelle(bigint, jsonb, text, text, date, numeric, text, text, text) to authenticated;
