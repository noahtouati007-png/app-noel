-- Roue de Noël Galzin — période du jeu + purge RGPD automatique
-- (appliquée après 001_roue_noel.sql)

-- ---------------------------------------------------------------------------
-- Paramètres du jeu (modifiables dans Table editor > parametres)
-- ---------------------------------------------------------------------------
create table if not exists public.parametres (
  id    int primary key default 1 check (id = 1),     -- une seule ligne
  debut date not null,                                 -- 1er jour du jeu (inclus, heure de Paris)
  fin   date not null                                  -- dernier jour du jeu (inclus)
);
alter table public.parametres enable row level security;
revoke all on public.parametres from anon, authenticated;

insert into public.parametres (id, debut, fin) values (1, '2026-12-01', '2026-12-31')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tirage : on ajoute le contrôle de la période.
-- Les cartes dont le numéro commence par TEST jouent hors période (pour les essais
-- internes) ; elles restent limitées à 1 tirage par jour.
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
  v_carte  text := upper(regexp_replace(coalesce(p_carte, ''), '[^0-9A-Za-z]', '', 'g'));
  v_jour   date := (now() at time zone 'Europe/Paris')::date;
  v_param  parametres;
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

  select * into v_param from parametres where id = 1;
  if v_carte not like 'TEST%' then
    if v_jour < v_param.debut then raise exception 'JEU_PAS_COMMENCE'; end if;
    if v_jour > v_param.fin   then raise exception 'JEU_TERMINE';      end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('roue:' || v_carte));

  select * into v_part from participations where carte = v_carte and jour = v_jour;
  if found then
    select * into v_lot from lots where id = v_part.lot_id;
    return json_build_object(
      'deja_joue', true,
      'lot_id', v_lot.id, 'titre', v_lot.titre, 'sous_titre', v_lot.sous_titre,
      'description', v_lot.description, 'code', v_part.code,
      'prenom', v_part.prenom, 'created_at', v_part.created_at
    );
  end if;

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

  loop
    v_code := 'NOEL-' ||
      (select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
         from generate_series(1, 4)) || '-' ||
      (select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
         from generate_series(1, 4));
    exit when not exists (select 1 from participations where code = v_code);
  end loop;

  insert into participations (nom, prenom, carte, jour, lot_id, code)
  values (v_nom, v_prenom, v_carte, v_jour, v_lot.id, v_code)
  returning * into v_part;

  return json_build_object(
    'deja_joue', false,
    'lot_id', v_lot.id, 'titre', v_lot.titre, 'sous_titre', v_lot.sous_titre,
    'description', v_lot.description, 'code', v_part.code,
    'prenom', v_part.prenom, 'created_at', v_part.created_at
  );
end;
$$;

revoke all on function public.tourner_roue(text, text, text) from public;
grant execute on function public.tourner_roue(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RGPD : suppression automatique des participations de plus de 3 mois
-- (durée annoncée dans la politique de données personnelles)
-- ---------------------------------------------------------------------------
create or replace function public.purger_participations()
returns int
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from participations
    where jour < ((now() at time zone 'Europe/Paris')::date - interval '3 months')
    returning 1
  )
  select count(*)::int from d;
$$;
revoke all on function public.purger_participations() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-rgpd-roue-noel';
select cron.schedule('purge-rgpd-roue-noel', '15 3 * * *', 'select public.purger_participations()');
