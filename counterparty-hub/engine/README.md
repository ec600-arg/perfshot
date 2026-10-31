# Motor de Centinel

Califica el riesgo de una empresa argentina por CUIT en 5 niveles (**Bajo, Medio, Alto, Muy alto, Crítico**) y genera alertas cuando cambia.

Funciona en tres capas:

1. **BCRA, sin IA.** Consulta la API pública de Central de Deudores (deuda por entidad, histórico de 24 meses y cheques rechazados) y aplica reglas fijas. Es gratis, rápido y reproducible.
2. **Investigación con IA (Claude).** Busca concursos, quiebras, embargos, juicios, sanciones, cambios societarios y noticias que el BCRA no muestra. Cada hallazgo necesita fecha y URL de la fuente.
3. **Decisión.** Cada regla fija un *piso* de nivel y el nivel final es el piso más alto. Las señales positivas explican pero nunca bajan un piso. Todo queda registrado en `floors` para auditoría.

## Uso

Requiere Node 22.6 o superior.

```bash
npm install
```

```bash
npm run evaluar -- 30-50001091-2 "Razón social"
```

```bash
npm run lote -- ejemplo-clientes.csv --salida ../datos.json
```

```bash
npm run monitorear -- ejemplo-clientes.csv
```

```bash
npm test
```

- Sin `ANTHROPIC_API_KEY` el motor funciona sólo con el BCRA. Con la clave, la IA corre la primera vez, cada 30 días o cuando el BCRA empeora (modo auto). `--investigar` la fuerza y `--sin-ia` la apaga.
- `--salida ../datos.json` deja el archivo junto a `app.html`: si se sirve la carpeta (por ejemplo con `npx serve ..`), el panel muestra esos datos en lugar de los de ejemplo.
- Los resultados, la investigación cacheada y las alertas se guardan en `data/`. Para producción, `schema.sql` tiene el esquema para Postgres o Supabase.

## Reglas (src/rules.ts)

| Señal | Piso |
|---|---|
| Situación 2 en el BCRA | Medio |
| Situación 3 | Alto |
| Situación 4 | Muy alto |
| Situación 5 o 6, situación jurídica informada, irrecuperable por disposición técnica | Crítico |
| Una entidad con menos del 5% de la deuda | un nivel menos (nunca debajo de Medio si es situación 3+) |
| Deuda en proceso judicial informada por una entidad | Muy alto |
| Refinanciación o recategorización obligatoria | Medio |
| Situación 3+ en los últimos 12 meses, hoy regularizada | Medio |
| 1 cheque sin fondos impago en 12 meses | Medio |
| 3+ impagos, o 2+ en los últimos 90 días | Alto |
| 10+ impagos | Muy alto |
| Concurso, quiebra o cesación de pagos vigente y confirmada (24 meses) | Crítico |
| Causa penal o fraude | Muy alto |
| Embargo, ejecución fiscal, sanción regulatoria, clausura | Alto |
| Juicio comercial, conflicto laboral grave, despidos masivos | Medio |
| 3+ señales negativas de impacto medio o alto | sube un nivel (hasta Muy alto) |
| Sin deuda bancaria informada, o BCRA no disponible | Medio, confianza baja |

Hallazgos sin confirmar (`confiabilidad: baja`) o ya resueltos (`vigente: false`) aparecen como señales pero no fijan nivel.

Los umbrales son una propuesta inicial: conviene calibrarlos con el comportamiento de pago real de los primeros clientes.

## A verificar antes de producción

- Probar la API del BCRA desde un servidor propio: los nombres de campos (`situacion`, `monto` en miles de pesos, `procesoJud`, `fechaPago`, etc.) se parsean de forma tolerante, pero conviene confirmarlos con respuestas reales.
- La investigación usa `claude-opus-5-5` con búsqueda web y respaldo automático ante rechazos (`fallbacks: "default"`). Se puede cambiar con `CENTINEL_MODEL` y limitar búsquedas con `CENTINEL_MAX_SEARCHES` (por defecto 12).
- Revisar el encuadre bajo la Ley 25.326 de Protección de Datos Personales antes de vender informes.
