# COMMUNITY 360 — Fases 1 y 2

## Requisitos
Node.js 18+ (probado en 22) y Python 3 con pandas (solo para convertir los .xlsx).

## Pasos
1. `python3 scripts/xlsx_a_csv.py <usuarios.xlsx> <interacciones.xlsx> data/raw`  (ya hecho; deja los CSV en `data/raw`)
2. `node etl/clean.js`      → genera `data/clean/*` (CSV depurados, catálogos geográficos, cuarentena, bitácora, resumen de calidad). Sin dependencias.
3. `npm install`
4. Copia `.env.example` a `.env` y completa credenciales de Turso y Firebase (nunca las subas al repositorio).
5. `node etl/load.js`       → crea el esquema en Turso, carga datos y escribe cuarentena/bitácora en Firestore. Es idempotente.
6. `node etl/verificar.js`  → conteos en Turso y Firestore y comprobación de privacidad en la nube.
7. `npm test`               → pruebas unitarias del proceso de limpieza (10).

## Estructura
- `etl/clean.js` limpieza, validación, privacidad, cuarentena y bitácora
- `etl/load.js` carga a Turso y Firestore
- `db/schema.sql` esquema relacional normalizado (3FN) con restricciones; `db/consultas_evidencia.sql` consultas para capturas
- `modelo_v2.dbml` modelo normalizado para dbdiagram.io
- `docs/fase1_modelado.md` diccionario, ER, comparativa SQL vs NoSQL y justificación
- `data/clean/resumen_calidad.md` calidad antes/después y ejemplo anonimizado

- `docs/fase2_guia_para_redactar.md` cifras reales, mapa del código y checklist de evidencias de la Fase 2

> El modelo evolucionó respecto a la Fase 1: la ubicación se normalizó en catálogos y se quitó de `interacciones`
> (retroalimentación del docente). `docs/fase1_modelado.md` conserva el modelo original entregado.
