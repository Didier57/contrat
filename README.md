# Application Gestion des contrats

Application web pour le suivi des contrats de maintenance, alimentée par un import Excel
(modèle 46 colonnes, feuillet unique).

## Fonctionnalités

- **Authentification** par login/mot de passe avec rôles : `admin` (lecture/écriture) et `lecteur` (lecture seule)
- **Tableau des contrats** : 46 colonnes (choix des colonnes affichées), tri par colonne, recherche globale, filtre dédié par colonne, plage de dates sur « Contract end »
- **CRUD complet** : ajouter / modifier / supprimer un contrat (admin uniquement)
- **Import Excel** intégré (admin) : glisser-déposer, aperçu de la feuille, **remplacement intégral** de la base
- **Dashboard** : statistiques, montants, graphiques par type de contrat, expirations à venir
- **Alertes visuelles** : expiration < 90 jours (orange), expirée (rouge), contrat stoppé (badge STOP)
- **Exports** : Excel, des données filtrées ; sauvegarde/restauration complète de la base (Excel ou email)
- **Gestion des utilisateurs** : création, modification (rôle, mot de passe), email, suppression (admin)
- **Rappels email** : relance automatique sur les contrats proches de l'expiration

## Architecture

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + Recharts |
| Backend | Node.js + Express |
| Base de données | SQLite (`backend/contrats.db`) via better-sqlite3 |
| Auth | JWT + bcrypt |

## Prérequis

- Node.js ≥ 18

## Installation

```bash
npm run install-all
```

## Import des données Excel

Dans l'application (admin) : **Contrats → Importer Excel** (remplace tout le contenu actuel).
En ligne de commande :

```bash
node backend/import-excel.js "C:\chemin\Contrats.xlsx"
```

Le compte administrateur `admin / admin123` est créé automatiquement au premier démarrage
(sur base vide) — à changer immédiatement.

## Lancement

```bash
npm run dev
```

- Frontend : http://localhost:5173
- Backend API : http://localhost:3002

## API (résumé)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Connexion |
| GET | `/api/contracts` | auth | Liste des contrats (filtres: search, contract_type, customer_group, expiring) |
| GET | `/api/contracts/:id` | auth | Détail d'un contrat |
| POST | `/api/contracts` | admin | Ajouter un contrat |
| PUT | `/api/contracts/:id` | admin | Modifier un contrat |
| DELETE | `/api/contracts/:id` | admin | Supprimer un contrat |
| POST | `/api/contracts/import` | admin | Importer un fichier Excel (remplacement total) |
| GET | `/api/dashboard` | auth | Statistiques |
| GET | `/api/dashboard/expiring` | auth | Contrats expirant < 90 jours |
| GET | `/api/export/csv` | auth | Export CSV complet (46 colonnes) |
| GET/POST/PUT/DELETE | `/api/users` | admin | Gestion des utilisateurs |

## Production

L'image Docker est construite et publiée par **GitHub Actions** (`.github/workflows/build.yml`)
sur le registre `ghcr.io/didier57/contrat-app:latest` à chaque `git push` sur `main`.

Installation sur le NAS (voir `README-deploy.md`) :

1. Stack Portainer avec le `docker-compose.yml` du dépôt (image GHCR).
2. À chaque mise à jour : `git push`, puis sur le NAS :
   ```
   docker compose pull
   docker compose up -d --force-recreate
   ```

Build local manuel (optionnel) :
```bash
npm run build --prefix frontend   # génère le build statique dans frontend/dist
```