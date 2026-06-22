-- ============================================================================
-- Ranking Becas ICEX 50ª Promoción — esquema Supabase
-- Pégalo entero en: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Tabla principal (NO se expone directamente a "anon": ni SELECT, ni INSERT,
--    ni UPDATE, ni DELETE. Todo el acceso público pasa por la vista de abajo
--    (solo lectura, sin el PIN) y por las funciones RPC (que sí validan el PIN).
-- ----------------------------------------------------------------------------
create table public.entries (
  id                  uuid primary key default gen_random_uuid(),
  alias               text not null,
  pin_hash            text not null,
  master_grade_known  numeric(6,3) not null check (master_grade_known between 0 and 100),
  tfm_status          text not null check (tfm_status in ('apto','suspenso','pendiente')),
  language_level      text not null check (language_level in ('ninguno','b2','c1','c2')),
  tics_grade          numeric(6,3) not null check (tics_grade between 0 and 100),
  preferences         text[] not null check (array_length(preferences,1) between 5 and 15),
  final_score         numeric(7,3) generated always as (
    round(
      (0.85 * ((master_grade_known * 53 + (case tfm_status when 'apto' then 100 else 0 end) * 7) / 60.0))
      + (0.10 * (case language_level when 'ninguno' then 0 when 'b2' then 50 when 'c1' then 75 when 'c2' then 100 else 0 end))
      + (0.05 * tics_grade)
    , 3)
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_entries_final_score on public.entries (final_score desc);

alter table public.entries enable row level security;
-- A propósito no se crea ninguna policy: sin policy + RLS activado = nadie
-- (ni anon ni authenticated) puede leer/escribir la tabla directamente.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_entries_updated_at
before update on public.entries
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Vista pública de solo lectura (sin pin_hash) con el ranking calculado
-- ----------------------------------------------------------------------------
create view public.ranking as
select
  id,
  alias,
  master_grade_known,
  tfm_status,
  language_level,
  tics_grade,
  preferences,
  final_score,
  rank() over (order by final_score desc) as posicion,
  created_at,
  updated_at
from public.entries;

grant select on public.ranking to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Funciones RPC (SECURITY DEFINER): único punto de escritura.
--    El PIN se compara con crypt() sobre el hash bcrypt, nunca en claro.
-- ----------------------------------------------------------------------------

-- Crear entrada
create or replace function public.create_entry(
  p_alias text,
  p_pin text,
  p_master_grade numeric,
  p_tfm text,
  p_lang text,
  p_tics numeric,
  p_preferences text[]
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  new_id uuid;
begin
  if p_pin is null or length(p_pin) < 4 then
    raise exception 'El código personal debe tener al menos 4 caracteres';
  end if;
  if p_alias is null or length(trim(p_alias)) = 0 then
    raise exception 'Falta el alias';
  end if;
  if array_length(p_preferences,1) is null or array_length(p_preferences,1) < 5 or array_length(p_preferences,1) > 15 then
    raise exception 'Debes indicar entre 5 y 15 destinos';
  end if;
  if exists (select 1 from entries where lower(alias) = lower(p_alias)) then
    raise exception 'Ese alias ya está en uso, elige otro';
  end if;

  insert into entries (alias, pin_hash, master_grade_known, tfm_status, language_level, tics_grade, preferences)
  values (trim(p_alias), crypt(p_pin, gen_salt('bf')), p_master_grade, p_tfm, p_lang, p_tics, p_preferences)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_entry(text,text,numeric,text,text,numeric,text[]) to anon, authenticated;

-- Recuperar mi entrada (para precargar el formulario de edición)
create or replace function public.get_my_entry(p_alias text, p_pin text)
returns table (
  id uuid, alias text, master_grade_known numeric, tfm_status text,
  language_level text, tics_grade numeric, preferences text[], final_score numeric
)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
  select e.id, e.alias, e.master_grade_known, e.tfm_status, e.language_level,
         e.tics_grade, e.preferences, e.final_score
  from entries e
  where lower(e.alias) = lower(p_alias) and e.pin_hash = crypt(p_pin, e.pin_hash)
  limit 1;
end;
$$;

grant execute on function public.get_my_entry(text,text) to anon, authenticated;

-- Actualizar mi entrada
create or replace function public.update_entry(
  p_alias text,
  p_pin text,
  p_new_alias text,
  p_master_grade numeric,
  p_tfm text,
  p_lang text,
  p_tics numeric,
  p_preferences text[]
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  match_id uuid;
begin
  select id into match_id from entries
  where lower(alias) = lower(p_alias) and pin_hash = crypt(p_pin, pin_hash)
  limit 1;

  if match_id is null then
    raise exception 'Alias o código incorrecto';
  end if;
  if array_length(p_preferences,1) is null or array_length(p_preferences,1) < 5 or array_length(p_preferences,1) > 15 then
    raise exception 'Debes indicar entre 5 y 15 destinos';
  end if;
  if p_new_alias is not null and length(trim(p_new_alias)) > 0
     and lower(p_new_alias) <> lower(p_alias)
     and exists (select 1 from entries where lower(alias) = lower(p_new_alias)) then
    raise exception 'Ese alias ya está en uso, elige otro';
  end if;

  update entries set
    alias = coalesce(nullif(trim(p_new_alias), ''), alias),
    master_grade_known = p_master_grade,
    tfm_status = p_tfm,
    language_level = p_lang,
    tics_grade = p_tics,
    preferences = p_preferences
  where id = match_id;

  return true;
end;
$$;

grant execute on function public.update_entry(text,text,text,numeric,text,text,numeric,text[]) to anon, authenticated;

-- Eliminar mi entrada
create or replace function public.delete_entry(
  p_alias text,
  p_pin text
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  match_id uuid;
begin
  select id into match_id from entries
  where lower(alias) = lower(p_alias) and pin_hash = crypt(p_pin, pin_hash)
  limit 1;

  if match_id is null then
    raise exception 'Alias o código incorrecto';
  end if;

  delete from entries where id = match_id;
  return true;
end;
$$;

grant execute on function public.delete_entry(text,text) to anon, authenticated;

-- ============================================================================
-- Fin del esquema. Tras ejecutarlo, ve a Project Settings > API y copia
-- "Project URL" y "anon public key" en js/config.js del sitio web.
-- ============================================================================
