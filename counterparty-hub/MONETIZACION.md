# Centinel · Counterparty Risk Hub — Modelo de monetización

> Documento de trabajo. Los precios son una propuesta inicial para validar con los primeros clientes, no números definitivos.

## 1. La tesis en una línea

Las pymes y empresas medianas de Argentina, Brasil y Chile **financian a sus clientes** (cuenta corriente a 30/60/90 días) sin un área de riesgo. Centinel les vende lo que tiene un banco: **calificación + vigilancia continua + alerta temprana**, a precio pyme y en autoservicio.

El ingreso pasivo **no** sale del informe suelto. Sale de la **suscripción de monitoreo** (ingreso recurrente) y de **partners que revenden o integran** la API. Todo lo demás (consulta ad hoc, lote y diagnóstico) sirve para **conseguir clientes** y llevarlos a la suscripción.

## 2. Las cuatro formas de cobrar y para qué sirve cada una

| Modelo | Precio propuesto | Para qué sirve | Recurrente |
|---|---|---|---|
| **Gratis** | 3 consultas/mes con registro | Captar leads y obtener emails corporativos | — |
| **Ad hoc** | USD 12 por informe · Pack 25 = USD 199 · Pack 100 = USD 590 | Monetiza al que "sólo quiere ver un cliente". Créditos con vencimiento a 12 meses | No |
| **Por lote** | 1–500: USD 1,90 · 501–2.000: USD 1,20 · 2.001–10.000: USD 0,70 (por contraparte, escalonado) · mínimo USD 150 | El primer contacto con empresas medianas, que suben su Excel de clientes. **Incluye 30 días de alertas gratis** → los convierte a monitoreo | No |
| **Diagnóstico one-time** | USD 990 (hasta 1.000 contrapartes + informe ejecutivo + sesión 1:1) | Ticket alto, venta consultiva. **100% acreditable** si contratan monitoreo en 30 días | No |
| **Monitoreo continuo** | Esencial USD 149 · Profesional USD 449 · Corporativo USD 1.290 /mes · anual con 2 meses gratis | **El negocio.** MRR predecible, bajo costo marginal | **Sí** |
| **API / Partners** | Platform fee USD 299/mes + USD 0,25–0,40 por llamada, o revenue share 20–30% | Escala sin esfuerzo de ventas: ERPs, factoring, SGR, fintech, estudios contables | **Sí** |

### Por qué este escalonamiento
- **Precio por contraparte monitoreada** (no por usuario): el valor que percibe el cliente es proporcional a su cartera expuesta.
- **Precios en USD** cobrados en moneda local al tipo de cambio del día, para protegerte de la inflación en ARS. Medios: Stripe (BR/CL/internacional), Mercado Pago (AR/BR/CL), dLocal o Ebanx como alternativa regional.
- **Ancla de precio:** el plan Corporativo hace que el Profesional (el más elegido) parezca razonable.
- **Consultas ad hoc incluidas en cada plan**: elimina el motivo para "comprar sueltos" y empuja a suscribirse.

## 3. El embudo (cómo se convierte un lead en ingreso recurrente)

```
Landing + demo  →  Registro gratis (3 consultas)  →  Pack ad hoc / Lote
                                                       │
                                     30 días de alertas gratis sobre el lote
                                                       │
                                             Suscripción de monitoreo  →  Upgrade de plan / API
```

Disparadores de conversión:
1. Al terminar las 3 consultas gratis: "Monitoreá estas 3 empresas por USD 149/mes".
2. En el lote: el ranking muestra las 20 contrapartes más riesgosas; la alerta del día 30 dice "esta alerta se desactiva mañana".
3. Garantía: "si en 14 días no detectamos al menos una alerta relevante en tu cartera, no pagás". En una cartera de más de 100 clientes casi siempre aparece algo.

## 4. Números de referencia (escenario a 18–24 meses)

| Concepto | Supuesto |
|---|---|
| Ticket medio de suscripción | ~USD 350/mes (mezcla de planes) |
| 100 clientes suscriptos | ~USD 35.000 MRR · ~USD 420.000 ARR |
| Churn mensual objetivo | < 2,5 % (la vigilancia es "pegajosa": nadie apaga la alarma) |
| Costo de datos (AR) | Bajo: la API de Central de Deudores del BCRA es pública y gratuita |
| Costo de datos (BR/CL) | Medio-alto si licenciás bureaus (Serasa, Boa Vista, Equifax/DICOM). Arrancá con fuentes públicas y sumá bureaus como add-on premium con margen |
| Costo de IA por consulta | Centavos si cacheás resultados y re-scoreás sólo cuando cambia alguna fuente |
| Margen bruto objetivo | 75–85 % |

**Clave para que sea pasivo:** re-procesar sólo los deltas. Una contraparte no cambia todos los días; consultás BCRA/ARCA con la frecuencia del plan y corrés el modelo únicamente cuando cambia algún input. Así el costo marginal por contraparte monitoreada tiende a cero.

## 5. Canales que escalan sin vender uno a uno

1. **Estudios contables** (AR: miles de estudios con cartera pyme). Programa de referidos: 20 % recurrente de por vida o white-label "Monitor de riesgo by [Estudio]".
2. **ERPs y facturadores**: Tango, Bejerman, Colppy, Xubio, Contabilium (AR); Omie, Bling, Conta Azul (BR); Defontana, Bsale, Nubox (CL). Integración + marketplace de apps + revenue share.
3. **Factoring, SGR, ALyCs y fintech de crédito**: necesitan scorear librados y cedentes en volumen → API por llamada.
4. **Aseguradoras de crédito y cauciones**: preevaluación de tomadores.
5. **Contenido / SEO**: páginas tipo "¿Cómo consultar la situación BCRA de un CUIT?" y "Qué significa situación 3 en Central de Deudores" (búsquedas de alta intención en AR).
6. **LinkedIn outbound** a gerentes de créditos y cobranzas, CFOs y responsables de tesorería.

## 6. Roadmap de lanzamiento sugerido

| Fase | Duración | Objetivo |
|---|---|---|
| 0 · Validación | 4–6 semanas | Landing + programa de 50 clientes fundadores. Diagnósticos gratis a cambio de feedback. Meta: 10 empresas pagando |
| 1 · Argentina self-serve | 2–3 meses | BCRA + ARCA + cheques + Boletín Oficial. Checkout con Mercado Pago/Stripe. Alertas por email y WhatsApp |
| 2 · Brasil | +3 meses | CNPJ (Receita) + protestos + recuperação judicial. Landing en portugués |
| 3 · Chile + API pública | +3 meses | RUT/SII + Boletín Concursal. API documentada y programa de partners |

## 7. Aspectos legales y de confianza (no saltear)

- **Protección de datos:** Ley 25.326 (AR), LGPD (BR), Ley 19.628 y Ley 21.719 (CL). Revisá con un abogado si tu actividad encuadra como "archivo/banco de datos de información crediticia". En AR puede corresponder registro ante la AAIP.
- **Fuentes:** usá sólo fuentes públicas o licenciadas. Respetá los términos de uso de cada API y no hagas scraping de sitios que lo prohíban.
- **Disclaimer:** el score es una herramienta de apoyo a la decisión y no constituye asesoramiento financiero (ya está en el footer de la landing).
- **Explicabilidad:** mostrar por qué un score es el que es reduce reclamos y es un diferencial de venta frente a bureaus "caja negra".
- **Ética de marketing:** la landing no incluye testimonios ni logos de clientes inventados; usa el "Programa de clientes fundadores" hasta tener casos reales.

## 8. Próximos pasos concretos

1. Elegir nombre y dominio definitivos (Centinel es un placeholder: verificar disponibilidad de marca en INPI/INPI-BR/INAPI).
2. Conectar el formulario de la landing a Supabase/HubSpot (ver `TODO` en `index.html`).
3. Reemplazar la demo simulada por una llamada real a tu backend para Argentina (BCRA es el gancho más fuerte).
4. Configurar checkout: Mercado Pago (suscripciones) + Stripe.
5. Lanzar el programa de fundadores con 30–50 contactos directos de tu red.
