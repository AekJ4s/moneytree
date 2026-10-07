-- Marks several installments as paid on their own due dates (e.g. catching up a debt added late).
-- Already-paid installments are skipped. Returns how many were marked.
create or replace function public.mark_installments_paid(p_installment_ids uuid[], p_record_interest boolean)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select i.id, i.debt_id, i.due_date, i.principal + i.interest as amount
    from public.debt_installments i
    where i.id = any (p_installment_ids)
      and i.user_id = auth.uid()
      and not exists (
        select 1 from public.debt_entries e where e.installment_id = i.id and e.kind = 'payment'
      )
    order by i.debt_id, i.seq
  loop
    perform public.add_debt_entry(v_row.debt_id, 'payment', v_row.amount, v_row.due_date,
                                  'ชำระแล้ว (ตามวันครบกำหนด)', v_row.id, p_record_interest);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.mark_installments_paid(uuid[], boolean) from public, anon;
grant execute on function public.mark_installments_paid(uuid[], boolean) to authenticated;
