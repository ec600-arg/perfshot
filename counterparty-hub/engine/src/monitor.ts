/**
 * Monitoreo por diferencias: compara la evaluación anterior con la nueva y devuelve sólo lo que cambió.
 * Así la consulta diaria al BCRA es gratis y la IA se corre sólo cuando hace falta.
 */
import type { CompanyResult, Severity } from './types.ts';
import { LEVEL_NAMES } from './types.ts';

export interface Alert {
  cuit: string;
  name: string;
  sev: Severity;
  title: string;
  detail: string;
  date: string;
  key: string;
}

export function diff(prev: CompanyResult | null, next: CompanyResult): Alert[] {
  const alerts: Alert[] = [];
  const date = next.computedAt.slice(0, 10);
  const base = { cuit: next.cuit, name: next.name, date };

  if (prev && prev.level !== next.level) {
    const worse = next.level > prev.level;
    alerts.push({
      ...base,
      key: `lvl:${date}:${prev.level}>${next.level}`,
      sev: worse ? (next.level >= 4 ? 'crit' : next.level >= 2 ? 'high' : 'mod') : 'low',
      title: worse ? `Pasó de riesgo ${LEVEL_NAMES[prev.level]} a ${LEVEL_NAMES[next.level]}` : `Bajó de riesgo ${LEVEL_NAMES[prev.level]} a ${LEVEL_NAMES[next.level]}`,
      detail: next.floors[0]?.reason ?? 'Cambio en las señales que explican la calificación.',
    });
  }

  const known = new Set(prev?.events.map(e => e.key) ?? []);
  for (const e of next.events) {
    if (prev && known.has(e.key)) continue;
    if (!prev && e.sev === 'low') continue; // en el alta inicial sólo avisamos lo negativo
    alerts.push({ ...base, key: e.key, sev: e.sev, title: e.title, detail: e.detail, date: e.date });
  }
  return alerts;
}

/** Cuándo vale la pena volver a investigar con IA (lo caro). */
export function needsResearch(prev: CompanyResult | null, next: CompanyResult, maxAgeDays = 30, today = new Date()): boolean {
  if (!prev?.researchedAt) return true;
  const age = (today.getTime() - new Date(prev.researchedAt).getTime()) / 864e5;
  if (age >= maxAgeDays) return true;
  // la deuda bancaria o los cheques empeoraron: conviene buscar la causa
  return next.level > prev.level || (next.bcra.worstSituation ?? 1) > (prev.bcra.worstSituation ?? 1);
}
