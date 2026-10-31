/**
 * Investigación con IA (Claude) de lo que la API del BCRA no cubre: concursos, quiebras,
 * embargos, juicios, sanciones, cambios societarios y noticias.
 *
 * Dos pasos:
 *  1. Investigar con búsqueda web y escribir notas con fuente y fecha de cada hallazgo.
 *  2. Convertir esas notas en hallazgos estructurados y validados (sin búsqueda, más barato).
 * Los hallazgos no deciden el nivel por sí solos: pasan por findingRules() en rules.ts.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { formatCuit } from './cuit.ts';
import { FINDING_TYPES, type Finding } from './rules.ts';

const MODEL = process.env.CENTINEL_MODEL ?? 'claude-opus-5-5';
const MAX_SEARCHES = Number(process.env.CENTINEL_MAX_SEARCHES ?? 12);
const MAX_CONTINUATIONS = 5;

export interface ResearchResult {
  findings: Finding[];
  sector?: string;
  since?: number;
  notes: string;
  researchedAt: string;
}

const SYSTEM_RESEARCH = `Sos analista de riesgo crediticio comercial en Argentina. Investigás empresas que son clientes o proveedores de otras empresas, para saber si pueden dejar de pagar.

Buscá información pública de los últimos 24 meses sobre la empresa indicada. Priorizá, en este orden:
1. Concursos preventivos, quiebras, cesación de pagos (boletines oficiales, edictos, sitios de tribunales).
2. Embargos, ejecuciones fiscales, juicios comerciales relevantes.
3. Sanciones de organismos de control, clausuras, causas penales que involucren a la empresa o a sus directivos por su actividad.
4. Cambios de autoridades o de socios, despidos masivos, conflictos laborales graves.
5. Noticias económicas relevantes, negativas o positivas (inversiones, contratos, cierre de plantas).

Reglas:
- Confirmá que cada hallazgo corresponde a esta empresa (mismo CUIT o razón social exacta). Si hay homónimos, descartá lo que no puedas atribuir con certeza.
- Para cada hallazgo anotá: qué pasó, fecha (al menos mes y año), si sigue vigente, y la URL de la fuente.
- No inventes ni infieras hechos que la fuente no dice. Si no encontrás nada relevante, decilo.
- Indicá también el sector de actividad y el año de inicio si aparecen.`;

const SYSTEM_EXTRACT = `Convertís notas de investigación en hallazgos estructurados. Usá sólo lo que dicen las notas, sin agregar nada.
Tipos: ${FINDING_TYPES.join(', ')}.
Confiabilidad: "alta" si la fuente es oficial (boletín oficial, tribunal, organismo público); "media" si es un medio periodístico reconocido; "baja" si no está confirmado o la atribución a la empresa es dudosa.
Fecha en formato AAAA-MM-DD; si sólo se conoce mes y año, usá el día 01.
"vigente" es false si el hecho se resolvió (se levantó el embargo, se homologó el acuerdo, se cerró la causa).`;

const FindingSchema = z.object({
  tipo: z.enum(FINDING_TYPES),
  fecha: z.string(),
  titulo: z.string(),
  detalle: z.string(),
  url: z.string(),
  confiabilidad: z.enum(['alta', 'media', 'baja']),
  vigente: z.boolean(),
});
const ExtractionSchema = z.object({
  sector: z.string().nullable(),
  anio_inicio: z.number().int().nullable(),
  hallazgos: z.array(FindingSchema),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Paso 1: investigación con búsqueda web. Devuelve notas en texto con fuentes. */
async function investigate(client: Anthropic, name: string, cuit: string): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Empresa: ${name}\nCUIT: ${formatCuit(cuit)}\nPaís: Argentina\n\nInvestigá y escribí tus notas.` },
  ];
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_RESEARCH,
      output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES, user_location: { type: 'approximate', country: 'AR' } }],
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new Error(`La investigación fue rechazada (${res.stop_details?.category ?? 'sin categoría'})`);
    if (res.stop_reason === 'pause_turn') {
      // la búsqueda del servidor quedó en pausa: se reenvía tal cual y continúa sola
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    const urls = res.content.flatMap(b => (b.type === 'text' ? (b.citations ?? []).flatMap(c => ('url' in c && c.url ? [c.url as string] : [])) : []));
    return urls.length ? `${text}\n\nFuentes citadas:\n${[...new Set(urls)].join('\n')}` : text;
  }
  throw new Error('La investigación no terminó después de varias continuaciones');
}

/** Paso 2: notas -> hallazgos validados. */
async function extract(client: Anthropic, name: string, notes: string) {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_EXTRACT,
    output_config: { effort: 'low', format: zodOutputFormat(ExtractionSchema) },
    messages: [{ role: 'user', content: `Empresa: ${name}\n\nNotas:\n${notes}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('La extracción fue rechazada');
  if (!res.parsed_output) throw new Error('La extracción no devolvió un resultado válido');
  return res.parsed_output;
}

export async function researchCompany(name: string, cuit: string, client = new Anthropic()): Promise<ResearchResult> {
  const notes = await investigate(client, name, cuit);
  const data = await extract(client, name, notes);
  const findings: Finding[] = data.hallazgos
    .filter(h => DATE_RE.test(h.fecha) && /^https?:\/\//.test(h.url))   // sin fecha o sin fuente no entra
    .map(h => ({ type: h.tipo, date: h.fecha, title: h.titulo, detail: h.detalle, url: h.url, reliability: h.confiabilidad, ongoing: h.vigente }));
  return {
    findings,
    sector: data.sector ?? undefined,
    since: data.anio_inicio ?? undefined,
    notes,
    researchedAt: new Date().toISOString(),
  };
}
