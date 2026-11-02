# La Roue de Noël — Galzin 🎄

QR code en boutique → site mobile → le client saisit **prénom, nom, n° de carte de fidélité** → il tourne la **roue** → il gagne un cadeau et obtient un **ticket avec le QR code à scanner en caisse**.

DA reprise du repo `MOTION-` (vidéo *galzin-fidelite*) : brun `#572d14`, crème `#fdf0e2`, or `#c99a4a` / `#ffcc4d`, rouge `#e2132b`, Bebas Neue + Crimson Pro + Dancing Script, rayons sunburst, logo rond, plus une couche Noël (neige, guirlande, confettis, jingle).

## Structure

| Fichier | Rôle |
|---|---|
| `public/index.html` | Les 4 écrans : accueil → formulaire → roue → ticket gagnant |
| `public/style.css` | DA Galzin × Noël, animations |
| `public/app.js` | Roue (canvas), tirage, son, neige, confettis |
| `public/config.js` | **Seul fichier à modifier** : clés Supabase, QR caisse, validité, règlement |
| `public/assets/img/qr-caisse.svg` | **À remplacer** par le QR code caisse fourni |
| `supabase/migrations/001_roue_noel.sql` | Tables `lots` + `participations` et fonctions de tirage |

## Fonctionnement anti-triche

- Le **tirage se fait dans Supabase** (fonction `tourner_roue`), pas dans le navigateur : impossible de choisir son lot.
- **1 participation par carte et par jour** (heure de Paris) : si la carte a déjà joué, le serveur renvoie le même lot et le même code.
- Le navigateur n'a **aucun accès direct** aux tables (RLS sans policy) ; il ne peut appeler que `lots_publics()` et `tourner_roue()`.
- Le ticket affiche une **horloge en direct** pour que la caisse repère une simple capture d'écran.

## Modifier les lots

Dans Supabase → *Table editor* → `lots` : `titre`, `sous_titre`, `description`, `couleur`, `poids` (probabilité relative), `stock` (vide = illimité), `actif`, `ordre`.

## Récupérer les participants

Dans Supabase → *SQL editor* :

```sql
select jour, prenom, nom, carte, lot_id, code, created_at
from participations order by created_at desc;
```

## Tester en local

```bash
cd public && python3 -m http.server 8000
```

Sans clés Supabase dans `config.js`, l'appli tourne en **mode démo** : tirage local, rien n'est enregistré.

## Mise en ligne

Déployer le repo sur Vercel (le dossier `public/` est servi tel quel, il n'y a pas de build), puis générer le QR code d'affichage magasin qui pointe vers l'URL.

## Légal

- **`public/reglement.html`** (en ligne sur `/reglement.html`) : règlement du jeu, politique de données personnelles (RGPD) et mentions légales (LCEN). La version imprimable est **`docs/reglement-roue-noel-galzin.pdf`**, à garder en caisse puisque le règlement doit pouvoir être remis gratuitement sur demande.
- **Période du jeu** : table Supabase `parametres` (`debut`, `fin`). En dehors de la période, le jeu est refusé côté serveur. Les cartes dont le numéro commence par **`TEST`** peuvent jouer hors période pour les essais internes. Si tu changes les dates, mets aussi à jour l'article 2 du règlement et le message `JEU_PAS_COMMENCE` dans `public/app.js`.
- **Purge RGPD** : la tâche planifiée `purge-rgpd-roue-noel` (pg_cron, tous les jours à 3 h 15) supprime les participations de plus de 3 mois, comme annoncé dans la politique de données.
- Le formulaire comporte la case « majeur(e) + règlement » et la notice d'information RGPD (art. 13). Le footer renvoie vers les trois documents.
