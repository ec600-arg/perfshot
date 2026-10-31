# Centinel · Counterparty Risk Hub

Landing page, maqueta del panel y modelo de negocio de una solución de alertas tempranas de riesgo de clientes y proveedores en Argentina.

- `index.html`: landing autocontenida (HTML + CSS + JS, sin build). Se abre directo en el navegador o se sube a cualquier hosting estático (Vercel, Netlify, Cloudflare Pages).
- `app.html`: maqueta del panel (tablero de cartera, ficha por empresa y alertas) con datos de ejemplo. El formato de datos que espera está documentado al principio del script.
- `engine/`: motor de calificación (BCRA + reglas + investigación con IA + monitoreo). Ver `engine/README.md`.
- `MONETIZACION.md`: modelo de precios (consultas sueltas, lote, diagnóstico, monitoreo continuo, API), embudo, números y roadmap.

La calificación usa 5 niveles de riesgo: Bajo, Medio, Alto, Muy alto y Crítico. La demo del hero valida el dígito verificador real del CUIT, pero el nivel que muestra es **simulado** en el navegador. Para producción, reemplazá `render()` en la landing y `buildDemoData()` en el panel por llamadas a tu backend, y el `TODO` del formulario por tu CRM o Supabase.
