# GENUS

Outil web de consultation d'oncogénétique : le clinicien construit **l'arbre généalogique en direct** avec le patient, renseigne les informations utiles de chaque apparenté, et un **brouillon de compte rendu** (partie « Histoire familiale ») est rédigé au fur et à mesure par une IA à partir de l'arbre. Le clinicien relit, modifie et valide le texte.

> L'IA ne fait que **traduire l'arbre en texte** : pas d'estimation de risque, pas de recommandation, pas d'interprétation clinique.

## Mettre GENUS en ligne (Cloudflare Pages, accès protégé)

GENUS est hébergé gratuitement sur **Cloudflare Pages**, qui sert la page web **et** le petit serveur (dossier `functions/`) nécessaire à l'IA et à CanRisk. Tout le site est protégé par un mot de passe (`GENUS_PASSWORD`). Le dépôt GitHub peut rester privé.

Mise en place (une seule fois) :

1. Créer un compte gratuit sur https://dash.cloudflare.com
2. **Workers & Pages → Créer → Pages → Importer un dépôt Git** : relier GitHub et choisir le dépôt GENUS.
3. Paramètres de build :
   - *Framework preset* : aucun (ou Vite)
   - *Build command* : `npm run build`
   - *Build output directory* : `dist`
4. **Variables et secrets** (type « Secret ») :
   - `GENUS_PASSWORD` : le mot de passe d'accès au site, à communiquer aux testeurs
   - `ANTHROPIC_API_KEY` : clé API Anthropic pour la rédaction du CR (facultatif)
5. **Enregistrer et déployer**. Le site est disponible à une adresse du type `https://genus-xxx.pages.dev`.

Ensuite, chaque modification envoyée sur GitHub (`main`) met le site à jour automatiquement.

À l'ouverture, le navigateur demande un identifiant (n'importe lequel) et le mot de passe. Chaque utilisateur se connecte ensuite à CanRisk avec son propre compte, depuis l'onglet « Risque CanRisk ».

Pour tester la version Cloudflare sur son ordinateur : `npm run cloudflare:local` (variables dans un fichier `.dev.vars`).

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

Le calcul passe par le serveur GENUS (en ligne sur Cloudflare, ou `npm run dev` en local) : l'API CanRisk n'accepte pas les appels directs depuis un navigateur.

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
  handlers.ts          logique serveur : IA, relais CanRisk, mot de passe du site
  index.ts             serveur local (Node.js)
functions/             la même logique, branchée sur Cloudflare Pages
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
