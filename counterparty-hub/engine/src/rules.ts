/**
 * Reglas de calificación. Cada regla puede:
 *  - fijar un PISO de nivel (el nivel final nunca queda por debajo), y/o
 *  - agregar una SEÑAL (driver) que explica la calificación, y/o
 *  - generar un EVENTO fechado para la línea de tiempo y las alertas.
 * Las señales positivas nunca bajan un nivel por debajo de un piso: sólo explican.
 * Todo es determinístico y auditable: la misma entrada da siempre el mismo nivel.
 */
import type { BcraReport, DebtPeriod, RejectedCheck } from './bcra.ts';
import type { Driver, Floor, Impact, Level, RiskEvent, Severity } from './types.ts';
import { LEVEL_NAMES } from './types.ts';

export interface RuleOutput {
  floors: Floor[];
  drivers: Driver[];
  events: RiskEvent[];
}

const empty = (): RuleOutput => ({ floors: [], drivers: [], events: [] });
const merge = (...outs: RuleOutput[]): RuleOutput => ({
  floors: outs.flatMap(o => o.floors),
  drivers: outs.flatMap(o => o.drivers),
  events: outs.flatMap(o => o.events),
});

const ars = (v: number) => '$ ' + (v >= 1e6 ? (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M' : Math.round(v).toLocaleString('es-AR'));
const daysBetween = (a: string, b: Date) => Math.floor((b.getTime() - new Date(a + 'T00:00:00Z').getTime()) / 864e5);
const periodEnd = (p: string) => { const d = new Date(Date.UTC(+p.slice(0, 4), +p.slice(4, 6), 0)); return d.toISOString().slice(0, 10); };
const periodLabel = (p: string) => `${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+p.slice(4, 6) - 1]} ${p.slice(0, 4)}`;

/* ------------------------------------------------------------------ */
/* BCRA: situación crediticia                                          */
/* ------------------------------------------------------------------ */

/** Situación BCRA -> nivel. 1 normal, 2 seguimiento, 3 con problemas, 4 alto riesgo de insolvencia, 5/6 irrecuperable. */
const SITUATION_LEVEL: Record<number, Level> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 };
/** Una entidad con menos de este peso en la deuda total pesa un nivel menos (nunca debajo de Medio si la situación es 3+). */
const MINOR_SHARE = 0.05;

export const worstSituation = (p: DebtPeriod | null) => (p && p.entities.length ? Math.max(...p.entities.map(e => e.situation)) : null);
export const totalDebt = (p: DebtPeriod | null) => (p ? p.entities.reduce((a, e) => a + e.amountArs, 0) : 0);

/** Nivel de un período usando sólo la deuda bancaria (sirve para reconstruir la historia de 24 meses). */
export function periodLevel(p: DebtPeriod): { level: Level; floors: Floor[]; drivers: Driver[] } {
  const floors: Floor[] = [];
  const drivers: Driver[] = [];
  const total = totalDebt(p) || 1;
  for (const e of p.entities) {
    let lvl = SITUATION_LEVEL[e.situation] ?? 0;
    const share = e.amountArs / total;
    if (lvl > 0 && share < MINOR_SHARE && lvl < 4) lvl = Math.max(e.situation >= 3 ? 1 : 0, lvl - 1) as Level;
    if (lvl > 0) {
      floors.push({ level: lvl, reason: `Situación ${e.situation} en ${e.entity} (${Math.round(share * 100)}% de la deuda)` });
      drivers.push({
        label: e.situation >= 5 ? `Deuda irrecuperable en ${e.entity}` : e.situation >= 3 ? `Atrasos bancarios de más de ${e.situation === 3 ? 90 : 180} días en ${e.entity}` : `Atrasos leves con ${e.entity}`,
        effect: 'agrava', impact: (lvl >= 2 ? 3 : share >= 0.25 ? 2 : 1) as Impact, source: 'bcra',
      });
    }
    if (e.legalSituation) floors.push({ level: 4, reason: `${e.entity} informa situación jurídica (concurso o quiebra)` });
    if (e.technicalWriteOff) floors.push({ level: 4, reason: `${e.entity} la informa irrecuperable por disposición técnica` });
    if (e.judicialProcess) {
      floors.push({ level: 3, reason: `${e.entity} informa la deuda en proceso judicial` });
      drivers.push({ label: `Deuda en gestión judicial con ${e.entity}`, effect: 'agrava', impact: 3, source: 'bcra' });
    }
    if (e.forcedRecategorization) {
      floors.push({ level: 1, reason: `${e.entity} la recategorizó obligatoriamente` });
      drivers.push({ label: `Recategorización obligatoria en ${e.entity}`, effect: 'agrava', impact: 2, source: 'bcra' });
    }
    if (e.refinanced) {
      floors.push({ level: 1, reason: `Deuda refinanciada con ${e.entity}` });
      drivers.push({ label: `Deuda refinanciada con ${e.entity}`, effect: 'agrava', impact: 1, source: 'bcra' });
    }
  }
  const level = floors.reduce<Level>((m, f) => (f.level > m ? f.level : m), 0);
  return { level, floors, drivers };
}

export function bcraRules(r: BcraReport): RuleOutput {
  if (!r.current || !r.current.entities.length) {
    return {
      floors: [{ level: 1, reason: 'Sin deuda bancaria informada: no hay historial para evaluar' }],
      drivers: [{ label: 'Sin historial bancario informado', effect: 'agrava', impact: 1, source: 'bcra' }],
      events: [],
    };
  }
  const out = empty();
  const now = periodLevel(r.current);
  out.floors.push(...now.floors);
  out.drivers.push(...now.drivers);

  const hist = r.history;
  const worstNow = worstSituation(r.current) ?? 1;

  // Atrasos serios en los últimos 12 meses, aunque hoy estén regularizados
  const last12 = hist.slice(-12);
  const worst12 = Math.max(1, ...last12.map(p => worstSituation(p) ?? 1));
  if (worst12 >= 3 && worstNow <= 2) {
    out.floors.push({ level: 1, reason: `Situación ${worst12} en los últimos 12 meses` });
    out.drivers.push({ label: `Atrasos de más de 90 días en los últimos 12 meses (hoy regularizados)`, effect: 'agrava', impact: 2, source: 'bcra' });
  }

  // Crecimiento fuerte del endeudamiento en 6 meses
  const prev6 = hist.length >= 7 ? hist[hist.length - 7] : null;
  const debtNow = totalDebt(r.current), debtPrev = totalDebt(prev6);
  if (prev6 && debtPrev > 0) {
    const growth = debtNow / debtPrev - 1;
    if (growth > 0.5) {
      out.drivers.push({ label: `Endeudamiento bancario creció ${Math.round(growth * 100)}% en 6 meses`, effect: 'agrava', impact: growth > 1 ? 2 : 1, source: 'bcra' });
    }
  }

  // Mitigantes
  const clean = hist.length >= 12 && hist.every(p => (worstSituation(p) ?? 1) === 1);
  if (clean) out.drivers.push({ label: `Sin atrasos bancarios en ${hist.length} meses`, effect: 'mitiga', impact: 3, source: 'bcra' });
  if (worstNow === 1 && r.current.entities.length >= 3) out.drivers.push({ label: `Financiamiento diversificado en ${r.current.entities.length} entidades`, effect: 'mitiga', impact: 1, source: 'bcra' });
  if (prev6 && debtPrev > 0 && worstNow === 1 && Math.abs(debtNow / debtPrev - 1) <= 0.2) out.drivers.push({ label: 'Endeudamiento bancario estable', effect: 'mitiga', impact: 1, source: 'bcra' });

  // Eventos: cambios de situación mes a mes
  for (let i = 1; i < hist.length; i++) {
    const a = worstSituation(hist[i - 1]) ?? 1, b = worstSituation(hist[i]) ?? 1;
    if (a === b) continue;
    const worse = b > a;
    const ents = hist[i].entities.filter(e => e.situation === b).map(e => e.entity).slice(0, 2).join(', ');
    out.events.push({
      key: `bcra:sit:${hist[i].period}:${a}>${b}`,
      date: periodEnd(hist[i].period),
      sev: (worse ? (b >= 5 ? 'crit' : b >= 3 ? 'high' : 'mod') : 'low') as Severity,
      title: worse ? `Situación bancaria pasó de ${a} a ${b}` : `Mejoró su situación bancaria de ${a} a ${b}`,
      detail: worse ? `Informado en ${periodLabel(hist[i].period)} por ${ents || 'una entidad'}.` : `Informado en ${periodLabel(hist[i].period)}.`,
      source: 'bcra',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cheques rechazados                                                  */
/* ------------------------------------------------------------------ */

const NO_FUNDS = /fondo/i;

export function checkRules(checks: RejectedCheck[], today: Date): RuleOutput {
  const out = empty();
  const lastYear = checks.filter(c => NO_FUNDS.test(c.cause) && daysBetween(c.rejectedOn, today) <= 365);
  const unpaid = lastYear.filter(c => !c.paidOn);
  const paid = lastYear.filter(c => c.paidOn);
  const recent = unpaid.filter(c => daysBetween(c.rejectedOn, today) <= 90);
  const unpaidAmount = unpaid.reduce((a, c) => a + c.amountArs, 0);

  if (unpaid.length >= 10) out.floors.push({ level: 3, reason: `${unpaid.length} cheques sin fondos impagos en 12 meses` });
  else if (unpaid.length >= 3 || recent.length >= 2) out.floors.push({ level: 2, reason: `${unpaid.length} cheques sin fondos impagos en 12 meses (${recent.length} en 90 días)` });
  else if (unpaid.length >= 1) out.floors.push({ level: 1, reason: `${unpaid.length} cheque sin fondos impago en 12 meses` });

  if (unpaid.length) out.drivers.push({ label: `${unpaid.length} cheque${unpaid.length > 1 ? 's' : ''} rechazado${unpaid.length > 1 ? 's' : ''} sin fondos, sin cancelar (${ars(unpaidAmount)})`, effect: 'agrava', impact: unpaid.length >= 3 ? 3 : 2, source: 'cheques' });
  if (paid.length) out.drivers.push({ label: `${paid.length} cheque${paid.length > 1 ? 's' : ''} rechazado${paid.length > 1 ? 's' : ''} ya cancelado${paid.length > 1 ? 's' : ''}`, effect: unpaid.length ? 'agrava' : 'mitiga', impact: 1, source: 'cheques' });

  for (const c of lastYear.slice(0, 12)) {
    out.events.push({
      key: `chq:${c.entity}:${c.number}`,
      date: c.rejectedOn,
      sev: c.paidOn ? 'low' : 'high',
      title: c.paidOn ? 'Canceló un cheque rechazado' : 'Cheque rechazado sin fondos',
      detail: `${ars(c.amountArs)}${c.paidOn ? `, pagado el ${c.paidOn}` : ', sin cancelar'}.`,
      source: 'cheques',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Hallazgos de la investigación (IA)                                  */
/* ------------------------------------------------------------------ */

export const FINDING_TYPES = [
  'quiebra', 'concurso_preventivo', 'cesacion_de_pagos', 'fraude_o_causa_penal',
  'embargo', 'ejecucion_fiscal', 'sancion_regulatoria', 'clausura',
  'juicio_comercial', 'conflicto_laboral_grave', 'despidos_masivos',
  'cambio_de_autoridades', 'noticia_negativa', 'noticia_positiva',
] as const;
export type FindingType = typeof FINDING_TYPES[number];

export interface Finding {
  type: FindingType;
  date: string;               // YYYY-MM-DD (aproximada si la fuente sólo da mes/año)
  title: string;
  detail: string;
  url: string;
  reliability: 'alta' | 'media' | 'baja';   // alta = fuente oficial; media = medio reconocido; baja = sin confirmar
  ongoing: boolean;           // el hecho sigue vigente (no se levantó, no se resolvió)
}

/** Piso, impacto y gravedad por tipo de hallazgo. `floor: null` = sólo explica, no fija nivel. */
export const FINDING_RULES: Record<FindingType, { floor: Level | null; impact: Impact; effect: 'agrava' | 'mitiga'; sev: Severity; label: string }> = {
  quiebra:                 { floor: 4,    impact: 3, effect: 'agrava', sev: 'crit', label: 'Quiebra' },
  concurso_preventivo:     { floor: 4,    impact: 3, effect: 'agrava', sev: 'crit', label: 'Concurso preventivo' },
  cesacion_de_pagos:       { floor: 4,    impact: 3, effect: 'agrava', sev: 'crit', label: 'Cesación de pagos' },
  fraude_o_causa_penal:    { floor: 3,    impact: 3, effect: 'agrava', sev: 'high', label: 'Causa penal o fraude' },
  embargo:                 { floor: 2,    impact: 2, effect: 'agrava', sev: 'high', label: 'Embargo' },
  ejecucion_fiscal:        { floor: 2,    impact: 2, effect: 'agrava', sev: 'high', label: 'Ejecución fiscal' },
  sancion_regulatoria:     { floor: 2,    impact: 2, effect: 'agrava', sev: 'high', label: 'Sanción regulatoria' },
  clausura:                { floor: 2,    impact: 2, effect: 'agrava', sev: 'high', label: 'Clausura' },
  juicio_comercial:        { floor: 1,    impact: 2, effect: 'agrava', sev: 'mod',  label: 'Juicio comercial' },
  conflicto_laboral_grave: { floor: 1,    impact: 2, effect: 'agrava', sev: 'mod',  label: 'Conflicto laboral grave' },
  despidos_masivos:        { floor: 1,    impact: 2, effect: 'agrava', sev: 'mod',  label: 'Despidos masivos' },
  cambio_de_autoridades:   { floor: null, impact: 1, effect: 'agrava', sev: 'mod',  label: 'Cambio de autoridades' },
  noticia_negativa:        { floor: null, impact: 1, effect: 'agrava', sev: 'mod',  label: 'Noticia negativa' },
  noticia_positiva:        { floor: null, impact: 1, effect: 'mitiga', sev: 'low',  label: 'Noticia positiva' },
};

export function findingRules(findings: Finding[], today: Date): RuleOutput {
  const out = empty();
  for (const f of findings) {
    const rule = FINDING_RULES[f.type];
    const age = daysBetween(f.date, today);
    if (!rule || !Number.isFinite(age) || age > 730) continue;
    // Insolvencia vigente pesa 24 meses; el resto, 12. Lo no confirmado sólo explica.
    const window = rule.floor === 4 ? 730 : 365;
    const confirmed = f.reliability !== 'baja';
    if (rule.floor !== null && f.ongoing && confirmed && age <= window) out.floors.push({ level: rule.floor, reason: `${rule.label}: ${f.title}` });
    out.drivers.push({ label: `${rule.label}${confirmed ? '' : ' (sin confirmar)'}: ${f.title}`, effect: rule.effect, impact: confirmed ? rule.impact : 1, source: 'investigacion' });
    out.events.push({ key: `inv:${f.type}:${f.date}:${f.title.toLowerCase().slice(0, 40)}`, date: f.date, sev: confirmed ? rule.sev : 'mod', title: f.title, detail: f.detail, source: 'investigacion', url: f.url });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Combinación final                                                   */
/* ------------------------------------------------------------------ */

/** Tres o más señales negativas de impacto medio o alto suben un nivel (hasta Muy alto). */
const ACCUMULATION_COUNT = 3;

export function decideLevel(r: RuleOutput): { level: Level; floors: Floor[] } {
  const floors = [...r.floors];
  let level = floors.reduce<Level>((m, f) => (f.level > m ? f.level : m), 0);
  const strongNegatives = new Set(r.drivers.filter(d => d.effect === 'agrava' && d.impact >= 2).map(d => d.label)).size;
  if (strongNegatives >= ACCUMULATION_COUNT && level < 3) {
    level = (level + 1) as Level;
    floors.push({ level, reason: `Acumulación de ${strongNegatives} señales negativas relevantes` });
  }
  return { level, floors: floors.sort((a, b) => b.level - a.level) };
}

export { merge, periodEnd, LEVEL_NAMES };
