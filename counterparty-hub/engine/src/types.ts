/** Niveles de riesgo: 0 Bajo, 1 Medio, 2 Alto, 3 Muy alto, 4 Crítico. */
export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVEL_NAMES = ['Bajo', 'Medio', 'Alto', 'Muy alto', 'Crítico'] as const;

export type Impact = 1 | 2 | 3;
export type Severity = 'crit' | 'high' | 'mod' | 'low';
export type Confidence = 'alta' | 'media' | 'baja';

/** Una señal que explica la calificación. */
export interface Driver {
  label: string;
  effect: 'agrava' | 'mitiga';
  impact: Impact;
  source: 'bcra' | 'cheques' | 'investigacion';
}

/** Un hecho fechado que se muestra en la línea de tiempo y dispara alertas. */
export interface RiskEvent {
  key: string;            // estable entre corridas, para deduplicar alertas
  date: string;           // YYYY-MM-DD
  sev: Severity;
  title: string;
  detail: string;
  source: 'bcra' | 'cheques' | 'investigacion';
  url?: string;
}

/** Piso de nivel impuesto por una regla, con su motivo. */
export interface Floor {
  level: Level;
  reason: string;
}

export interface Exposure {
  balance: number;   // ARS
  overdue: number;   // ARS
  limit: number;     // ARS
  monthlySales?: number; // compras promedio por mes, ARS (para el límite sugerido)
}

/** Resultado por empresa: es el formato que consume el panel (app.html). */
export interface CompanyResult {
  cuit: string;
  name: string;
  sector?: string;
  since?: number;
  level: Level;
  levelName: string;
  history: Level[];          // 24 meses, el último = nivel actual
  drivers: Driver[];
  events: RiskEvent[];
  floors: Floor[];           // qué reglas fijaron el nivel (auditoría)
  confidence: Confidence;
  exposure?: Exposure;
  bcra: {
    hasData: boolean;
    totalDebtArs: number;
    entities: number;
    worstSituation: number | null;
    period: string | null;
  };
  researchedAt?: string;
  computedAt: string;
}
