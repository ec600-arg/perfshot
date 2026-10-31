import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCuit, formatCuit } from '../src/cuit.ts';
import { fetchBcraReport } from '../src/bcra.ts';
import { evaluate } from '../src/engine.ts';
import { diff, needsResearch } from '../src/monitor.ts';
import type { Finding } from '../src/rules.ts';
import { cheques, deudas, fakeFetch, periodos } from './helpers.ts';

const TODAY = new Date('2026-10-30T12:00:00Z');
const CUIT = '30-71234567-8';
const base = 'https://bcra.test';

async function report(routes: Record<string, unknown>) {
  return fetchBcraReport(CUIT.replace(/-/g, '').slice(0, 10) + '8', { baseUrl: base, fetchImpl: fakeFetch(routes), retries: 0 });
}

test('valida y formatea CUIT', () => {
  assert.equal(isValidCuit('30-71234567-8'), false);
  assert.equal(isValidCuit('30-50001091-2'), true);
  assert.equal(isValidCuit('20-12345678-6'), true);
  assert.equal(isValidCuit('99-12345678-6'), false);
  assert.equal(formatCuit('30500010912'), '30-50001091-2');
});

test('empresa sin atrasos en 24 meses y 3 bancos: riesgo Bajo con mitigantes', async () => {
  const p = periodos('202609', 24, () => [{ situacion: 1, monto: 10000, entidad: 'BANCO A' }, { situacion: 1, monto: 8000, entidad: 'BANCO B' }, { situacion: 1, monto: 5000, entidad: 'BANCO C' }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('LIMPIA S.A.', [p.at(-1)]), '/Historicas/30712345678': deudas('LIMPIA S.A.', p) });
  const r = evaluate({ cuit: '30712345678', bcra, today: TODAY });
  assert.equal(r.levelName, 'Bajo');
  assert.equal(r.history.length, 24);
  assert.ok(r.drivers.some(d => d.effect === 'mitiga' && d.impact === 3));
  assert.equal(r.bcra.totalDebtArs, 23_000_000); // los montos vienen en miles
  assert.equal(r.name, 'LIMPIA S.A.');
});

test('situación 3 en el banco principal: Alto, con evento del cambio y la historia que empeora', async () => {
  const p = periodos('202609', 24, i => [{ situacion: i >= 21 ? 3 : 1, monto: 40000, entidad: 'BANCO PRINCIPAL' }, { situacion: 1, monto: 2000, entidad: 'BANCO CHICO' }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('ATRASADA S.R.L.', [p.at(-1)]), '/Historicas/30712345678': deudas('ATRASADA S.R.L.', p) });
  const r = evaluate({ cuit: '30712345678', bcra, today: TODAY });
  assert.equal(r.levelName, 'Alto');
  assert.equal(r.history[0], 0);
  assert.equal(r.history.at(-1), 2);
  assert.ok(r.events.some(e => e.title === 'Situación bancaria pasó de 1 a 3' && e.sev === 'high'));
});

test('situación 3 en un banco que pesa menos del 5% cuenta un nivel menos', async () => {
  const p = periodos('202609', 12, () => [{ situacion: 1, monto: 100000, entidad: 'GRANDE' }, { situacion: 3, monto: 1000, entidad: 'CHICO' }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p) });
  assert.equal(evaluate({ cuit: '30712345678', bcra, today: TODAY }).levelName, 'Medio');
});

test('proceso judicial informado por un banco: mínimo Muy alto', async () => {
  const p = periodos('202609', 6, () => [{ situacion: 2, monto: 5000, procesoJud: true }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p) });
  assert.equal(evaluate({ cuit: '30712345678', bcra, today: TODAY }).levelName, 'Muy alto');
});

test('3 cheques sin fondos impagos en el año: Alto; los pagados mitigan', async () => {
  const p = periodos('202609', 12, () => [{ situacion: 1, monto: 5000 }]);
  const chq = cheques('X', [
    { fechaRechazo: '2026-09-10', monto: 1_500_000 },
    { fechaRechazo: '2026-08-02', monto: 900_000 },
    { fechaRechazo: '2026-03-15', monto: 300_000 },
    { fechaRechazo: '2026-02-01', monto: 100_000, fechaPago: '2026-02-20' },
  ]);
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p), '/ChequesRechazados/30712345678': chq });
  const r = evaluate({ cuit: '30712345678', bcra, today: TODAY });
  assert.equal(r.levelName, 'Alto');
  assert.equal(r.events.filter(e => e.source === 'cheques').length, 4);
  assert.ok(r.drivers.some(d => d.label.startsWith('3 cheques rechazados sin fondos')));
});

test('cheques rechazados por otra causa (defectos formales) no suben el nivel', async () => {
  const p = periodos('202609', 12, () => [{ situacion: 1, monto: 5000 }]);
  const chq = cheques('X', [{ fechaRechazo: '2026-09-10', monto: 1_000 }, { fechaRechazo: '2026-09-11', monto: 1_000 }, { fechaRechazo: '2026-09-12', monto: 1_000 }], 'DEFECTOS FORMALES');
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p), '/ChequesRechazados/30712345678': chq });
  assert.equal(evaluate({ cuit: '30712345678', bcra, today: TODAY }).levelName, 'Bajo');
});

test('sin datos en el BCRA: Medio por falta de historial, confianza baja', async () => {
  const bcra = await report({});
  const r = evaluate({ cuit: '30712345678', name: 'NUEVA S.A.S.', bcra, today: TODAY });
  assert.equal(r.levelName, 'Medio');
  assert.equal(r.confidence, 'baja');
  assert.equal(r.bcra.hasData, false);
});

test('si el BCRA no responde, nunca califica Bajo', () => {
  const r = evaluate({ cuit: '30712345678', name: 'X', bcra: null, today: TODAY });
  assert.equal(r.levelName, 'Medio');
  assert.equal(r.confidence, 'baja');
});

test('concurso preventivo confirmado y vigente: Crítico; lo no confirmado sólo explica', async () => {
  const p = periodos('202609', 12, () => [{ situacion: 1, monto: 5000 }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p) });
  const f = (o: Partial<Finding>): Finding => ({ type: 'concurso_preventivo', date: '2026-07-01', title: 'Abrió su concurso preventivo', detail: 'Edicto publicado.', url: 'https://ejemplo.gob.ar/edicto', reliability: 'alta', ongoing: true, ...o });
  const research = { findings: [f({})], notes: '', researchedAt: TODAY.toISOString() };
  const r = evaluate({ cuit: '30712345678', bcra, research, today: TODAY });
  assert.equal(r.levelName, 'Crítico');
  assert.equal(r.confidence, 'alta');
  assert.ok(r.events.some(e => e.sev === 'crit' && e.url));

  const rumor = evaluate({ cuit: '30712345678', bcra, research: { ...research, findings: [f({ reliability: 'baja' })] }, today: TODAY });
  assert.equal(rumor.levelName, 'Bajo');
  assert.ok(rumor.drivers.some(d => d.label.includes('sin confirmar')));

  const resolved = evaluate({ cuit: '30712345678', bcra, research: { ...research, findings: [f({ ongoing: false })] }, today: TODAY });
  assert.equal(resolved.levelName, 'Bajo');
});

test('acumulación: tres señales negativas relevantes suben un nivel', async () => {
  const p = periodos('202609', 12, () => [{ situacion: 2, monto: 5000 }]);
  const bcra = await report({ '/Deudas/30712345678': deudas('X', [p.at(-1)]), '/Historicas/30712345678': deudas('X', p) });
  const findings: Finding[] = [
    { type: 'juicio_comercial', date: '2026-06-01', title: 'Demanda de un proveedor', detail: '', url: 'https://a.ar', reliability: 'media', ongoing: true },
    { type: 'despidos_masivos', date: '2026-05-01', title: 'Despidió al 30% del personal', detail: '', url: 'https://b.ar', reliability: 'media', ongoing: true },
  ];
  const r = evaluate({ cuit: '30712345678', bcra, research: { findings, notes: '', researchedAt: '' }, today: TODAY });
  // situación 2 (Medio) + 3 señales de impacto >= 2 -> Alto
  assert.equal(r.levelName, 'Alto');
  assert.ok(r.floors.some(x => x.reason.startsWith('Acumulación')));
});

test('el cliente del BCRA reintenta ante 500 y trata 404 como sin datos', async () => {
  const calls: string[] = [];
  let n = 0;
  const flaky = (async (url: string | URL) => {
    calls.push(String(url));
    if (String(url).includes('/Historicas/') && n++ === 0) return new Response('x', { status: 503 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const r = await fetchBcraReport('30712345678', { baseUrl: base, fetchImpl: flaky, retries: 2 });
  assert.equal(r.current, null);
  assert.equal(calls.filter(c => c.includes('/Historicas/')).length, 2);
  await assert.rejects(fetchBcraReport('30712345678', { baseUrl: base, fetchImpl: fakeFetch({ '/Deudas/30712345678': 400 }), retries: 2 }));
});

test('monitoreo: alerta por cambio de nivel y sólo por eventos nuevos', async () => {
  const before = periodos('202608', 12, () => [{ situacion: 1, monto: 5000 }]);
  const after = periodos('202609', 12, i => [{ situacion: i === 11 ? 4 : 1, monto: 5000 }]);
  const r1 = evaluate({ cuit: '30712345678', bcra: await report({ '/Deudas/30712345678': deudas('X', [before.at(-1)]), '/Historicas/30712345678': deudas('X', before) }), today: new Date('2026-09-30') });
  const r2 = evaluate({ cuit: '30712345678', bcra: await report({ '/Deudas/30712345678': deudas('X', [after.at(-1)]), '/Historicas/30712345678': deudas('X', after) }), today: TODAY });
  const alerts = diff(r1, r2);
  assert.ok(alerts.some(a => a.title === 'Pasó de riesgo Bajo a Muy alto' && a.sev === 'high'));
  assert.ok(alerts.some(a => a.title === 'Situación bancaria pasó de 1 a 4'));
  assert.equal(diff(r2, { ...r2 }).length, 0);
  assert.equal(needsResearch({ ...r1, researchedAt: '2026-10-20T00:00:00Z' }, r2, 30, TODAY), true);
  assert.equal(needsResearch({ ...r2, researchedAt: '2026-10-20T00:00:00Z' }, r2, 30, TODAY), false);
});
