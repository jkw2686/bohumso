begin;
create table private.release_controls(id boolean primary key default true check(id),policies_approved boolean not null default false,closed_beta boolean not null default true,phone_enabled boolean not null default false);
insert into private.release_controls(id) values(true);
create table private.beta_allowlist(user_id uuid primary key references auth.users(id) on delete cascade,invited_at timestamptz not null default now());
revoke all on private.release_controls,private.beta_allowlist from public,anon,authenticated;
alter table private.release_controls enable row level security;
alter table private.beta_allowlist enable row level security;
create function private.beta_allowed() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (private.is_admin() or exists(select 1 from private.beta_allowlist where user_id=auth.uid()) or exists(select 1 from private.release_controls where not closed_beta))$$;
create function public.release_status() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('policiesApproved',policies_approved,'closedBeta',closed_beta,'betaAllowed',private.beta_allowed(),'phoneEnabled',phone_enabled,'phoneVerified',exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null)) from private.release_controls$$;
create function private.require_booking_access() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if not exists(select 1 from private.release_controls where policies_approved) then raise exception 'policies_not_approved';end if;
 if not private.beta_allowed() then raise exception 'beta_invitation_required';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null) then raise exception 'phone_verification_required';end if;
end $$;
alter function public.complete_membership(boolean,boolean,boolean,boolean) rename to complete_membership_before_release;
revoke all on function public.complete_membership_before_release(boolean,boolean,boolean,boolean) from public,anon,authenticated;
create function public.complete_membership(terms_accepted boolean,privacy_accepted boolean,age_accepted boolean,marketing_accepted boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if private.is_active_member() then return public.my_membership();end if;
 if not exists(select 1 from private.release_controls where policies_approved) then raise exception 'policies_not_approved';end if;
 if not private.beta_allowed() then raise exception 'beta_invitation_required';end if;
 return public.complete_membership_before_release(terms_accepted,privacy_accepted,age_accepted,marketing_accepted);
end $$;
alter function public.consultation_command(text,jsonb) rename to consultation_command_before_release;
revoke all on function public.consultation_command_before_release(text,jsonb) from public,anon,authenticated;
create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation in ('request','confirm','office_confirm') then perform private.require_booking_access();end if;
 return public.consultation_command_before_release(operation,payload);
end $$;
alter function public.urgent_command(text,jsonb) rename to urgent_command_before_release;
revoke all on function public.urgent_command_before_release(text,jsonb) from public,anon,authenticated;
create function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation in ('request','start') then perform private.require_booking_access();end if;
 return public.urgent_command_before_release(operation,payload);
end $$;
revoke all on function private.beta_allowed(),private.require_booking_access(),public.release_status(),public.complete_membership(boolean,boolean,boolean,boolean),public.consultation_command(text,jsonb),public.urgent_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.release_status() to anon,authenticated;
grant execute on function public.complete_membership(boolean,boolean,boolean,boolean),public.consultation_command(text,jsonb),public.urgent_command(text,jsonb) to authenticated;
commit;
