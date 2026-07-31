# Wisdom365

Une interface web personnelle pour lire, a la date choisie, les deux entrees quotidiennes presentes dans les EPUB du dossier `epubs`.

## Lancer en local

Prerequis : Node.js 20+.

```bash
npm start
```

Ouvrir `http://localhost:3000` dans un navigateur.

## Deployer sur Vercel

Le projet est configure pour Vercel. Les EPUB et le dossier `public` sont emballes avec une fonction Node.js, et toutes les URL passent par cette fonction : l'authentification protege donc aussi la page et ses ressources.

1. Importer ce dossier ou son depot Git dans Vercel ("Add New" > "Project"). Aucun framework ni commande de build supplementaire n'est necessaire.
2. Dans **Settings > Environment Variables**, ajouter pour les environnements Preview et Production :
   - `APP_USERNAME` : l'identifiant souhaite ;
   - `APP_PASSWORD` : un mot de passe long et unique.
3. Lancer le deploiement. Vercel utilise automatiquement `api/[...path].mjs` et `vercel.json`.

On peut aussi deployer depuis le terminal :

```bash
npx vercel
npx vercel --prod
```

Le mot de passe est optionnel en local. Sur Vercel, il est indispensable : sans `APP_PASSWORD`, toute personne connaissant l'adresse pourra lire les contenus.

Il ne faut pas definir `PORT` sur Vercel. Les EPUB restent integres a la fonction et ne sont pas exposes comme fichiers telechargeables.

Le lancement local reste identique : `npm start`, puis ouvrir `http://localhost:3000`.
