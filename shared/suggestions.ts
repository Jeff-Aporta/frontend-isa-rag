/**
 * Preguntas sugeridas por space (3 por defecto).
 * Front las muestra en el composer para arrancar la conversación.
 * Se matchea por `name` (case-insensitive). Si no hay match, usa `DEFAULT`.
 */
export const SPACE_SUGGESTIONS: Record<string, string[]> = {
  YouTube: [
    "¿Cómo registro un préstamo bancario en ContaPyme?",
    "¿Cómo se hace una consulta de saldos de inventarios?",
    "¿Qué pasos hay para hacer un cierre contable?",
  ],
  DIan: [
    "¿Qué documentos electrónicos debo expedir?",
    "¿Cómo declaro IVA en el periodo actual?",
    "¿Cuál es el calendario tributario de este mes?",
  ],
  "QA Demo": [
    "¿Qué contiene este documento?",
    "Hazme un resumen ejecutivo.",
    "¿Cuáles son los puntos clave?",
  ],
};

export const DEFAULT_SUGGESTIONS: string[] = [
  "¿De qué trata este espacio?",
  "Dame un resumen de los documentos.",
  "¿Cuáles son los puntos más importantes?",
];

export function suggestionsForSpaceName(name: string | null | undefined): string[] {
  if (!name) return DEFAULT_SUGGESTIONS;
  const exact = SPACE_SUGGESTIONS[name];
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const key of Object.keys(SPACE_SUGGESTIONS)) {
    if (key.toLowerCase() === lower) return SPACE_SUGGESTIONS[key]!;
  }
  return DEFAULT_SUGGESTIONS;
}