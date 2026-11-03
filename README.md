# GENUS

Outil web de consultation d'oncogénétique : le clinicien construit **l'arbre généalogique en direct** avec le patient, renseigne les informations utiles de chaque apparenté, et un **brouillon de compte rendu** (partie « Histoire familiale ») est rédigé au fur et à mesure par une IA à partir de l'arbre. Le clinicien relit, modifie et valide le texte.

> L'IA ne fait que **traduire l'arbre en texte** : pas d'estimation de risque, pas de recommandation, pas d'interprétation clinique.

## Démarrage

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

## Architecture

```
src/
  model/types.ts       modèle de données (Person, Couple, Pedigree)
  model/ops.ts         opérations sur l'arbre (ajout parents, fratrie, enfants…)
  model/relations.ts   calcul du lien de parenté et du degré par rapport au cas index
  model/facts.ts       données pseudonymisées envoyées à l'IA + CR hors-ligne
  layout.ts            placement automatique de l'arbre (générations, fratries, couples)
  components/          PedigreeView (SVG), PersonPanel (saisie), ReportPanel (CR)
server/
  index.ts             API /api/report : appel à Claude en streaming
  prompt.ts            consignes de rédaction du CR
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
- Import/export au format CanRisk (pedigree BOADICEA).
- Régénération d'une seule section du CR.
- Symboles complémentaires (jumeaux, grossesses, consanguinité dans l'interface).
