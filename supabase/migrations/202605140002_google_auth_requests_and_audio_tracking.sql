create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.app_metadata->>'provider'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_user();

alter table public.consultations
  add column if not exists audio_path text,
  add column if not exists audio_uploaded_at timestamptz,
  add column if not exists audio_deleted_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists requested_by_email text;

create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  transcription_provider text not null check (transcription_provider in ('groq', 'openai')),
  report_model text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.generation_requests enable row level security;

create policy "generation_requests_select_own" on public.generation_requests for select using (auth.uid() = user_id);
create policy "generation_requests_insert_own" on public.generation_requests for insert with check (auth.uid() = user_id);
create policy "generation_requests_update_own" on public.generation_requests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
