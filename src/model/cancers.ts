/** Localisations proposées dans la saisie. La couleur sert au remplissage des symboles. */
export const CANCER_SITES: { key: string; label: string; color: string }[] = [
  { key: "sein", label: "Sein", color: "#e0457b" },
  { key: "ovaire", label: "Ovaire", color: "#8a4fd8" },
  { key: "colorectal", label: "Colorectal", color: "#2f7fd8" },
  { key: "endomètre", label: "Endomètre", color: "#d86a2f" },
  { key: "prostate", label: "Prostate", color: "#2fa86a" },
  { key: "pancréas", label: "Pancréas", color: "#c9a227" },
  { key: "estomac", label: "Estomac", color: "#6a8a2f" },
  { key: "mélanome", label: "Mélanome", color: "#5a4a3a" },
  { key: "rein", label: "Rein", color: "#2fa8a8" },
  { key: "voies urinaires", label: "Voies urinaires", color: "#4f6fd8" },
  { key: "thyroïde", label: "Thyroïde", color: "#d84f4f" },
  { key: "poumon", label: "Poumon", color: "#7a7a7a" },
  { key: "hémopathie", label: "Hémopathie", color: "#a82f5a" },
  { key: "sarcome", label: "Sarcome", color: "#a8662f" },
  { key: "cerveau", label: "Cerveau / SNC", color: "#4a6a8a" },
];

const OTHER_COLOR = "#555";

export function cancerColor(site: string): string {
  return CANCER_SITES.find((s) => s.key === site)?.color ?? OTHER_COLOR;
}

export function cancerLabel(site: string): string {
  return CANCER_SITES.find((s) => s.key === site)?.label ?? site;
}
