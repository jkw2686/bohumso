begin;
-- Public service areas are reference centroids, never expert GPS coordinates.
create table private.service_areas(id text primary key,name text not null,region text not null,latitude double precision not null,longitude double precision not null);
create table private.expert_service_areas(user_id uuid primary key references auth.users(id) on delete cascade,primary_area text not null references private.service_areas,secondary_areas text[] not null default '{}',changed_at timestamptz not null default now(),check(cardinality(secondary_areas)<=2));
create table private.service_area_history(id bigint generated always as identity primary key,user_id uuid not null,primary_area text not null,secondary_areas text[] not null,changed_at timestamptz not null default now());
create table private.instant_availability(user_id uuid primary key references auth.users(id) on delete cascade,enabled boolean not null default false,started_at timestamptz,expires_at timestamptz,latitude double precision,longitude double precision,accuracy double precision,updated_at timestamptz,consent_at timestamptz,check(latitude between -90 and 90),check(longitude between -180 and 180));
create table private.urgent_requests(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),request_key uuid not null,area_id text not null references private.service_areas,purpose text not null check(purpose in ('death','illness','medical','accident','claim','coverage')),place text not null check(length(place) between 2 and 160),phone text not null check(phone ~ '^01[0-9]{8,9}$'),note text not null default '' check(length(note)<=300),latitude double precision,longitude double precision,planner_id uuid references auth.users(id),state text not null default 'REQUESTED' check(state in ('REQUESTED','ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED','COMPLETED','CANCELLED','EXPIRED')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',ends_at timestamptz not null default now()+interval '4 hours',accepted_at timestamptz,closed_at timestamptz,consent_at timestamptz not null default now(),unique(customer_id,request_key),check(customer_id is distinct from planner_id));
create table private.urgent_offers(request_id uuid not null references private.urgent_requests on delete cascade,planner_id uuid not null references auth.users(id),rank integer not null,distance_km integer not null,state text not null default 'OFFERED' check(state in ('OFFERED','PASSED','ACCEPTED','CLOSED')),primary key(request_id,planner_id));
create table private.urgent_events(id bigint generated always as identity primary key,request_id uuid not null references private.urgent_requests on delete cascade,actor uuid,event text not null,created_at timestamptz not null default now());
create unique index urgent_one_active_expert on private.urgent_requests(planner_id) where state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED');
revoke all on private.service_areas,private.expert_service_areas,private.service_area_history,private.instant_availability,private.urgent_requests,private.urgent_offers,private.urgent_events from public,anon,authenticated;
alter table private.service_areas enable row level security;
alter table private.expert_service_areas enable row level security;
alter table private.service_area_history enable row level security;
alter table private.instant_availability enable row level security;
alter table private.urgent_requests enable row level security;
alter table private.urgent_offers enable row level security;
alter table private.urgent_events enable row level security;
create function private.urgent_eligible(subject uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare eligible boolean; restricted boolean:=false;
begin
 select exists(select 1 from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id join auth.users u on u.id=d.user_id join public.member_profiles m on m.user_id=d.user_id where d.user_id=subject and not d.is_sample and d.verified_at is not null and p.status='approved' and p.profession in ('planner','adjuster') and u.email_confirmed_at is not null and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or (to_jsonb(u)->>'banned_until')::timestamptz<=now()) and u.phone_confirmed_at is not null and exists(select 1 from public.member_consents c where c.user_id=subject and c.version<>'')) into eligible;
 -- The legacy live approval system and newer optional document review both work.
 if to_regclass('private.expert_applications') is not null then
  execute $q$select exists(select 1 from private.expert_applications e where e.user_id=$1 and (e.status<>'approved' or e.sanction='banned' or (e.sanction='suspended' and e.sanction_until>now())))$q$ into restricted using subject;
 end if;
 return eligible and not restricted;
end $$;
create function private.urgent_distance(a double precision,b double precision,c double precision,d double precision) returns double precision language sql immutable set search_path='' as $$select 6371*2*asin(sqrt(least(1.0,power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))))$$;
create function private.expire_urgent() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where (expires_at<=now() or not private.urgent_eligible(user_id)) and (enabled or latitude is not null);
 update private.urgent_requests set state='EXPIRED',closed_at=now(),latitude=null,longitude=null where (state='REQUESTED' and expires_at<=now()) or (state not in ('COMPLETED','CANCELLED','EXPIRED') and ends_at<=now());
 update private.urgent_offers o set state='CLOSED' from private.urgent_requests r where o.request_id=r.id and o.state='OFFERED' and r.state<>'REQUESTED';
 -- No movement history. Exact meeting coordinates are removed at arrival/end.
 update private.urgent_requests set latitude=null,longitude=null where state in ('ARRIVED','COMPLETED','CANCELLED','EXPIRED') and latitude is not null;
 -- Contact/place/notes retained for at most 24 hours after the request window ends.
 delete from private.urgent_requests where ends_at<now()-interval '24 hours';
 delete from private.service_area_history where changed_at<now()-interval '1 year';
end $$;
create function public.service_area_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'region',a.region,'latitude',a.latitude,'longitude',a.longitude,'expertCount',(select count(*) from private.expert_service_areas s join private.instant_availability i using(user_id) where s.primary_area=a.id and private.urgent_eligible(s.user_id) and i.updated_at>now()-interval '7 days')) order by a.region,a.name),'[]'::jsonb) from private.service_areas a
$$;
create function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); area private.service_areas; r private.urgent_requests; rid uuid; aid text; secondary text[]; until_at timestamptz; lat double precision; lng double precision; acc double precision; result jsonb; next_state text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 perform private.expire_urgent();
 if operation='save_areas' then
  if not exists(select 1 from public.partner_applications where user_id=actor) then raise exception 'expert_required';end if;
  aid:=payload->>'primary';select array_agg(value) into secondary from jsonb_array_elements_text(coalesce(payload->'secondary','[]'));
  secondary:=coalesce(secondary,'{}');
  if not exists(select 1 from private.service_areas where id=aid) or cardinality(secondary)>2 or aid=any(secondary) or cardinality(secondary)<>(select count(distinct x) from unnest(secondary) x) or exists(select 1 from unnest(secondary) x where not exists(select 1 from private.service_areas where id=x)) then raise exception 'invalid_area';end if;
  insert into private.expert_service_areas values(actor,aid,secondary,now()) on conflict(user_id) do update set primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,changed_at=now();
  insert into private.service_area_history(user_id,primary_area,secondary_areas) values(actor,aid,secondary);
  return jsonb_build_object('saved',true);
 elsif operation='settings' then
  return jsonb_build_object('areas',(select to_jsonb(s)-'user_id' from private.expert_service_areas s where user_id=actor),'instant',(select jsonb_build_object('enabled',enabled and expires_at>now(),'expires_at',expires_at,'updated_at',updated_at) from private.instant_availability where user_id=actor),'eligible',private.urgent_eligible(actor),'ENABLE_LIVE_LOCATION',false,'ENABLE_BACKGROUND_LOCATION',false);
 elsif operation='stop' then
  update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null,updated_at=now() where user_id=actor;return jsonb_build_object('saved',true);
 elsif operation='start' then
  if not private.urgent_eligible(actor) or not exists(select 1 from private.expert_service_areas where user_id=actor) then raise exception 'expert_verification_required';end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'location_consent_required';end if;
  until_at:=case payload->>'duration' when '30' then now()+interval '30 minutes' when '60' then now()+interval '1 hour' when '18' then ((now() at time zone 'Asia/Seoul')::date+time '18:00') at time zone 'Asia/Seoul' end;
  lat:=(payload->>'latitude')::double precision;lng:=(payload->>'longitude')::double precision;acc:=(payload->>'accuracy')::double precision;
  if until_at is null or until_at<=now() or lat is null or lng is null or not(lat between 33 and 39 and lng between 124 and 132) or acc is null or not(acc between 0 and 3000) then raise exception 'invalid_location';end if;
  insert into private.instant_availability values(actor,true,now(),until_at,lat,lng,acc,now(),now()) on conflict(user_id) do update set enabled=true,started_at=now(),expires_at=excluded.expires_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,updated_at=now(),consent_at=now();
  return jsonb_build_object('expires_at',until_at);
 elsif operation='catalog' then
  select * into area from private.service_areas where id=payload->>'area';
  if area.id is null then return '[]'::jsonb;end if;
  -- Distances use the selected public area centre, avoiding arbitrary-point triangulation.
  select coalesce(jsonb_agg(item order by distance),'[]') into result from (select ceil(private.urgent_distance(area.latitude,area.longitude,i.latitude,i.longitude)) distance,jsonb_build_object('id',i.user_id,'name',p.full_name,'specialties',d.specialties,'primaryServiceArea',a.name,'instantAvailability',true,'distanceKm',ceil(private.urgent_distance(area.latitude,area.longitude,i.latitude,i.longitude)),'estimatedArrivalRange','수락 후 안내','areaId',a.id) item from private.instant_availability i join public.partner_applications p on p.user_id=i.user_id join private.planner_directory d on d.user_id=i.user_id join private.expert_service_areas s on s.user_id=i.user_id join private.service_areas a on a.id=s.primary_area where i.enabled and i.expires_at>now() and private.urgent_eligible(i.user_id) and private.urgent_distance(area.latitude,area.longitude,i.latitude,i.longitude)<=30 and not exists(select 1 from private.urgent_requests q where q.planner_id=i.user_id and q.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED'))) x;
  return result;
 elsif operation='request' then
  perform 1 from public.member_profiles where user_id=actor for update;
  select * into r from private.urgent_requests where customer_id=actor and request_key=(payload->>'request_key')::uuid;
  if r.id is not null then return jsonb_build_object('id',r.id,'replay',true);end if;
  if payload->>'consent' is distinct from 'true' then raise exception 'contact_consent_required';end if;
  if exists(select 1 from private.urgent_requests where customer_id=actor and state not in ('COMPLETED','CANCELLED','EXPIRED')) or (select count(*) from private.urgent_events e where e.actor=actor and event='REQUESTED' and created_at>now()-interval '1 hour')>=3 then raise exception 'request_limit';end if;
  select * into area from private.service_areas where id=payload->>'area';if area.id is null then raise exception 'invalid_area';end if;
  lat:=coalesce((payload->>'latitude')::double precision,area.latitude);lng:=coalesce((payload->>'longitude')::double precision,area.longitude);
  if not(lat between 33 and 39 and lng between 124 and 132) then raise exception 'invalid_location';end if;
  insert into private.urgent_requests(customer_id,request_key,area_id,purpose,place,phone,note,latitude,longitude) values(actor,(payload->>'request_key')::uuid,area.id,payload->>'purpose',trim(payload->>'place'),payload->>'phone',coalesce(payload->>'note',''),lat,lng) returning * into r;
  insert into private.urgent_offers(request_id,planner_id,rank,distance_km)
   select r.id,x.user_id,row_number() over(order by x.match desc,x.distance,x.recent,x.rate desc,x.local desc),ceil(x.distance) from (
    select i.user_id,private.specialty_match(r.purpose,d.specialties) match,private.urgent_distance(lat,lng,i.latitude,i.longitude) distance,
    ((select count(*) from private.urgent_requests q where q.planner_id=i.user_id and q.accepted_at>now()-interval '7 days')+(select count(*) from private.consultations c where c.planner_id=i.user_id and c.created_at>now()-interval '7 days' and c.state not in ('cancelled','unmatched'))) recent,
    (select coalesce(avg(case when o.state='ACCEPTED' then 1.0 else 0 end),0) from private.urgent_offers o where o.planner_id=i.user_id) rate,
    (s.primary_area=area.id or area.id=any(s.secondary_areas)) local
    from private.instant_availability i join private.planner_directory d on d.user_id=i.user_id join private.expert_service_areas s on s.user_id=i.user_id
    where i.user_id<>actor and i.enabled and i.expires_at>now() and private.urgent_eligible(i.user_id) and not exists(select 1 from private.urgent_requests q where q.planner_id=i.user_id and q.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED'))
   ) x where x.distance<=30 order by x.match desc,x.distance,x.recent,x.rate desc,x.local desc limit 5;
  if not found then raise exception 'no_available_expert';end if;
  insert into private.urgent_events(request_id,actor,event) values(r.id,actor,'REQUESTED');
  return jsonb_build_object('id',r.id);
 elsif operation='workspace' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'state',q.state,'purpose',q.purpose,'region',a.region||' '||a.name,'distanceKm',o.distance_km,'rank',o.rank,'requestMethod','방문 상담','expires_at',q.expires_at,'ends_at',q.ends_at,'mine',q.customer_id=actor,'assigned',q.planner_id=actor,'expertName',p.full_name,
   'details',case when q.customer_id=actor or (q.planner_id=actor and private.urgent_eligible(actor) and q.state not in ('CANCELLED','EXPIRED')) then jsonb_build_object('place',q.place,'phone',q.phone,'note',q.note) end,
   'timeline',(select coalesce(jsonb_agg(jsonb_build_object('state',e.event,'at',e.created_at) order by e.id),'[]') from private.urgent_events e where e.request_id=q.id)) order by q.created_at desc),'[]') into result
   from private.urgent_requests q join private.service_areas a on a.id=q.area_id left join private.urgent_offers o on o.request_id=q.id and o.planner_id=actor left join public.partner_applications p on p.user_id=q.planner_id
   where q.customer_id=actor or (private.urgent_eligible(actor) and (q.planner_id=actor or (q.state='REQUESTED' and o.state='OFFERED' and exists(select 1 from private.instant_availability i where i.user_id=actor and i.enabled and i.expires_at>now()))));
  return result;
 elsif operation in ('accept','pass','trip','cancel') then
  rid:=(payload->>'id')::uuid;
  select * into r from private.urgent_requests where id=rid for update;
  if r.id is null then raise exception 'request_forbidden';end if;
  if operation in ('accept','pass') then
   if r.state<>'REQUESTED' or r.expires_at<=now() or not private.urgent_eligible(actor) or not exists(select 1 from private.urgent_offers where request_id=rid and planner_id=actor and state='OFFERED') then raise exception 'offer_unavailable';end if;
   if operation='pass' then update private.urgent_offers set state='PASSED' where request_id=rid and planner_id=actor;return jsonb_build_object('saved',true);end if;
   perform 1 from private.instant_availability where user_id=actor and enabled and expires_at>now() for update;
   if not found or exists(select 1 from private.urgent_requests where planner_id=actor and state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED')) then raise exception 'expert_busy';end if;
   update private.urgent_requests set planner_id=actor,state='ACCEPTED',accepted_at=now() where id=rid;
   update private.urgent_offers set state=case when planner_id=actor then 'ACCEPTED' else 'CLOSED' end where request_id=rid;
   update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where user_id=actor;
   next_state:='ACCEPTED';
  elsif operation='cancel' then
   if actor<>r.customer_id and actor is distinct from r.planner_id then raise exception 'request_forbidden';end if;
   if r.state in ('COMPLETED','CANCELLED','EXPIRED') then raise exception 'invalid_transition';end if;
   next_state:='CANCELLED';
  else
   if actor is distinct from r.planner_id or not private.urgent_eligible(actor) then raise exception 'request_forbidden';end if;
   if payload->>'shareLocation'='true' then raise exception 'live_location_disabled';end if;
   next_state:=payload->>'state';
   if next_state is null or not((r.state='ACCEPTED' and next_state in ('PREPARING','DEPARTED')) or (r.state='PREPARING' and next_state='DEPARTED') or (r.state='DEPARTED' and next_state in ('EN_ROUTE','ARRIVED')) or (r.state='EN_ROUTE' and next_state='ARRIVED') or (r.state='ARRIVED' and next_state='COMPLETED')) then raise exception 'invalid_transition';end if;
  end if;
  update private.urgent_requests set state=next_state,closed_at=case when next_state in ('CANCELLED','COMPLETED') then now() else closed_at end,latitude=case when next_state in ('ARRIVED','COMPLETED','CANCELLED') then null else latitude end,longitude=case when next_state in ('ARRIVED','COMPLETED','CANCELLED') then null else longitude end where id=rid;
  if next_state in ('ARRIVED','COMPLETED','CANCELLED') then update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where user_id=r.planner_id;end if;
  insert into private.urgent_events(request_id,actor,event) values(rid,actor,next_state);return jsonb_build_object('saved',true);
 else raise exception 'invalid_operation';end if;
end $$;
revoke all on function private.urgent_eligible(uuid),private.urgent_distance(double precision,double precision,double precision,double precision),private.expire_urgent() from public,anon,authenticated;
revoke all on function public.service_area_catalog(),public.urgent_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.service_area_catalog() to anon,authenticated;
grant execute on function public.urgent_command(text,jsonb) to authenticated;
insert into private.service_areas values
('서울 종로구','종로구','서울',37.573,126.979),
('서울 중구','중구','서울',37.564,126.998),
('서울 용산구','용산구','서울',37.532,126.99),
('서울 성동구','성동구','서울',37.563,127.037),
('서울 광진구','광진구','서울',37.538,127.082),
('서울 동대문구','동대문구','서울',37.574,127.04),
('서울 중랑구','중랑구','서울',37.606,127.093),
('서울 성북구','성북구','서울',37.589,127.016),
('서울 강북구','강북구','서울',37.64,127.025),
('서울 도봉구','도봉구','서울',37.669,127.047),
('서울 노원구','노원구','서울',37.654,127.056),
('서울 은평구','은평구','서울',37.602,126.929),
('서울 서대문구','서대문구','서울',37.579,126.936),
('서울 마포구','마포구','서울',37.566,126.902),
('서울 양천구','양천구','서울',37.517,126.866),
('서울 강서구','강서구','서울',37.551,126.849),
('서울 구로구','구로구','서울',37.495,126.888),
('서울 금천구','금천구','서울',37.457,126.896),
('서울 영등포구','영등포구','서울',37.526,126.896),
('서울 동작구','동작구','서울',37.512,126.94),
('서울 관악구','관악구','서울',37.478,126.951),
('서울 서초구','서초구','서울',37.483,127.032),
('서울 강남구','강남구','서울',37.518,127.047),
('서울 송파구','송파구','서울',37.514,127.106),
('서울 강동구','강동구','서울',37.53,127.124),
('경기 수원시 장안구','수원시 장안구','경기',37.304,127.01),
('경기 수원시 권선구','수원시 권선구','경기',37.257,126.972),
('경기 수원시 팔달구','수원시 팔달구','경기',37.282,127.02),
('경기 수원시 영통구','수원시 영통구','경기',37.259,127.046),
('경기 성남시 수정구','성남시 수정구','경기',37.451,127.145),
('경기 성남시 중원구','성남시 중원구','경기',37.431,127.138),
('경기 분당','분당','경기',37.383,127.119),
('경기 고양시 덕양구','고양시 덕양구','경기',37.637,126.832),
('경기 고양시 일산동구','고양시 일산동구','경기',37.659,126.774),
('경기 고양시 일산서구','고양시 일산서구','경기',37.677,126.747),
('경기 용인시 처인구','용인시 처인구','경기',37.234,127.201),
('경기 용인시 기흥구','용인시 기흥구','경기',37.28,127.115),
('경기 수지','수지','경기',37.322,127.098),
('경기 부천시 원미구','부천시 원미구','경기',37.498,126.783),
('경기 부천시 소사구','부천시 소사구','경기',37.48,126.799),
('경기 부천시 오정구','부천시 오정구','경기',37.528,126.796),
('경기 안산시 상록구','안산시 상록구','경기',37.301,126.846),
('경기 안산시 단원구','안산시 단원구','경기',37.319,126.815),
('경기 안양시 만안구','안양시 만안구','경기',37.386,126.932),
('경기 안양시 동안구','안양시 동안구','경기',37.393,126.951),
('경기 화성시 만세구','화성시 만세구','경기',37.2,126.831),
('경기 화성시 효행구','화성시 효행구','경기',37.22,126.971),
('경기 화성시 병점구','화성시 병점구','경기',37.206,127.034),
('경기 화성시 동탄구','화성시 동탄구','경기',37.2,127.097),
('경기 의정부시','의정부시','경기',37.738,127.034),
('경기 평택시','평택시','경기',36.993,127.113),
('경기 동두천시','동두천시','경기',37.903,127.06),
('경기 광명시','광명시','경기',37.479,126.864),
('경기 과천시','과천시','경기',37.429,126.987),
('경기 구리시','구리시','경기',37.594,127.13),
('경기 남양주시','남양주시','경기',37.636,127.216),
('경기 오산시','오산시','경기',37.15,127.077),
('경기 시흥시','시흥시','경기',37.38,126.803),
('경기 군포시','군포시','경기',37.362,126.935),
('경기 의왕시','의왕시','경기',37.344,126.969),
('경기 하남시','하남시','경기',37.54,127.214),
('경기 파주시','파주시','경기',37.76,126.78),
('경기 이천시','이천시','경기',37.272,127.435),
('경기 안성시','안성시','경기',37.008,127.279),
('경기 김포시','김포시','경기',37.615,126.716),
('경기 광주시','광주시','경기',37.43,127.255),
('경기 양주시','양주시','경기',37.785,127.045),
('경기 포천시','포천시','경기',37.895,127.2),
('경기 여주시','여주시','경기',37.298,127.637),
('경기 연천군','연천군','경기',38.096,127.075),
('경기 가평군','가평군','경기',37.831,127.509),
('경기 양평군','양평군','경기',37.491,127.488),
('인천 제물포구','제물포구','인천',37.474,126.632),
('인천 영종구','영종구','인천',37.489,126.532),
('인천 미추홀구','미추홀구','인천',37.463,126.65),
('인천 연수구','연수구','인천',37.41,126.678),
('인천 남동구','남동구','인천',37.447,126.731),
('인천 부평구','부평구','인천',37.507,126.721),
('인천 계양구','계양구','인천',37.537,126.737),
('인천 서해구','서해구','인천',37.545,126.675),
('인천 검단구','검단구','인천',37.602,126.657),
('인천 강화군','강화군','인천',37.747,126.488),
('인천 옹진군','옹진군','인천',37.254,126.482),
('경기 판교','판교','경기',37.3948,127.1112);
-- Legacy catalog never publishes temporary expert GPS, nor stale legacy 'now' badges.
alter function public.planner_catalog(text,text) rename to planner_catalog_before_024;
revoke all on function public.planner_catalog_before_024(text,text) from public,anon,authenticated;
create function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg((p-'latitude'-'longitude')||jsonb_build_object('area_latitude',a.latitude,'area_longitude',a.longitude,'primary_service_area',a.name,'availability_status',case when i.enabled and i.expires_at>now() and private.urgent_eligible((p->>'id')::uuid) then 'now' when p->>'availability_status'='now' then 'scheduled' else p->>'availability_status' end)),'[]'))
 from jsonb_array_elements(public.planner_catalog_before_024(area,wanted)->'planners') p left join private.expert_service_areas s on s.user_id=(p->>'id')::uuid left join private.service_areas a on a.id=s.primary_area left join private.instant_availability i on i.user_id=s.user_id
$$;
revoke all on function public.planner_catalog(text,text) from public;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
