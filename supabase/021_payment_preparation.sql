begin;
-- Preparation only: no public RPC or payment activation. Provider billing keys stay server-side.
create table private.customer_payment_profiles (
 user_id uuid primary key references auth.users(id), provider text not null,
 provider_customer_id text not null unique, created_at timestamptz not null default now()
);
create table private.saved_payment_methods (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references private.customer_payment_profiles(user_id),
 provider_method_id text not null unique, brand text not null, last4 text not null check(last4 ~ '^[0-9]{4}$'),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table private.billing_keys (
 method_id uuid primary key references private.saved_payment_methods(id),
 encrypted_key bytea not null, key_version integer not null,
 created_at timestamptz not null default now()
);
alter table private.customer_payment_profiles enable row level security;
alter table private.saved_payment_methods enable row level security;
alter table private.billing_keys enable row level security;
revoke all on private.customer_payment_profiles,private.saved_payment_methods,private.billing_keys from public,anon,authenticated;
commit;
