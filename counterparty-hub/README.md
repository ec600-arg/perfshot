# Centinel · Counterparty Risk Hub

Landing page y modelo de negocio de una solución de early warning de riesgo de contrapartes (AR · BR · CL).

- `index.html` — landing autocontenida (HTML + CSS + JS, sin build). Abrila directo en el navegador o subila a cualquier hosting estático (Vercel, Netlify, Cloudflare Pages).
- `MONETIZACION.md` — modelo de precios (ad hoc, lote, one-time, continuo, API), embudo, números y roadmap.

La demo del hero valida el dígito verificador real de CUIT, CNPJ y RUT, pero el score que muestra es **simulado** en el navegador. Para producción, reemplazá `render()` por una llamada a tu backend, y el `TODO` del formulario por tu CRM o Supabase.
