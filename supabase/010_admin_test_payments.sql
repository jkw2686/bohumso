begin;
-- Isolated administrator-only test ledger. No planner/ad foreign keys or privileges.
create table private.admin_test_payments (
 id text primary key default 'testadmin_'||replace(gen_random_uuid()::text,'-',''),
 owner_id uuid not null references auth.users(id), request_key uuid not null,
 amount integer not null default 1000 check(amount=1000),
 state text not null default 'unpaid' check(state in ('unpaid','confirming','paid','failed','refunded')),
 payment_key text unique, receipt_url text, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), constraint admin_test_owner_request unique(owner_id,request_key)
);
create table private.admin_test_payment_events (
 id bigint generated always as identity primary key, order_id text not null references private.admin_test_payments(id),
 actor uuid, event text not null, created_at timestamptz not null default now()
);
revoke all on private.admin_test_payments,private.admin_test_payment_events from public,anon,authenticated;
create function public.admin_test_checkout(request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare o private.admin_test_payments;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'request_forbidden';end if;
 if request_key is null then raise exception 'request_key_required';end if;
 insert into private.admin_test_payments(owner_id,request_key) values(auth.uid(),request_key)
 on conflict on constraint admin_test_owner_request do nothing returning * into o;
 if o.id is null then select * into o from private.admin_test_payments t where t.owner_id=auth.uid() and t.request_key=request_key;
 else insert into private.admin_test_payment_events(order_id,actor,event) values(o.id,auth.uid(),'test_order_created');end if;
 return (to_jsonb(o)-'payment_key')||jsonb_build_object('customer_key',o.owner_id,'plan_name','관리자 전용 결제 점검','test_admin',true);
end $$;
create function public.admin_test_orders() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'request_forbidden';end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)-'payment_key' order by t.created_at desc),'[]') from
 (select * from private.admin_test_payments where owner_id=auth.uid() order by created_at desc limit 30) t);
end $$;
create function public.admin_test_user_order(order_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o private.admin_test_payments;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'request_forbidden';end if;
 select * into o from private.admin_test_payments where id=order_id and owner_id=auth.uid();
 if o.id is null then raise exception 'request_forbidden';end if;
 return to_jsonb(o);
end $$;
create function public.admin_test_begin_confirm(order_id text,provided_key text,provided_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.admin_test_payments;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'request_forbidden';end if;
 select * into o from private.admin_test_payments where id=order_id and owner_id=auth.uid() for update;
 if o.id is null then raise exception 'request_forbidden';end if;
 if provided_amount is distinct from o.amount or provided_key is null or length(provided_key) not between 1 and 200 then raise exception 'payment_mismatch';end if;
 if o.payment_key is not null and o.payment_key<>provided_key then raise exception 'payment_key_conflict';end if;
 if o.state not in ('unpaid','confirming','paid') then raise exception 'invalid_transition';end if;
 if o.state='unpaid' and o.created_at<now()-interval '30 minutes' then raise exception 'order_expired';end if;
 if o.state='unpaid' then
 update private.admin_test_payments set state='confirming',payment_key=provided_key,updated_at=now() where id=o.id returning * into o;
 insert into private.admin_test_payment_events(order_id,actor,event) values(o.id,auth.uid(),'test_confirm_requested');
 end if;
 return to_jsonb(o);
end $$;
create function public.admin_test_order_lookup(order_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(t) from private.admin_test_payments t where id=order_id
$$;
create function public.admin_test_reconcile(order_id text,provided_key text,provided_amount integer,provider_status text,receipt text default null,transaction_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.admin_test_payments; next_state text;
begin
 select * into o from private.admin_test_payments where id=order_id for update;
 if o.id is null or o.payment_key is null or o.payment_key is distinct from provided_key or o.amount is distinct from provided_amount then raise exception 'payment_mismatch';end if;
 if provider_status='DONE' and o.state='confirming' then next_state:='paid';
 elsif provider_status='CANCELED' and o.state in ('confirming','paid') then next_state:='refunded';
 elsif provider_status in ('ABORTED','EXPIRED') and o.state='confirming' then next_state:='failed';
 else return jsonb_build_object('unchanged',true);end if;
 update private.admin_test_payments set state=next_state,receipt_url=coalesce(receipt,receipt_url),updated_at=now() where id=o.id;
 insert into private.admin_test_payment_events(order_id,event) values(o.id,'test_provider_'||provider_status);
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.admin_test_checkout(uuid),public.admin_test_orders(),public.admin_test_user_order(text),public.admin_test_begin_confirm(text,text,integer),public.admin_test_order_lookup(text),public.admin_test_reconcile(text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_test_checkout(uuid),public.admin_test_orders(),public.admin_test_user_order(text),public.admin_test_begin_confirm(text,text,integer) to authenticated;
grant execute on function public.admin_test_order_lookup(text),public.admin_test_reconcile(text,text,integer,text,text,text) to service_role;
commit;
