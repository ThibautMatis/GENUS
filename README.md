# GENUS

Outil web de consultation d'oncogénétique : le clinicien construit **l'arbre généalogique en direct** avec le patient, renseigne les informations utiles de chaque apparenté, et un **brouillon de compte rendu** (partie « Histoire familiale ») est rédigé au fur et à mesure par une IA à partir de l'arbre. Le clinicien relit, modifie et valide le texte.

> L'IA ne fait que **traduire l'arbre en texte** : pas d'estimation de risque, pas de recommandation, pas d'interprétation clinique.

## Utiliser en ligne (GitHub Pages)

Le site est publié automatiquement à chaque modification de `main` :
**https://thibautmatis.github.io/GENUS/**

Rien à installer : il suffit d'un navigateur. Pour la rédaction par IA, saisir une clé API Anthropic dans ⚙ (panneau Compte rendu). La clé est stockée uniquement dans ce navigateur et envoyée directement à Anthropic. Sans clé, le CR est produit par des modèles de phrases.

> Mode prototype : **données fictives uniquement**. Ne pas partager la clé ; la révoquer sur console.anthropic.com en cas de doute.

Mise en place (une seule fois) : dans le dépôt GitHub, *Settings → Pages → Build and deployment → Source : GitHub Actions*.

## Démarrage en local

Prérequis : Node.js ≥ 20.6

```bash
npm install
cp .env.example .env      # puis renseigner ANTHROPIC_API_KEY
npm run dev               # http://localhost:5173
```

Sans clé API, l'application fonctionne en **mode hors-ligne** : le CR est produit par des modèles de phrases simples (utile pour tester l'arbre).

Production (un seul processus qui sert l'interface et l'API) :

```bash
npm run build
npm start                 # http://localhost:8787
```

## Utilisation

- Cliquer sur une personne pour la sélectionner, puis **Ajouter** : parents, frère, sœur, fils, fille, conjoint, demi-frère/sœur (menu « Plus… »).
- Panneau de droite : âge ou âge au décès, cancers (localisation, âge au diagnostic, précisions), analyses génétiques (gène, résultat, variant), notes.
- Le lien de parenté avec le cas index (« tante maternelle », « 2e degré »…) est **calculé automatiquement**.
- Le CR se met à jour automatiquement (case « Auto ») quelques secondes après chaque modification. Dès que le texte est modifié à la main, il n'est plus écrasé ; « Regénérer » demande confirmation.
- ⚙ : coller un **exemple de CR anonymisé** pour que l'IA en reprenne la structure et le ton ; voir les données exactement transmises à l'IA.
- Annuler (Ctrl+Z), Exporter / Importer l'arbre en JSON, famille de démonstration (fictive).

## Calcul de risque CanRisk (BOADICEA)

L'onglet **Risque CanRisk** envoie l'arbre au service de calcul officiel de CanRisk (canrisk.org) et affiche :
risque cumulé de 20 à 80 ans, risque entre 40 et 50 ans, risque à partir de l'âge actuel (comparés à la population générale), et probabilité d'être porteur d'un variant (BRCA1, BRCA2, PALB2…). Modèles : sein (BOADICEA), ovaire, prostate.

- Le calcul se fait **sur les serveurs de CanRisk**. GENUS ne fait que convertir l'arbre au format « CanRisk Pedigree Data v4 », sans aucun nom.
- Données utilisées : sexe, âges, décès, cancers du sein (et controlatéral), ovaire, prostate, pancréas avec âge au diagnostic, origine ashkénaze, tests génétiques (BRCA1, BRCA2, PALB2, ATM, CHEK2, BARD1, RAD51C, RAD51D, BRIP1, HOXB13), récepteurs RE/RP/HER2, et les facteurs de risque optionnels de la personne cible.
- Bouton « Fichier CanRisk » : le même fichier, importable dans l'outil web canrisk.org pour contrôle.
- Bouton « Copier pour le CR » : résumé des résultats à coller dans le compte rendu.

**Connexion** : chaque utilisateur se connecte une fois avec **son propre compte canrisk.org** (identifiant + mot de passe) dans l'onglet Risque CanRisk. Le mot de passe n'est pas conservé : GENUS garde seulement le jeton d'accès renvoyé par CanRisk, dans le navigateur. Bouton « Se déconnecter » pour l'effacer.

Optionnel, pour un poste de test : un compte unique peut être configuré côté serveur dans `.env` (`CANRISK_USERNAME` / `CANRISK_PASSWORD`) ; la connexion n'est alors plus demandée.

Le calcul nécessite le **serveur GENUS** (`npm run dev` ou `npm start`) : l'API CanRisk n'accepte pas les appels directs depuis un navigateur (pas de CORS), donc il n'est pas disponible sur la version GitHub Pages.

Derrière un proxy d'entreprise, lancer le serveur avec `NODE_USE_ENV_PROXY=1` et `HTTPS_PROXY=http://proxy:port`.

## Architecture

```
src/
  model/types.ts       modèle de données (Person, Couple, Pedigree)
  model/ops.ts         opérations sur l'arbre (ajout parents, fratrie, enfants…)
  model/relations.ts   calcul du lien de parenté et du degré par rapport au cas index
  model/facts.ts       données pseudonymisées envoyées à l'IA + CR hors-ligne
  layout.ts            placement automatique de l'arbre (générations, fratries, couples)
  components/          PedigreeView (SVG), PersonPanel (saisie), ReportPanel (CR)
  model/prompt.ts      consignes de rédaction du CR
  model/canrisk.ts     conversion de l'arbre au format CanRisk v4 + types des résultats
  ai.ts                appel à Claude en streaming (clé dans le navigateur, ou via le serveur local)
server/
  index.ts             serveur : /api/report (IA) et /api/canrisk (relais vers CanRisk)
```

Le principe : **l'arbre est un JSON structuré**, les liens de parenté sont calculés par le code (pas par l'IA), et seules des données pseudonymisées (lien de parenté, sexe, âges, antécédents) sont envoyées au modèle. Les prénoms/repères saisis ne quittent jamais le navigateur.

## Données de santé – avant tout usage réel

Ce prototype est destiné à être testé **avec des familles fictives**. Avant une utilisation avec de vrais patients :

- Hébergement par un **hébergeur certifié HDS** et conformité RGPD (registre, AIPD, information du patient).
- Fournisseur d'IA avec traitement des données dans l'UE et sans rétention (ex. Claude via AWS Bedrock ou Google Vertex en région UE), à valider avec le DPO.
- Authentification des utilisateurs et stockage côté serveur (aujourd'hui l'arbre est sauvegardé dans le `localStorage` du navigateur).
- Les champs « Notes » et « Précisions » sont transmis à l'IA : ne pas y saisir de nom.

## Pistes

- Export de l'arbre en image/PDF pour le dossier patient.
- Import d'un fichier CanRisk existant.
- Régénération d'une seule section du CR.
- Symboles complémentaires (jumeaux, grossesses, consanguinité dans l'interface).
