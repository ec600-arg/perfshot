/**
 * Almacenamiento local en archivos JSON (data/) para correr el motor sin base de datos.
 * En producción se reemplaza por Postgres/Supabase con el esquema de schema.sql:
 * mismas operaciones (último resultado, guardar resultado, guardar alertas, investigación cacheada).
 */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeCuit } from './cuit.ts';
import type { Alert } from './monitor.ts';
import type { ResearchResult } from './research.ts';
import type { CompanyResult } from './types.ts';

export class FileStore {
  readonly dir: string;
  constructor(dir = process.env.CENTINEL_DATA_DIR ?? 'data') { this.dir = dir; }

  private async readJson<T>(file: string): Promise<T | null> {
    try { return JSON.parse(await readFile(join(this.dir, file), 'utf8')) as T; } catch { return null; }
  }
  private async writeJson(file: string, v: unknown) {
    await mkdir(join(this.dir, file, '..'), { recursive: true });
    await writeFile(join(this.dir, file), JSON.stringify(v, null, 2));
  }

  latest(cuit: string) { return this.readJson<CompanyResult>(`resultados/${normalizeCuit(cuit)}.json`); }
  async save(r: CompanyResult) {
    await this.writeJson(`resultados/${normalizeCuit(r.cuit)}.json`, r);
    await mkdir(join(this.dir, 'historial'), { recursive: true });
    await appendFile(join(this.dir, 'historial', `${normalizeCuit(r.cuit)}.jsonl`), JSON.stringify({ at: r.computedAt, level: r.level, floors: r.floors }) + '\n');
  }

  research(cuit: string) { return this.readJson<ResearchResult>(`investigacion/${normalizeCuit(cuit)}.json`); }
  saveResearch(cuit: string, r: ResearchResult) { return this.writeJson(`investigacion/${normalizeCuit(cuit)}.json`, r); }

  async saveAlerts(alerts: Alert[]) {
    if (!alerts.length) return;
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, 'alertas.jsonl'), alerts.map(a => JSON.stringify(a)).join('\n') + '\n');
  }
}
