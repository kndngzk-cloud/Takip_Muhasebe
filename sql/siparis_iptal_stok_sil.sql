-- Elle iptal edilen sevkli sipariste stok cikisi silinir (iade kaydi olusmaz); platform iadeleri eskisi gibi 'Iade' girisi yazar.
-- Musteri iadesi Mal alisi ekranindan girilir: stoga 'Iade' girisi, cariye 'Iade' alacak kaydi.
drop function public.siparis_iptal(bigint);
CREATE FUNCTION public.siparis_iptal(p_siparis_id bigint, p_stok_sil boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_sip public.siparisler; v_tahsil numeric; v_sat numeric; v_onceki numeric; v_ters numeric; v_oran numeric;
begin
  select * into v_sip from public.siparisler where id = p_siparis_id for update;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  if v_sip.durum = 'İptal' then raise exception 'Bu sipariş zaten iptal edilmiş.'; end if;
  if v_sip.durum = 'Sevk Edildi' then
    if p_stok_sil then
      delete from public.stok_hareketleri where siparis_id = v_sip.id and islem = 'Sevk';
    else
      insert into public.stok_hareketleri (urun_id, tur, islem, miktar, belge_no, aciklama, siparis_id, kalem_id)
      select urun_id, 'Giriş', 'İade', miktar, 'Fiş ' || v_sip.fis_no, 'Sipariş iptali', v_sip.id, id
      from public.siparis_kalemleri where siparis_id = v_sip.id;
    end if;
  end if;
  select coalesce(sum(borc), 0) into v_sat from public.cari_hareketler where siparis_id = v_sip.id and islem = 'Satış';
  select coalesce(sum(alacak), 0) into v_onceki from public.cari_hareketler where siparis_id = v_sip.id and islem = 'İptal';
  v_ters := greatest(v_sat - v_onceki, 0);
  if v_ters > 0 then
    v_oran := case when v_sip.genel_toplam > 0 then v_ters / v_sip.genel_toplam else 1 end;
    insert into public.cari_hareketler (cari_id, islem, fatura_tipi, belge_no, matrah, kdv_tutari, alacak, aciklama, siparis_id, otomatik)
    values (v_sip.cari_id, 'İptal', v_sip.fatura_tipi, 'Fiş ' || v_sip.fis_no, round(v_sip.ara_toplam * v_oran, 2), round(v_sip.kdv_tutari * v_oran, 2),
            v_ters, 'Sipariş iptali', v_sip.id, true);
  end if;
  select coalesce(sum(alacak), 0) into v_tahsil from public.cari_hareketler
   where siparis_id = v_sip.id and islem = 'Tahsilat' and otomatik;
  if v_tahsil > 0 then
    insert into public.cari_hareketler (cari_id, islem, fatura_tipi, belge_no, borc, aciklama, siparis_id, otomatik)
    values (v_sip.cari_id, 'Düzeltme', v_sip.fatura_tipi, 'Fiş ' || v_sip.fis_no, v_tahsil, 'İptal - perakende tahsilat iadesi', v_sip.id, true);
  end if;
  delete from public.odeme_plani where siparis_id = v_sip.id and yon = 'Tahsilat' and not odendi;
  update public.siparisler set durum = 'İptal' where id = v_sip.id;
end $function$;
revoke all on function public.siparis_iptal(bigint, boolean) from public;
grant execute on function public.siparis_iptal(bigint, boolean) to authenticated, service_role;

alter table public.cari_hareketler drop constraint cari_hareketler_islem_check;
alter table public.cari_hareketler add constraint cari_hareketler_islem_check check (islem = any (array['Satış','Tahsilat','İptal','Düzeltme','Açılış','Alış','Ödeme','İade']));
