create extension if not exists unaccent;

create table if not exists public.vet_profiles (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  order_number text not null,
  normalized_first_name text not null,
  normalized_order_number text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_first_name, normalized_order_number)
);

alter table public.vet_profiles enable row level security;

create policy "vet_profiles_select_own" on public.vet_profiles
for select to authenticated using (created_by_user_id = auth.uid());

create or replace function public.normalize_vet_first_name(value text)
returns text
language sql
immutable
as $$
  select lower(unaccent(trim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g'))));
$$;

create or replace function public.normalize_vet_order_number(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(unaccent(coalesce(value, '')), '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.get_or_create_vet_profile(profile_first_name text, profile_order_number text)
returns public.vet_profiles
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_name text := public.normalize_vet_first_name(profile_first_name);
  normalized_order text := public.normalize_vet_order_number(profile_order_number);
  existing_profile public.vet_profiles;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non authentifié';
  end if;

  if normalized_name = '' or normalized_order = '' then
    raise exception 'Prénom et numéro d''ordre obligatoires';
  end if;

  select * into existing_profile
  from public.vet_profiles
  where normalized_first_name = normalized_name
    and normalized_order_number = normalized_order
  limit 1;

  if found then
    return existing_profile;
  end if;

  insert into public.vet_profiles (
    first_name,
    order_number,
    normalized_first_name,
    normalized_order_number,
    created_by_user_id
  )
  values (
    trim(profile_first_name),
    trim(profile_order_number),
    normalized_name,
    normalized_order,
    auth.uid()
  )
  on conflict (normalized_first_name, normalized_order_number) do nothing;

  select * into existing_profile
  from public.vet_profiles
  where normalized_first_name = normalized_name
    and normalized_order_number = normalized_order
  limit 1;

  return existing_profile;
end;
$$;

grant execute on function public.get_or_create_vet_profile(text, text) to authenticated;
