# Vérification Emails

One-pager : fichier de contacts `.xlsx` ➔ Google Sheet enrichie (via le workflow n8n de `../verification-emails-n8n`).

Stack et charte identiques à `enrichissement-decideurs` : Next.js (App Router), React 19, Tailwind CSS v4, lucide-react.
Toute la logique UI est dans [`src/app/page.tsx`](src/app/page.tsx).

## Démarrage

```bash
npm install
npm run dev
```

## Configuration

Le navigateur appelle uniquement `/api/verify` (`src/app/api/verify/route.ts`), une route serveur qui valide le fichier puis le relaie au webhook n8n.

| Variable | Rôle |
|---|---|
| `N8N_WEBHOOK_URL` | URL de production du webhook (voir `.env.example`) |
| `APP_PASSWORD` | Mot de passe demandé par le navigateur pour accéder à l'app (`src/proxy.ts`), nom d'utilisateur libre. Sans cette variable, tout est refusé |
| `N8N_WEBHOOK_KEY` | Optionnelle : envoyée dans l'en-tête `X-Webhook-Key`, à déclarer aussi en Header Auth sur le nœud Webhook de n8n |

À renseigner dans `.env.local` en local et dans les variables d'environnement du projet sur Vercel. Sans préfixe `NEXT_PUBLIC_` : ni l'URL ni la clé ne sont exposées au navigateur.

## Limites

- Fichier de 4 Mo maximum : Vercel refuse les corps de requête au-delà de 4,5 Mo.
- Les Google Sheets résultats sont privées et appartiennent au compte Google connecté à n8n : les liens ne s'ouvrent que pour ce compte, sauf partage du dossier `RESULTATS`.

## Contrat d'API

`POST /api/verify` en `multipart/form-data`, champ `file`.

```json
{ "success": true, "status": "success", "message": "Fichier traité avec succès.",
  "totalRows": 42, "stats": { "OK_Match_URL": 40, "ANOMALIE_A_VERIFIER": 2 }, "resultUrl": "https://docs.google.com/spreadsheets/d/…",
  "downloadUrl": "https://docs.google.com/spreadsheets/d/…/export?format=xlsx" }
```

```json
{ "success": false, "message": "…" }
```
