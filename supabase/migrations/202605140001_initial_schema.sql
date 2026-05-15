create extension if not exists pgcrypto;

create table if not exists public.consultation_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.consultation_templates(id) on delete set null,
  patient_name text not null,
  owner_name text,
  species text,
  transcription_provider text not null check (transcription_provider in ('groq', 'openai')),
  transcription text,
  report_markdown text,
  report_json jsonb,
  status text not null default 'completed' check (status in ('draft', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_templates enable row level security;
alter table public.consultations enable row level security;

create policy "templates_select_own" on public.consultation_templates for select using (auth.uid() = user_id);
create policy "templates_insert_own" on public.consultation_templates for insert with check (auth.uid() = user_id);
create policy "templates_update_own" on public.consultation_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates_delete_own" on public.consultation_templates for delete using (auth.uid() = user_id);

create policy "consultations_select_own" on public.consultations for select using (auth.uid() = user_id);
create policy "consultations_insert_own" on public.consultations for insert with check (auth.uid() = user_id);
create policy "consultations_update_own" on public.consultations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "consultations_delete_own" on public.consultations for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio-temp', 'audio-temp', false, 104857600, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/aac'])
on conflict (id) do update set public = false, file_size_limit = 104857600;

create policy "audio_temp_upload_own_folder" on storage.objects for insert to authenticated
with check (bucket_id = 'audio-temp' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "audio_temp_read_own_folder" on storage.objects for select to authenticated
using (bucket_id = 'audio-temp' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "audio_temp_delete_own_folder" on storage.objects for delete to authenticated
using (bucket_id = 'audio-temp' and (storage.foldername(name))[1] = auth.uid()::text);
