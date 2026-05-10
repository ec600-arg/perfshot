# PERF SHOT — Revisión de Rendimiento

**Fecha:** Mayo 2026  
**Archivo analizado:** `index.html` (846 líneas, ~170KB)  
**Stack:** Vanilla JS + Supabase + Claude AI Edge Functions

---

## Resumen ejecutivo

La aplicación es una SPA monolítica en un único archivo HTML con JS y CSS embebidos. El patrón de renderizado destruye y reconstruye todo el DOM en cada cambio de estado, sin ningún mecanismo de diff ni cache de componentes. Esta es la raíz de la mayoría de los problemas de rendimiento.

---

## Problemas críticos

### 1. Reemplazo total del DOM en cada render

```javascript
function render() {
  document.getElementById('app').innerHTML = html();
  bind();
}
```

**Problema:** Cada interacción del usuario (clic en filtro, hover en tooltip, toast notification) destruye y reconstruye todo el árbol DOM. El navegador ejecuta un layout/reflow completo en cada render. Los event listeners se pierden y `bind()` los vuelve a registrar sin hacer cleanup de los anteriores, acumulando memory leaks.

**Impacto:** Alto — afecta todo el tiempo de vida de la sesión.

**Solución:** Migrar a un patrón de actualizaciones quirúrgicas. Actualizar solo el nodo afectado en lugar del árbol completo. A corto plazo, separar el contenido estático (sidebar, topbar) del contenido dinámico (`.content`), y dentro del contenido solo re-renderizar el bloque que cambió.

```javascript
// Mínimo: separar zonas de actualización
function renderContent() {
  document.querySelector('.content').innerHTML = pageHTML();
  bindContent();
}

function renderToast() {
  const existing = document.querySelector('.toast');
  if (ST.toast) {
    const el = document.createElement('div');
    el.className = `toast ${ST.toast.type}`;
    el.textContent = ST.toast.msg;
    if (!existing) document.body.appendChild(el);
  } else {
    existing?.remove();
  }
}
```

---

### 2. `loadData()` completo después de cada mutación

```javascript
async function saveWeapon(form) {
  await sb.from('weapons').update(form).eq('id', editItem.id);
  await loadData(); // ← re-fetches 7 parallel queries
}
```

**Problema:** Guardar un arma, una sesión, un evento del calendario o un comentario de entrenador dispara `loadData()`, que hace 7 queries en paralelo a Supabase. Esto es excesivo: si el usuario guardó un arma, no necesita refrescar las sesiones, el calendario ni las notificaciones.

**Impacto:** Alto — latencia de red innecesaria en cada escritura.

**Solución:** Actualización local optimista + refresh selectivo.

```javascript
async function saveWeapon(form) {
  const updated = editItem
    ? await sb.from('weapons').update(form).eq('id', editItem.id).select().single()
    : await sb.from('weapons').insert({ ...form, athlete_id: ST.user.id }).select().single();

  if (updated.error) { toast(updated.error.message, 'err'); return; }

  // Actualización local — sin roundtrip a la DB
  if (editItem) {
    weapons = weapons.map(w => w.id === editItem.id ? updated.data : w);
  } else {
    weapons = [updated.data, ...weapons];
  }
  ST.modal = null;
  editItem = null;
  toast('Arma guardada ✓');
  render();
}
```

---

### 3. `select('*')` sobre sessions con 60+ columnas

```javascript
sb.from('sessions').select('*').eq('athlete_id', uid).order('date', {ascending: false}).limit(60)
```

**Problema:** La tabla `sessions` tiene más de 60 campos documentados. Para el listado del dashboard solo se usan ~8 (date, discipline, type, total_score, wind_level, objective_met, id, scatt_file_url). Se traen todas las columnas innecesariamente, aumentando payload y tiempo de deserialización.

**Solución:** Usar proyecciones específicas por contexto.

```javascript
// Para listados y dashboard
const SESSION_LIST_COLS = 'id,date,discipline,type,total_score,wind_level,objective_met,mental_state,physical_state';

// Solo al abrir el detalle de una sesión, cargar todo
const SESSION_DETAIL_COLS = '*';

// En loadData():
sb.from('sessions').select(SESSION_LIST_COLS).eq('athlete_id', uid)...
```

---

### 4. Calendar events sin filtro de rango de fechas

```javascript
sb.from('calendar_events').select('*').eq('athlete_id', uid).order('date')
```

**Problema:** Se cargan **todos** los eventos del calendario del usuario sin límite de fecha. Un atleta activo acumula eventos rápidamente. A los 6 meses de uso, esta query se convierte en un problema serio.

**Solución:** Filtrar por ventana temporal relevante.

```javascript
const rangeStart = new Date();
rangeStart.setMonth(rangeStart.getMonth() - 1);
const rangeEnd = new Date();
rangeEnd.setMonth(rangeEnd.getMonth() + 3);

sb.from('calendar_events')
  .select('*')
  .eq('athlete_id', uid)
  .gte('date', rangeStart.toISOString().split('T')[0])
  .lte('date', rangeEnd.toISOString().split('T')[0])
  .order('date')
```

---

### 5. `Math.max(...scores)` / `Math.min(...scores)` con spread

```javascript
const best = scores.length ? Math.max(...scores) : null;
const cMin = cs.length ? Math.min(...cs) - 2 : 560;
```

**Problema:** El operador spread pasa el array como argumentos de función. Con arrays grandes puede causar `RangeError: Maximum call stack size exceeded`. Además se calcula en cada render sin memoización.

**Solución:**

```javascript
const best = scores.length ? scores.reduce((a, b) => a > b ? a : b) : null;
const cMin = cs.length ? cs.reduce((a, b) => a < b ? a : b) - 2 : 560;
```

---

## Problemas moderados

### 6. Funciones de cómputo sin memoización

`getChartData()` y `getWeekStats()` iteran el array `sessions` (hasta 60 items) en cada render. Si el usuario hace clic en los filtros del chart, se recalculan en cada keystroke/click aunque los datos no cambiaron.

```javascript
// Memoizar con un hash de dependencias
let _chartCache = { key: null, data: null };

function getChartData() {
  const key = `${ST.chartFilter}-${ST.chartType}-${sessions.length}`;
  if (_chartCache.key === key) return _chartCache.data;
  
  let d = [...sessions];
  // ... filtering logic ...
  _chartCache = { key, data: d };
  return d;
}
```

---

### 7. Toast con render completo

```javascript
function toast(msg, type = 'ok', dur = 4500) {
  ST.toast = { msg, type };
  render();                                 // ← full re-render
  setTimeout(() => { ST.toast = null; render() }, dur); // ← otro full re-render
}
```

Un toast es un overlay flotante que no debería requerir reconstruir todo el DOM. Con el patrón actual, mostrar y ocultar un toast hace 2 re-renders completos de la aplicación.

---

### 8. Uploads de archivos secuenciales en saveSession

```javascript
if (d.scatt_file) {
  await sb.storage.from('scatt-files').upload(path, d.scatt_file);
  // ... espera a que termine
}
if (d.target_file) {
  await sb.storage.from('targets').upload(path, d.target_file);
  // ... recién empieza el segundo upload
}
```

Los dos archivos se suben secuencialmente. Si el usuario adjunta SCATT y blanco, el segundo upload no empieza hasta que termina el primero.

**Solución:**

```javascript
const uploads = await Promise.all([
  d.scatt_file ? uploadFile('scatt-files', d.scatt_file, ST.user.id) : Promise.resolve(null),
  d.target_file ? uploadFile('targets', d.target_file, ST.user.id) : Promise.resolve(null),
]);
const [scUrl, tUrl] = uploads;
```

---

### 9. Event listeners acumulados sin cleanup

```javascript
function bind() {
  // Agrega N event listeners
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', ...);
  });
  // No hay removeEventListener previo
}
```

Cada `render()` → `bind()` agrega nuevos listeners sobre los mismos elementos (si el navegador no los garbage-collect porque el nodo anterior fue reemplazado). Con la arquitectura actual de reemplazo de innerHTML esto se auto-resuelve parcialmente, pero ante cualquier refactor parcial del DOM se convierte en un leak real.

---

### 10. Google Fonts sin optimización de carga

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
```

Falta `preconnect` a los dominios de Google Fonts, lo que agrega una negociación DNS/TCP adicional en el critical path de carga.

**Solución:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500&family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
```

---

### 11. Supabase JS cargado desde unpkg sin integridad

```html
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
```

Sin `integrity` attribute ni `crossorigin`. Esto es un riesgo de seguridad (supply chain) y también impide que el navegador cachee el recurso entre subdominios de manera óptima. Además, `@2` sin versión patch puede recibir cambios breaking sin aviso.

**Solución:**

```html
<script 
  src="https://unpkg.com/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
  integrity="sha384-[hash]"
  crossorigin="anonymous">
</script>
```

---

### 12. `getSession()` en cada llamada a Edge Functions

```javascript
async function callEdge(name, body) {
  const { data: { session } } = await sb.auth.getSession(); // ← roundtrip en cada llamada
  const res = await fetch(...)
}
```

`sb.auth.getSession()` puede hacer un roundtrip a Supabase si el token está vencido. Para Edge Functions consecutivas (por ej. save session → analyze session), el token se pide dos veces.

**Solución:** Cachear el access token con su TTL, o pasar el token como parámetro.

---

## Problemas menores / Deuda técnica

### 13. Archivo monolítico de 170KB

Toda la aplicación en un único archivo impide:
- **Code splitting:** El código del módulo de coach, ISSF, y análisis avanzado se carga aunque el usuario nunca los use.
- **Caching granular:** Un cambio en cualquier parte invalida el cache del archivo completo.
- **Tree shaking:** Sin bundler, los SVG de iconos que no se usan siguen ocupando espacio.

El tamaño puede reducirse ~30-40% solo moviendo CSS e iconos SVG a archivos separados y cacheables.

---

### 14. SVG icons inline repetidos en cada render

```javascript
const I = {
  home: `<svg width="14" height="14" ...>...</svg>`,
  target: `<svg ...>...</svg>`,
  // 20+ iconos
};
```

Los 20+ iconos SVG son strings que se insertan como innerHTML en cada render. Mejor práctica: definirlos como `<symbol>` en el documento una sola vez y referenciarlos con `<use>`.

```html
<svg style="display:none">
  <symbol id="icon-home" viewBox="0 0 24 24">
    <path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/>
  </symbol>
</svg>

<!-- Uso -->
<svg width="14" height="14"><use href="#icon-home"/></svg>
```

---

### 15. `personal_bests` recargado en cada mutación

Los personal bests no cambian frecuentemente pero se refrescan con cada `loadData()`. Podrían invalidarse solo cuando se guarda una sesión con score superior al registro actual.

---

### 16. Sessions sin paginación en el historial

```javascript
// En sessListHTML(), se renderizan todas las sesiones filtradas
sessions.filter(...).map(s => `<div class="srow"...`)
```

Aunque se limita a 60 en la carga, cuando el período es largo se renderizan todos los rows del DOM sin paginación ni virtualización. Con 60 rows esto es manejable, pero cualquier aumento del límite lo convierte en un problema.

---

## Plan de acción priorizado

| Prioridad | Problema | Esfuerzo | Impacto |
|-----------|----------|----------|---------|
| 🔴 Crítico | Render parcial en lugar de full DOM replace | Alto | Muy alto |
| 🔴 Crítico | `loadData()` selectivo por mutación | Medio | Alto |
| 🔴 Crítico | Proyecciones SQL en lugar de `select('*')` | Bajo | Alto |
| 🟠 Alto | Filtro de fechas en `calendar_events` | Bajo | Alto |
| 🟠 Alto | Uploads paralelos en `saveSession` | Bajo | Medio |
| 🟡 Medio | Memoización de `getChartData` / `getWeekStats` | Bajo | Medio |
| 🟡 Medio | Toast sin full render | Medio | Medio |
| 🟡 Medio | `preconnect` para Google Fonts | Muy bajo | Bajo |
| 🟢 Bajo | SVG icons con `<symbol>/<use>` | Bajo | Bajo |
| 🟢 Bajo | Versión pinned de Supabase JS + integrity | Muy bajo | Seguridad |

---

## Métricas de referencia (estimadas)

| Métrica | Actual | Con mejoras críticas |
|---------|--------|----------------------|
| Tiempo de primer render (FCP) | ~800ms | ~600ms |
| Queries de red por mutación | 7 (loadData completo) | 1-2 (selectivo) |
| Payload sessions query | ~60 × 60 cols | ~60 × 8 cols (~87% menos) |
| Re-renders por toast | 2 full renders | 0 DOM renders |
| Tiempo de upload sesión (SCATT + blanco) | T1 + T2 secuencial | max(T1, T2) paralelo |

---

## Notas sobre arquitectura

La decisión de usar un único archivo HTML sin build tools es válida para un MVP y simplifica el deploy enormemente. Las mejoras de rendimiento más importantes **no requieren cambiar esa arquitectura**: las queries SQL, los uploads paralelos y las actualizaciones locales optimistas son cambios aislados dentro del mismo paradigma.

Si en el futuro se decide adoptar un bundler (Vite es la opción más liviana), el beneficio principal sería code splitting y tree shaking, reduciendo el payload inicial de ~170KB a ~40-60KB para la vista del dashboard.
