/**
 * Uso:
 *   npm run evaluar -- 30-71234567-8 "Razón social" [--investigar | --sin-ia]
 *   npm run lote -- clientes.csv [--investigar | --sin-ia] [--salida panel.json]
 *   npm run monitorear -- clientes.csv
 *
 * CSV: columnas cuit, razon_social y opcionalmente saldo, vencido, limite, compras_mes (en pesos). Separador , o ;
 * Por defecto (modo auto) la IA se corre la primera vez, cada 30 días, o si el BCRA empeoró.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { formatCuit } from './cuit.ts';
import { assess, assessMany } from './service.ts';
import { FileStore } from './store.ts';
import type { CompanyResult, Exposure } from './types.ts';

const SEV_ICON = { crit: '⛔', high: '🔴', mod: '🟠', low: '🟢' } as const;

interface Row { cuit: string; name?: string; exposure?: Exposure }

function parseCsv(text: string): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const iC = col('cuit', 'tax_id'), iN = col('razon_social', 'nombre', 'empresa'), iS = col('saldo'), iV = col('vencido'), iL = col('limite', 'límite'), iM = col('compras_mes', 'compras_mensuales');
  if (iC < 0) throw new Error('El CSV necesita una columna "cuit"');
  const n = (v?: string) => Number((v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
  return lines.slice(1).map(l => {
    const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    const exposure = iS >= 0 ? { balance: n(c[iS]), overdue: iV >= 0 ? n(c[iV]) : 0, limit: iL >= 0 ? n(c[iL]) : 0, monthlySales: iM >= 0 ? n(c[iM]) : undefined } : undefined;
    return { cuit: c[iC], name: iN >= 0 ? c[iN] : undefined, exposure };
  });
}

function summary(r: CompanyResult): string {
  const top = r.drivers.filter(d => d.effect === 'agrava').slice(0, 3).map(d => d.label).join(' · ');
  return `${r.name} (${r.cuit}) → ${r.levelName.toUpperCase()} · confianza ${r.confidence}${top ? `\n   ${top}` : ''}`;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const pos = args.filter(a => !a.startsWith('--'));
  const outIdx = args.indexOf('--salida');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const research = flags.has('--investigar') ? 'always' : flags.has('--sin-ia') || !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN ? 'never' : 'auto';
  const store = new FileStore();
  const log = (m: string) => console.error(m);

  if (cmd === 'evaluar') {
    if (!pos[0]) throw new Error('Indicá un CUIT');
    const { result, alerts, warnings } = await assess(pos[0], pos[1], undefined, { store, research, log });
    warnings.forEach(w => console.error('⚠ ' + w));
    if (flags.has('--json')) { console.log(JSON.stringify(result, null, 2)); return; }
    console.log(summary(result));
    for (const f of result.floors.slice(0, 5)) console.log(`   piso ${f.level}: ${f.reason}`);
    for (const a of alerts) console.log(`   ${SEV_ICON[a.sev]} ${a.title} — ${a.detail}`);
    return;
  }

  if (cmd === 'lote' || cmd === 'monitorear') {
    if (!pos[0]) throw new Error('Indicá el archivo CSV');
    const rows = parseCsv(await readFile(pos[0], 'utf8'));
    const results: CompanyResult[] = [];
    let alertCount = 0;
    await assessMany(rows, async row => {
      try {
        const { result, alerts, warnings } = await assess(row.cuit, row.name, row.exposure, { store, research: cmd === 'monitorear' && research === 'always' ? 'always' : research, log });
        results.push(result);
        alertCount += alerts.length;
        if (cmd === 'lote') console.log('✓ ' + summary(result));
        for (const a of alerts) console.log(`${SEV_ICON[a.sev]} ${result.name}: ${a.title}`);
        warnings.forEach(w => console.error(`⚠ ${formatCuit(row.cuit)}: ${w}`));
      } catch (e) {
        console.error(`✗ ${row.cuit}: ${(e as Error).message}`);
      }
    });
    console.error(`\n${results.length}/${rows.length} empresas procesadas · ${alertCount} alertas`);
    if (outFile) {
      await writeFile(outFile, JSON.stringify(results, null, 2));
      console.error(`Resultados para el panel en ${outFile}`);
    }
    return;
  }

  console.log('Comandos: evaluar <cuit> [razón social] | lote <archivo.csv> [--salida panel.json] | monitorear <archivo.csv>\nOpciones: --investigar (forzar IA) · --sin-ia · --json');
}

main().catch(e => { console.error('Error: ' + (e as Error).message); process.exit(1); });
