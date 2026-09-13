# Instructions projet Gestion des contrats (contrat-app)

## Stack
- Frontend: React 18 + Vite (port 5173) dans `frontend/`
- Backend: Node.js + Express (port 3002) dans `backend/`
- BDD: SQLite (`backend/contrats.db`) via better-sqlite3
- Auth: JWT + bcrypt (rôles: `admin`, `lecteur`)

## Commandes utiles

- Lancer les deux serveurs: `npm run dev` (à la racine)
- Backend seul: `node backend/server.js` (dans backend/)
- Frontend seul: `npm run dev` (dans frontend/)
- Build frontend: `npm run build --prefix frontend`
- Importer le modèle Excel en CLI: `node backend/import-excel.js <fichier.xlsx>` (depuis backend/, source par défaut `c:/temp/Contrats.xlsx`)
- Créer un utilisateur: `node backend/seed-users.js <user> <password> <admin|lecteur>`

## Notes
- PowerShell bloque les scripts .ps1 → toujours utiliser `npm.cmd` plutôt que `npm` en shell
- La BDD `backend/contrats.db` est créée au premier démarrage ; le compte `admin / admin123` est créé automatiquement si elle est vide (ne commit jamais ce fichier, il est dans `.gitignore`)
- Import Excel : les dates sont stockées comme **serials Excel sans format** → `excel-import.js` lit avec `cellDates: false` et reconvertit selon les colonnes typées `date` (décalage UTC évité)
- Métadonnées des 46 colonnes : `backend/contract-fields.js` (source unique : schéma SQLite, import Excel, export, routes) + `frontend/src/contractFields.js` (miroir frontend)
- Schéma contracts: 46 colonnes (import_id, sap_ewp, ..., contract_end, remarks_bac_2, ...), complétées par id, updated_at, updated_by — voir contract-fields.js
- Schéma users: id, username, password_hash, role (admin|lecteur), email, created_at
- Compte admin par défaut: `admin / admin123`

## Déploiement (flux actuel)
- **Pas de déploiement Sur Synology / copies Q: / watchdog** (supprimé).
- Après les tests locaux, déploiement = `git add -A && git commit -m "..." && git push` sur `main`.
- GitHub Actions construit l'image `ghcr.io/didier57/contrat-app:latest` (`.github/workflows/build.yml`).
- Le serveur tire l'image : `docker compose pull && docker compose up -d --force-recreate` (stack/repo avec `image: ghcr.io/didier57/contrat-app:latest`).