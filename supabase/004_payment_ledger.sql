begin;
create function public.connection_checkout(booking_id uuid,requested_stage integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations; o private.consultation_orders; order_name text;
begin
 select * into c from private.consultations where id=booking_id for update;
 if auth.uid() is null or c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 if c.is_free is distinct from false then raise exception 'free_no_payment';end if;
 if requested_stage is null or requested_stage not in (1,2) then raise exception 'invalid_stage';end if;
 if (requested_stage=1 and (c.state<>'confirmed' or c.first_paid)) or (requested_stage=2 and (c.state<>'completed' or not c.first_paid or c.second_paid or c.payment_state not in ('balance_due','confirming','failed'))) then raise exception 'invalid_stage';end if;
 if exists(select 1 from private.consultation_issues where consultation_id=booking_id and not resolved and category in ('dispute','refund','no_show')) then raise exception 'dispute_on_hold';end if;
 if c.payment_state in ('refund_requested','refunding','refunded','refund_failed') then raise exception 'refund_on_hold';end if;
 order_name:='boh_'||replace(booking_id::text,'-','')||'_'||requested_stage::text;
 insert into private.consultation_orders(id,consultation_id,stage,amount) values(order_name,booking_id,requested_stage,c.total_won/2) on conflict(consultation_id,stage) do nothing;
 select * into o from private.consultation_orders where id=order_name;
 if o.state not in ('unpaid','confirming','failed') then raise exception 'invalid_stage';end if;
 return (to_jsonb(o)-'payment_key')||jsonb_build_object('customer_key',c.planner_id,'test_only',true);
end $$;
create function public.connection_begin_confirm(order_id text,provided_key text,provided_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations; o private.consultation_orders;
begin
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 if c.id is null or c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 select * into o from private.consultation_orders where id=order_id for update;
 if provided_key is null or length(provided_key) not between 1 and 200 or provided_amount is distinct from o.amount then raise exception 'payment_mismatch';end if;
 if o.payment_key is not null and o.payment_key<>provided_key then raise exception 'payment_key_conflict';end if;
 if o.state='paid' then return jsonb_build_object('already_paid',true,'id',o.id,'amount',o.amount,'payment_key',o.payment_key);end if;
 if (o.stage=1 and c.state<>'confirmed') or (o.stage=2 and c.state<>'completed') or c.payment_state in ('refund_requested','refunding','refunded','refund_failed') then raise exception 'invalid_stage';end if;
 if exists(select 1 from private.consultation_issues where consultation_id=c.id and not resolved and category in ('dispute','refund','no_show')) then raise exception 'dispute_on_hold';end if;
 update private.consultation_orders set state='confirming',payment_key=provided_key,updated_at=now() where id=order_id;
 update private.consultations set payment_state='confirming',updated_at=now() where id=c.id;
 insert into private.payment_attempts(order_id,action,outcome) values(order_id,'confirm','started');
 return jsonb_build_object('id',o.id,'amount',o.amount,'payment_key',provided_key);
end $$;
create function public.connection_order_lookup(order_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(o) from private.consultation_orders o where o.id=order_id
$$;
-- Only the server service role may reconcile a provider-confirmed payment.
create function public.connection_reconcile(order_id text,provided_key text,provided_amount integer,provider_status text,receipt text default null,transaction_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.consultation_orders; c private.consultations;
begin
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 select * into o from private.consultation_orders where id=order_id for update;
 if o.id is null or o.amount is distinct from provided_amount or o.payment_key is distinct from provided_key then raise exception 'payment_mismatch';end if;
 if provider_status='DONE' then
  -- A delayed success notification must never revive a refunded payment.
  if o.state in ('refunded','refunding','refund_failed','refund_requested') then return jsonb_build_object('reconcile_refund',true);end if;
  update private.consultation_orders set state='paid',receipt_url=receipt,updated_at=now() where id=order_id;
  update private.consultations set first_paid=case when o.stage=1 then true else first_paid end,second_paid=case when o.stage=2 then true else second_paid end,
  state=case when o.stage=1 and state='confirmed' then 'scheduled' else state end,
  payment_state=case when state='cancelled' or payment_state='refund_requested' then 'refund_requested' when o.stage=2 or second_paid then 'paid' when state='completed' then 'balance_due' else 'first_paid' end,updated_at=now() where id=c.id;
 elsif provider_status='CANCELED' then
  update private.consultation_orders set state='refunded',refunded_won=amount,updated_at=now() where id=order_id;
  update private.consultations set payment_state=case when exists(select 1 from private.consultation_orders other where other.consultation_id=c.id and other.state='paid') then 'refund_requested' else 'refunded' end where id=c.id;
 elsif provider_status in ('ABORTED','EXPIRED') and o.state not in ('paid','refunded') then
  update private.consultation_orders set state='failed',payment_key=null,updated_at=now() where id=order_id;
  update private.consultations set payment_state=case when o.stage=2 then 'balance_due' else 'failed' end where id=c.id;
 else return jsonb_build_object('pending',true);end if;
 insert into private.payment_attempts(order_id,action,outcome,transaction_key) values(order_id,'reconcile',provider_status,transaction_id);
 return jsonb_build_object('saved',true);
end $$;
create function public.connection_refund_request(order_id text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.consultation_orders; c private.consultations;
begin
 if not private.is_admin() or coalesce(length(trim(reason)),0)<5 then raise exception 'admin_required';end if;
 select * into o from private.consultation_orders where id=order_id;
 select * into c from private.consultations where id=o.consultation_id for update;
 if c.id is null or c.payment_state='confirming' or c.state not in ('cancelled','dispute','no_show') then raise exception 'invalid_transition';end if;
 if o.state='refunded' then return jsonb_build_object('already_refunded',true);end if;
 if o.state not in ('paid','refunding','refund_failed','refund_requested') then raise exception 'invalid_transition';end if;
 update private.consultation_orders set state='refunding',updated_at=now() where id=order_id;
 update private.consultations set payment_state='refunding' where id=c.id;
 insert into private.consultation_events(consultation_id,actor,event,reason) values(c.id,auth.uid(),'refund_approved',reason);
 return jsonb_build_object('id',o.id,'payment_key',o.payment_key,'amount',o.amount,'reason',reason);
end $$;
create function public.connection_refund_failure(order_id text) returns void language plpgsql security definer set search_path='' as $$
declare booking uuid;
begin
 select consultation_id into booking from private.consultation_orders where id=order_id;
 perform 1 from private.consultations where id=booking for update;
 update private.consultation_orders set state='refund_failed' where id=order_id and state='refunding';
 if found then update private.consultations set payment_state='refund_failed' where id=booking;end if;
 insert into private.payment_attempts(order_id,action,outcome) values(order_id,'refund','needs_reconciliation');
end $$;
revoke all on function public.connection_checkout(uuid,integer),public.connection_begin_confirm(text,text,integer),public.connection_order_lookup(text),public.connection_reconcile(text,text,integer,text,text,text),public.connection_refund_request(text,text),public.connection_refund_failure(text) from public,anon,authenticated;
grant execute on function public.connection_checkout(uuid,integer),public.connection_begin_confirm(text,text,integer),public.connection_refund_request(text,text) to authenticated;
grant execute on function public.connection_order_lookup(text),public.connection_reconcile(text,text,integer,text,text,text),public.connection_refund_failure(text) to service_role;
commit;


begin;
create function public.connection_user_order(order_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select to_jsonb(o) into result from private.consultation_orders o join private.consultations c on c.id=o.consultation_id where o.id=order_id and (c.planner_id=auth.uid() or private.is_admin());
 if result is null then raise exception 'request_forbidden';end if;
 return result;
end $$;
revoke all on function public.connection_user_order(text) from public,anon,authenticated;
grant execute on function public.connection_user_order(text) to authenticated;
commit;
