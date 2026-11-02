-- Roue de Noël Galzin — schéma + tirage côté serveur
-- Le navigateur n'a AUCUN accès direct aux tables : il passe uniquement
-- par les fonctions lots_publics() et tourner_roue().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Lots de la roue (modifiables depuis le dashboard Supabase > Table editor)
-- ---------------------------------------------------------------------------
create table if not exists public.lots (
  id          text primary key,
  ordre       int  not null,              -- position sur la roue (sens horaire)
  titre       text not null,              -- gros texte sur la roue, ex: "-20%"
  sous_titre  text not null,              -- petit texte, ex: "Pain au choc"
  description text not null,              -- texte de l'écran gagnant
  couleur     text not null default '#572d14',
  poids       int  not null default 10 check (poids >= 0),  -- probabilité relative
  stock       int,                        -- null = illimité
  actif       boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Participations
-- ---------------------------------------------------------------------------
create table if not exists public.participations (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  prenom      text not null,
  carte       text not null,
  jour        date not null default (now() at time zone 'Europe/Paris')::date,
  lot_id      text not null references public.lots(id),
  code        text not null unique,
  created_at  timestamptz not null default now(),
  unique (carte, jour)                    -- 1 participation par carte et par jour
);

create index if not exists participations_jour_idx on public.participations (jour);

alter table public.lots           enable row level security;
alter table public.participations enable row level security;
-- Aucune policy : anon / authenticated ne peuvent ni lire ni écrire directement.
revoke all on public.lots, public.participations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lecture publique des lots (pour dessiner la roue) — sans poids ni stock
-- ---------------------------------------------------------------------------
create or replace function public.lots_publics()
returns table (id text, titre text, sous_titre text, couleur text)
language sql
security definer
set search_path = public
stable
as $$
  select id, titre, sous_titre, couleur
  from lots
  where actif
  order by ordre;
$$;

-- ---------------------------------------------------------------------------
-- Tirage
-- ---------------------------------------------------------------------------
create or replace function public.tourner_roue(p_nom text, p_prenom text, p_carte text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom    text := initcap(btrim(coalesce(p_nom, '')));
  v_prenom text := initcap(btrim(coalesce(p_prenom, '')));
  v_carte  text := regexp_replace(coalesce(p_carte, ''), '[^0-9A-Za-z]', '', 'g');
  v_jour   date := (now() at time zone 'Europe/Paris')::date;
  v_part   participations;
  v_lot    lots;
  v_total  int;
  v_r      int;
  v_code   text;
begin
  if length(v_nom) < 1 or length(v_nom) > 60 or length(v_prenom) < 1 or length(v_prenom) > 60 then
    raise exception 'NOM_INVALIDE';
  end if;
  if length(v_carte) < 4 or length(v_carte) > 30 then
    raise exception 'CARTE_INVALIDE';
  end if;

  -- Verrou par carte pour éviter deux tirages simultanés
  perform pg_advisory_xact_lock(hashtext('roue:' || upper(v_carte)));

  -- Déjà joué aujourd'hui → on renvoie le même résultat (pas de second tirage)
  select * into v_part from participations where carte = upper(v_carte) and jour = v_jour;
  if found then
    select * into v_lot from lots where id = v_part.lot_id;
    return json_build_object(
      'deja_joue', true,
      'lot_id', v_lot.id, 'titre', v_lot.titre, 'sous_titre', v_lot.sous_titre,
      'description', v_lot.description, 'code', v_part.code,
      'prenom', v_part.prenom, 'created_at', v_part.created_at
    );
  end if;

  -- Tirage pondéré parmi les lots actifs avec du stock
  select coalesce(sum(poids), 0) into v_total
  from lots where actif and poids > 0 and (stock is null or stock > 0);
  if v_total = 0 then
    raise exception 'PLUS_DE_LOTS';
  end if;

  v_r := floor(random() * v_total)::int;
  for v_lot in
    select * from lots where actif and poids > 0 and (stock is null or stock > 0) order by ordre
  loop
    v_r := v_r - v_lot.poids;
    exit when v_r < 0;
  end loop;

  if v_lot.stock is not null then
    update lots set stock = stock - 1 where id = v_lot.id;
  end if;

  -- Code lisible pour la caisse : NOEL-XXXX-XXXX (sans 0/O/1/I)
  loop
    v_code := 'NOEL-' ||
      (select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
         from generate_series(1, 4)) || '-' ||
      (select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
         from generate_series(1, 4));
    exit when not exists (select 1 from participations where code = v_code);
  end loop;

  insert into participations (nom, prenom, carte, jour, lot_id, code)
  values (v_nom, v_prenom, upper(v_carte), v_jour, v_lot.id, v_code)
  returning * into v_part;

  return json_build_object(
    'deja_joue', false,
    'lot_id', v_lot.id, 'titre', v_lot.titre, 'sous_titre', v_lot.sous_titre,
    'description', v_lot.description, 'code', v_part.code,
    'prenom', v_part.prenom, 'created_at', v_part.created_at
  );
end;
$$;

revoke all on function public.lots_publics()                  from public;
revoke all on function public.tourner_roue(text, text, text)  from public;
grant execute on function public.lots_publics()                 to anon, authenticated;
grant execute on function public.tourner_roue(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lots proposés (à ajuster) — total des poids = 100 → poids = % de chance
-- ---------------------------------------------------------------------------
insert into public.lots (id, ordre, titre, sous_titre, description, couleur, poids) values
  ('pac20',     1, '-20%',     'Pain au choc',        '-20 % sur vos pains au chocolat',               '#572d14', 25),
  ('cafe',      2, 'OFFERT',   'Café',                'Un café offert',                               '#e2132b', 20),
  ('buche10',   3, '-10%',     'Bûche de Noël',       '-10 % sur votre bûche de Noël',                '#c99a4a', 12),
  ('baguette',  4, 'OFFERTE',  'Baguette',            'Une baguette tradition offerte',               '#3c1f0e', 15),
  ('croissant', 5, 'OFFERT',   'Croissant',           'Un croissant offert',                          '#e2132b', 10),
  ('choco',     6, 'OFFERT',   'Chocolat chaud',      'Un chocolat chaud offert',                     '#572d14', 8),
  ('pacoff',    7, 'OFFERT',   'Pain au choc',        'Un pain au chocolat offert',                   '#c99a4a', 7),
  ('panier10',  8, '-10%',     'Tout le panier',      '-10 % sur tout votre panier',                  '#3c1f0e', 3)
on conflict (id) do nothing;
