/** Orquestación: BCRA -> (investigación si corresponde) -> evaluación -> alertas -> guardado. */
import { fetchBcraReport, type BcraOptions, type BcraReport } from './bcra.ts';
import { isValidCuit, normalizeCuit } from './cuit.ts';
import { evaluate } from './engine.ts';
import { diff, needsResearch, type Alert } from './monitor.ts';
import { researchCompany, type ResearchResult } from './research.ts';
import type { FileStore } from './store.ts';
import type { CompanyResult, Exposure } from './types.ts';

export interface AssessOptions {
  store: FileStore;
  research: 'auto' | 'always' | 'never';
  bcra?: BcraOptions;
  log?: (msg: string) => void;
}

export interface AssessResult {
  result: CompanyResult;
  alerts: Alert[];
  warnings: string[];
}

export async function assess(cuit: string, name: string | undefined, exposure: Exposure | undefined, o: AssessOptions): Promise<AssessResult> {
  if (!isValidCuit(cuit)) throw new Error(`CUIT inválido: ${cuit}`);
  const warnings: string[] = [];
  const prev = await o.store.latest(cuit);

  let bcra: BcraReport | null = null;
  try { bcra = await fetchBcraReport(cuit, o.bcra); }
  catch (e) { warnings.push(`No se pudo consultar el BCRA: ${(e as Error).message}`); }

  // Sin BCRA no recalificamos una empresa que ya conocemos: se conserva el último resultado
  if (!bcra && prev && o.research !== 'always') return { result: prev, alerts: [], warnings };

  const label = name || bcra?.name || normalizeCuit(cuit);
  let research: ResearchResult | null = await o.store.research(cuit);
  const draft = evaluate({ cuit, name: label, exposure, bcra, research });

  const wantResearch = o.research === 'always' || (o.research === 'auto' && needsResearch(prev, draft));
  if (wantResearch) {
    try {
      o.log?.(`Investigando ${label}…`);
      research = await researchCompany(label, cuit);
      await o.store.saveResearch(cuit, research);
    } catch (e) { warnings.push(`No se pudo completar la investigación: ${(e as Error).message}`); }
  }

  const result = wantResearch ? evaluate({ cuit, name: label, exposure, bcra, research }) : draft;
  if (!bcra && prev) result.history = prev.history;
  const alerts = diff(prev, result);
  await o.store.save(result);
  await o.store.saveAlerts(alerts);
  return { result, alerts, warnings };
}

/** Procesa una lista con concurrencia limitada (el BCRA y la IA tienen límites de tasa). */
export async function assessMany<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 4): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}
