grant usage on schema public to authenticated;
grant select on public.vet_profiles to authenticated;
grant execute on function public.get_or_create_vet_profile(text, text) to authenticated;

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
    update public.vet_profiles
    set
      first_name = trim(profile_first_name),
      order_number = trim(profile_order_number),
      created_by_user_id = coalesce(created_by_user_id, auth.uid()),
      updated_at = now()
    where id = existing_profile.id
    returning * into existing_profile;

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
  on conflict (normalized_first_name, normalized_order_number) do update
  set
    first_name = excluded.first_name,
    order_number = excluded.order_number,
    created_by_user_id = coalesce(public.vet_profiles.created_by_user_id, auth.uid()),
    updated_at = now()
  returning * into existing_profile;

  return existing_profile;
end;
$$;
