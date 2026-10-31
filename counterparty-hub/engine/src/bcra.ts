/**
 * Cliente de la API pública de Central de Deudores del BCRA (sin autenticación).
 * Endpoints: /Deudas/{cuit}, /Deudas/Historicas/{cuit}, /Deudas/ChequesRechazados/{cuit}.
 * Los montos de deuda vienen en miles de pesos; acá se convierten a pesos.
 * El parseo es tolerante: un campo faltante nunca rompe la evaluación.
 */
import { normalizeCuit } from './cuit.ts';

export interface EntityDebt {
  entity: string;
  situation: number;          // 1 normal … 5 irrecuperable, 6 irrecuperable por disposición técnica
  amountArs: number;
  daysLate: number | null;
  refinanced: boolean;
  forcedRecategorization: boolean;
  legalSituation: boolean;    // concurso o quiebra informados por la entidad
  technicalWriteOff: boolean;
  underReview: boolean;
  judicialProcess: boolean;
}

export interface DebtPeriod {
  period: string;             // YYYYMM
  entities: EntityDebt[];
}

export interface RejectedCheck {
  cause: string;              // ej. "SIN FONDOS SUFICIENTES DISPONIBLES EN CUENTA"
  entity: string;
  number: string;
  rejectedOn: string;         // YYYY-MM-DD
  amountArs: number;
  paidOn: string | null;
  fineStatus: string | null;
}

export interface BcraReport {
  name: string | null;
  current: DebtPeriod | null;   // último período informado
  history: DebtPeriod[];        // hasta 24 períodos, del más viejo al más nuevo
  checks: RejectedCheck[];
}

export interface BcraOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = process.env.BCRA_BASE_URL ?? 'https://api.bcra.gob.ar/CentralDeDeudores/v1.0';

export class BcraError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** GET con timeout y reintentos en 429/5xx/red. Devuelve null si el BCRA no tiene datos (404). */
async function getJson(url: string, o: Required<Omit<BcraOptions, 'baseUrl'>>): Promise<any | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    if (attempt) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await o.fetchImpl(url, { signal: AbortSignal.timeout(o.timeoutMs), headers: { accept: 'application/json' } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { lastErr = new BcraError(`BCRA respondió ${res.status}`, res.status); continue; }
      if (!res.ok) throw new BcraError(`BCRA respondió ${res.status} para ${url}`, res.status);
      return await res.json();
    } catch (e) {
      if (e instanceof BcraError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const bool = (v: unknown) => v === true || v === 'true' || v === 1;
const date = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

export function parseDebtPeriods(json: any): DebtPeriod[] {
  const periods: any[] = json?.results?.periodos ?? [];
  return periods
    .map(p => ({
      period: String(p?.periodo ?? ''),
      entities: (p?.entidades ?? []).map((e: any): EntityDebt => ({
        entity: String(e?.entidad ?? 'Entidad sin nombre'),
        situation: num(e?.situacion) || 1,
        amountArs: num(e?.monto) * 1000,
        daysLate: e?.diasAtrasoPago == null ? null : num(e.diasAtrasoPago),
        refinanced: bool(e?.refinanciaciones),
        forcedRecategorization: bool(e?.recategorizacionOblig),
        legalSituation: bool(e?.situacionJuridica),
        technicalWriteOff: bool(e?.irrecDisposicionTecnica),
        underReview: bool(e?.enRevision),
        judicialProcess: bool(e?.procesoJud),
      })),
    }))
    .filter(p => /^\d{6}$/.test(p.period))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function parseChecks(json: any): RejectedCheck[] {
  const out: RejectedCheck[] = [];
  for (const c of json?.results?.causales ?? []) {
    for (const e of c?.entidades ?? []) {
      for (const d of e?.detalle ?? []) {
        const rejectedOn = date(d?.fechaRechazo);
        if (!rejectedOn) continue;
        out.push({
          cause: String(c?.causal ?? ''),
          entity: String(e?.entidad ?? ''),
          number: String(d?.nroCheque ?? ''),
          rejectedOn,
          amountArs: num(d?.monto),
          paidOn: date(d?.fechaPago),
          fineStatus: d?.estadoMulta ? String(d.estadoMulta) : null,
        });
      }
    }
  }
  return out.sort((a, b) => b.rejectedOn.localeCompare(a.rejectedOn));
}

export async function fetchBcraReport(cuit: string, opts: BcraOptions = {}): Promise<BcraReport> {
  const id = normalizeCuit(cuit);
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  const o = { timeoutMs: opts.timeoutMs ?? 15000, retries: opts.retries ?? 3, fetchImpl: opts.fetchImpl ?? fetch };
  const [cur, hist, chq] = await Promise.all([
    getJson(`${base}/Deudas/${id}`, o),
    getJson(`${base}/Deudas/Historicas/${id}`, o),
    getJson(`${base}/Deudas/ChequesRechazados/${id}`, o),
  ]);
  const current = parseDebtPeriods(cur).at(-1) ?? null;
  const history = parseDebtPeriods(hist).slice(-24);
  // el período actual a veces no viene en el histórico: lo agregamos para tener la serie completa
  if (current && !history.some(p => p.period === current.period)) history.push(current);
  return {
    name: cur?.results?.denominacion ?? hist?.results?.denominacion ?? chq?.results?.denominacion ?? null,
    current,
    history: history.slice(-24),
    checks: parseChecks(chq),
  };
}
