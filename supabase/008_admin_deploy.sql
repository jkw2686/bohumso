begin;
create table private.admin_deploy_requests(
 id uuid primary key, actor uuid not null references auth.users(id),
 state text not null default 'pending' check(state in ('pending','accepted','unknown','rejected')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.admin_deploy_mutex(id integer primary key check(id=1));
insert into private.admin_deploy_mutex values(1);
revoke all on private.admin_deploy_requests,private.admin_deploy_mutex from public,anon,authenticated;
create function public.admin_deploy_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'admin_required';end if;
 select jsonb_build_object('latest',to_jsonb(r),'next_allowed_at',r.created_at+interval '10 minutes') into result from private.admin_deploy_requests r order by created_at desc limit 1;
 return coalesce(result,'{}'::jsonb);
end;$$;
create function public.admin_deploy_claim(request_id uuid,actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.admin_deploy_requests; last_at timestamptz;
begin
 if request_id is null or not exists(select 1 from private.admin_memberships where user_id=actor_id) then raise exception 'admin_required';end if;
 perform 1 from private.admin_deploy_mutex where id=1 for update;
 select * into existing from private.admin_deploy_requests where id=request_id;
 if found then return jsonb_build_object('send',false,'replay',true,'state',existing.state);end if;
 select max(created_at) into last_at from private.admin_deploy_requests;
 if last_at>now()-interval '10 minutes' then return jsonb_build_object('send',false,'replay',false,'next_allowed_at',last_at+interval '10 minutes');end if;
 insert into private.admin_deploy_requests(id,actor) values(request_id,actor_id);
 return jsonb_build_object('send',true,'state','pending');
end;$$;
create function public.admin_deploy_finish(request_id uuid,result_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 if result_state is null or result_state not in ('accepted','unknown','rejected') then raise exception 'invalid_state';end if;
 update private.admin_deploy_requests set state=result_state,updated_at=now() where id=request_id and state='pending';
end;$$;
revoke all on function public.admin_deploy_status(),public.admin_deploy_claim(uuid,uuid),public.admin_deploy_finish(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_deploy_status() to authenticated;
grant execute on function public.admin_deploy_claim(uuid,uuid),public.admin_deploy_finish(uuid,text) to service_role;
commit;
