/**
 * Combina BCRA + cheques + investigación en un resultado por empresa.
 * evaluate() es puro (no hace red): recibe los datos ya obtenidos, así se puede testear y re-calcular.
 */
import type { BcraReport } from './bcra.ts';
import { formatCuit, normalizeCuit } from './cuit.ts';
import type { ResearchResult } from './research.ts';
import { bcraRules, checkRules, decideLevel, findingRules, merge, periodLevel, totalDebt, worstSituation } from './rules.ts';
import type { CompanyResult, Confidence, Driver, Exposure, Level, RiskEvent } from './types.ts';
import { LEVEL_NAMES } from './types.ts';

export interface EvaluateInput {
  cuit: string;
  name?: string;
  exposure?: Exposure;
  bcra: BcraReport | null;           // null si la consulta al BCRA falló
  research?: ResearchResult | null;  // null/undefined si no se investigó
  today?: Date;
}

const ym = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Últimos 24 meses terminando en `end` (YYYYMM). */
function last24(end: string): string[] {
  const y = +end.slice(0, 4), m = +end.slice(4, 6) - 1;
  return Array.from({ length: 24 }, (_, i) => ym(new Date(Date.UTC(y, m - 23 + i, 1))));
}

function buildHistory(bcra: BcraReport | null, finalLevel: Level, today: Date): Level[] {
  const byPeriod = new Map((bcra?.history ?? []).map(p => [p.period, periodLevel(p).level]));
  const end = bcra?.current?.period ?? ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const months = last24(end);
  const firstKnown = months.map(p => byPeriod.get(p)).find(v => v !== undefined) ?? finalLevel;
  let prev: Level = firstKnown;
  const out = months.map(p => (prev = byPeriod.get(p) ?? prev));
  out[out.length - 1] = finalLevel; // el último mes es la calificación completa (incluye cheques e investigación)
  return out;
}

function dedupeDrivers(ds: Driver[]): Driver[] {
  const seen = new Map<string, Driver>();
  for (const d of ds) {
    const prev = seen.get(d.label);
    if (!prev || d.impact > prev.impact) seen.set(d.label, d);
  }
  return [...seen.values()].sort((a, b) => b.impact - a.impact);
}

function dedupeEvents(es: RiskEvent[]): RiskEvent[] {
  return [...new Map(es.map(e => [e.key, e])).values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function evaluate(input: EvaluateInput): CompanyResult {
  const today = input.today ?? new Date();
  const bcra = input.bcra;
  const research = input.research ?? null;

  const noBcra = { floors: [{ level: 1 as Level, reason: 'No se pudo obtener la información bancaria' }], drivers: [{ label: 'Información bancaria no disponible', effect: 'agrava' as const, impact: 1 as const, source: 'bcra' as const }], events: [] };
  const rules = merge(
    bcra ? bcraRules(bcra) : noBcra,
    bcra ? checkRules(bcra.checks, today) : { floors: [], drivers: [], events: [] },
    research ? findingRules(research.findings, today) : { floors: [], drivers: [], events: [] },
  );
  const { level, floors } = decideLevel(rules);

  const hasBcra = !!bcra?.current?.entities.length;
  const confidence: Confidence = !bcra ? 'baja' : hasBcra && research ? 'alta' : hasBcra || research ? 'media' : 'baja';

  return {
    cuit: formatCuit(normalizeCuit(input.cuit)),
    name: input.name || bcra?.name || formatCuit(input.cuit),
    sector: research?.sector,
    since: research?.since,
    level,
    levelName: LEVEL_NAMES[level],
    history: buildHistory(bcra, level, today),
    drivers: dedupeDrivers(rules.drivers),
    events: dedupeEvents(rules.events),
    floors,
    confidence,
    exposure: input.exposure,
    bcra: {
      hasData: hasBcra,
      totalDebtArs: totalDebt(bcra?.current ?? null),
      entities: bcra?.current?.entities.length ?? 0,
      worstSituation: worstSituation(bcra?.current ?? null),
      period: bcra?.current?.period ?? null,
    },
    researchedAt: research?.researchedAt,
    computedAt: today.toISOString(),
  };
}
