export type Sex = "M" | "F" | "U";

export interface Cancer {
  id: string;
  /** Localisation (clé de CANCER_SITES ou texte libre) */
  site: string;
  ageAtDiagnosis?: number;
  /** Précision libre : histologie, latéralité, récepteurs… */
  details?: string;
  /** Sein : cancer controlatéral (2e cancer du sein) */
  contralateral?: boolean;
  /** Sein : statut des récepteurs, utilisé par CanRisk */
  pathology?: Partial<Record<"ER" | "PR" | "HER2" | "CK14" | "CK56", "P" | "N">>;
}

export type TestResult = "pathogène" | "probablement pathogène" | "VSI" | "négatif" | "en cours";

export interface GeneticTest {
  id: string;
  /** Gène ou panel testé (ex. "BRCA1", "panel sein-ovaire") */
  gene: string;
  result: TestResult;
  variant?: string;
  year?: number;
  /** Test ciblé d'un variant familial (sinon : analyse complète du gène) */
  targeted?: boolean;
}

export interface Person {
  id: string;
  /**
   * Prénom / initiales : aide au repérage pendant la consultation.
   * N'est JAMAIS envoyé à l'IA.
   */
  label?: string;
  sex: Sex;
  fatherId?: string;
  motherId?: string;
  /** Âge actuel (vivant) */
  age?: number;
  birthYear?: number;
  deceased: boolean;
  ageAtDeath?: number;
  causeOfDeath?: string;
  cancers: Cancer[];
  tests: GeneticTest[];
  /** Autres antécédents / remarques */
  notes?: string;
  adopted?: boolean;
  /** Infos non connues du patient */
  unknownHistory?: boolean;
  ashkenazi?: boolean;
  /** Facteurs de risque (utilisés par CanRisk quand la personne est la cible du calcul) */
  riskFactors?: RiskFactors;
}

export interface RiskFactors {
  menarche?: number;
  parity?: number;
  firstLiveBirth?: number;
  /** N = jamais, F:années = ancienne, C:années = actuelle */
  ocUse?: string;
  /** N, F, E, C (cf. format CanRisk) */
  mhtUse?: "N" | "F" | "E" | "C";
  bmi?: number;
  alcohol?: number;
  /** âge, ou "N" si non ménopausée */
  menopause?: string;
  birads?: "a" | "b" | "c" | "d";
  height?: number;
  tubalLigation?: "Y" | "N";
  endometriosis?: "Y" | "N";
}

export interface Couple {
  id: string;
  a: string;
  b: string;
  consanguineous?: boolean;
  separated?: boolean;
}

export interface Consultation {
  date: string;
  indication: string;
  /** Origine géographique / ethnique si pertinente */
  origins?: string;
  notes?: string;
}

export interface Pedigree {
  persons: Record<string, Person>;
  couples: Couple[];
  probandId: string;
  consultation: Consultation;
}
