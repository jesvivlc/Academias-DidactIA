# Benchmark competitivo — software de gestión para academias

> Investigación de campo del **21 de julio de 2026** sobre las webs públicas de
> Kydemy, AcademyGest y Acadesoft. De aquí salen las Fases 8–13 del producto y
> el posicionamiento de precio de la landing.
> Los precios son los publicados por cada competidor en esa fecha; conviene
> revisarlos antes de usarlos en material comercial.

## 1. Precios

| | Modelo | Cifras publicadas |
|---|---|---|
| **Kydemy** | Tramos por alumnos activos | S 40 €/m (0-100) · M 70 €/m (101-250) · L 120 €/m (251-400) · XL 225 €/m (401+). Anual = 10 meses (400/700/1200/2250 €). Sin IVA. |
| **Kydemy — extras** | Upsell modular | App propia 700 €/año (o 300 € alta + 60 €/m) · App QR asistencia 35 €/m · Módulo evaluaciones 15 €/m · +100 GB 9 €/m · Comisión pagos online 1,5 % + 0,25 € |
| **AcademyGest** | Plano, low-cost | Gestión académica desde 30 €/m (alumnos y cursos ilimitados) + Campus Virtual 25 €/m con 15 € de alta |
| **Acadesoft** | Plano, "todo incluido" | ~99 €/m (dato de Capterra; no publican precio en su web). Sin prueba gratuita. Usuarios, alumnos y almacenamiento ilimitados. Vía Kit Digital: 2.000 € = 1 año / 3.000 € = 1,5 años / 6.000 € = 3 años (convocatorias agotadas) |

**Estándar comercial del sector (Kydemy):** 14 días de prueba con todo
desbloqueado · 60 días de garantía de devolución · sin permanencia ni cuota de
alta · cancelación con 5 días de aviso. Acadesoft ni siquiera ofrece prueba:
exige pasar por un comercial. Ese es el hueco que explota nuestro autoservicio.

## 2. Funcionalidades

| | Kydemy | AcademyGest | Acadesoft | DidactIA (tras Fases 8–13) |
|---|:--:|:--:|:--:|:--:|
| Alumnos, grupos, horarios, asistencia | ✅ | ✅ | ✅ | ✅ |
| Notas / evaluaciones | ✅ (add-on 15 €) | ✅ | ✅ | ✅ |
| Portal de familias | ✅ | — | ✅ | ✅ |
| Cobros / impagos | ✅ | ✅ | ✅ | ✅ |
| Comunicaciones email | ✅ | SMS | ✅ | ✅ |
| Facturación + Verifactu/AEAT | ✅ (Q1 2026) | ✅ | ✅ | ✅ Fase 8 |
| Domiciliación SEPA / remesas | ✅ | ✅ (C19) | ✅ | ✅ Fase 8 |
| Pasarela de pago online | ✅ | ✅ | — | ✅ Fase 12 |
| Inscripciones online / pre-registro | ✅ | ✅ | — | ✅ Fase 9 |
| CRM de leads y clases de prueba | parcial | — | ✅ | ✅ Fase 9 |
| Firma digital de autorizaciones | ✅ | — | ✅ | ✅ Fase 10 |
| Check-in QR | ✅ (35 €/m) | — | — | ✅ Fase 11 |
| Campus virtual / contenidos | ✅ | ✅ (25 €/m) | ✅ | ✅ Fase 13 |
| Gastos y cuenta de resultados | ✅ | ✅ | ✅ | ✅ Fase 13 |
| Control horario del profesorado | — | ✅ | ✅ | ✅ Fase 13 |
| App móvil nativa | ✅ (700 €/año) | — | — | ❌ (PWA pendiente) |
| **IA (copiloto, tutor, predicción de bajas)** | ❌ | ❌ | ❌ | ✅ |
| **Panel del negocio / health score** | ❌ | ❌ | informes | ✅ |

## 3. Posicionamiento

Dos conclusiones que sostienen todo lo demás:

1. **Ninguno de los tres tiene IA.** Ese es el foso: copiloto de dirección ⌘K,
   tutor del alumno, predicción de bajas, boletines y marketing generados.
2. **Nuestra deuda eran las piezas aburridas pero obligatorias** del negocio
   español (Verifactu, SEPA, cobro online, firma). Sin ellas no se podía vender
   por mucha IA que hubiera. Las Fases 8–13 las cierran.

De ahí la promesa comercial: *todo incluido, sin módulos aparte, con la IA
dentro* — precisamente lo contrario del modelo de add-ons de Kydemy, y lo que
más elogian los usuarios de Acadesoft en sus reseñas.

**Precios propios (implementados en `precios.html`):** Esencial 39 €/m (≤100
alumnos) · Academia 79 €/m (≤300) · Pro 139 €/m (≤600) · A medida (600+).
Anual = 10 meses. Los cuatro planes llevan **todas** las funcionalidades: el
plan solo cambia el límite de alumnos y el nivel de acompañamiento.

## 4. Go-to-market

- **Landings verticales.** Los tres las usan y es puro SEO. Kydemy domina
  baile/música/yoga; el nicho de refuerzo escolar y oposiciones está menos
  saturado. Implementadas: `academias-refuerzo-escolar.html`,
  `academias-idiomas.html`, `academias-oposiciones.html`,
  `academias-musica-danza.html`.
- **Directorios de software.** Acadesoft saca visibilidad de 9 reseñas en
  Capterra. Canal barato donde no estamos. Pendiente.
- **Kit Digital.** Acadesoft lo explota como vía de financiación
  ("Gestión de Procesos", 2.000-6.000 €). Ahora mismo sin convocatorias
  abiertas, pero conviene tenerlo mapeado.
- **Urgencia legal Verifactu.** Obligatorio en enero 2027 (empresas) y julio
  2027 (autónomos). Es *la* razón por la que una academia cambia de software
  en 2026: el argumento de venta más fuerte que tenemos ahora mismo.
- **Riesgo a vigilar.** Los tres presumen de soporte telefónico personalizado.
  En este sector (dueños de academia, poco técnicos) el soporte pesa tanto
  como el producto.

## Fuentes

- https://www.kydemy.com/ · `/precios/` · `/caracteristicas/` · `/app-qr/` · `/inscripciones-online/` · `/facturacion-electronica-verifactu/`
- https://academygest.com/
- https://www.acadesoft.com/es · `/es/53/kit-digital`
- https://www.capterra.com/p/10001914/Acadesoft/ (precio de partida y reseñas)
