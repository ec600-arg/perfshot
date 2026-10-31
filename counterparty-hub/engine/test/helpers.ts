/** Arma respuestas con la misma forma que la API de Central de Deudores del BCRA. */
export interface Ent { entidad?: string; situacion: number; monto: number; procesoJud?: boolean; situacionJuridica?: boolean; refinanciaciones?: boolean }

export function periodos(end: string, n: number, fn: (i: number) => Ent[]) {
  const y = +end.slice(0, 4), m = +end.slice(4, 6) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (n - 1) + i, 1));
    const periodo = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { periodo, entidades: fn(i).map(e => ({ entidad: 'BANCO DE PRUEBA S.A.', diasAtrasoPago: 0, refinanciaciones: false, recategorizacionOblig: false, situacionJuridica: false, irrecDisposicionTecnica: false, enRevision: false, procesoJud: false, ...e })) };
  });
}

export const deudas = (denominacion: string, p: unknown[]) => ({ status: 200, results: { identificacion: 30712345678, denominacion, periodos: p } });

export const cheques = (denominacion: string, detalle: { fechaRechazo: string; monto: number; fechaPago?: string | null; nroCheque?: number }[], causal = 'SIN FONDOS SUFICIENTES DISPONIBLES EN CUENTA') => ({
  status: 200,
  results: { identificacion: 30712345678, denominacion, causales: [{ causal, entidades: [{ entidad: 11, detalle: detalle.map((d, i) => ({ nroCheque: d.nroCheque ?? 1000 + i, fechaRechazo: d.fechaRechazo, monto: d.monto, fechaPago: d.fechaPago ?? null, fechaPagoMulta: null, estadoMulta: null, ctaPersonal: false, denomJuridica: denominacion, enRevision: false, procesoJud: false })) }] }] },
});

/** fetch falso: responde según la ruta; lo que no está en el mapa devuelve 404. */
export function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    const hit = Object.entries(routes).find(([k]) => u.endsWith(k));
    if (!hit) return new Response('{"status":404}', { status: 404 });
    const v = hit[1];
    if (typeof v === 'number') return new Response('error', { status: v });
    return new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
