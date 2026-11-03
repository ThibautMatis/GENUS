export type Sex = "M" | "F" | "U";

export interface Cancer {
  id: string;
  /** Localisation (clé de CANCER_SITES ou texte libre) */
  site: string;
  ageAtDiagnosis?: number;
  /** Précision libre : histologie, latéralité, récepteurs… */
  details?: string;
}

export type TestResult = "pathogène" | "probablement pathogène" | "VSI" | "négatif" | "en cours";

export interface GeneticTest {
  id: string;
  /** Gène ou panel testé (ex. "BRCA1", "panel sein-ovaire") */
  gene: string;
  result: TestResult;
  variant?: string;
  year?: number;
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
