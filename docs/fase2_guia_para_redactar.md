# Fase 2 — Guía de datos, código y evidencias (para redactar TU documento)

> El PDF de la Fase 2 exige que las explicaciones estén en palabras propias y sin rastros de IA.
> Por eso esta guía NO trae párrafos listos: trae las cifras reales, dónde está cada cosa en el código
> y qué capturas tomar. La redacción la haces tú, y debes poder explicar cada línea del script.

## 0. Antes de empezar (requisito del profe)
La Fase 2 pide aplicar primero la retroalimentación de la Fase 1. Esto ya está aplicado en el proyecto:

| Cambio | Dónde |
|---|---|
| Ubicación en catálogos `paises > estados > ciudades` (3FN). `usuarios` guarda solo `id_ciudad` | `db/schema.sql`, `etl/clean.js` → `construirCatalogos()` |
| `interacciones` ya no repite país/estado/ciudad (se obtienen por JOIN) | `db/schema.sql`, `procesarInteracciones()` |
| Interacciones se mantienen en SQL (justificación en la Fase 1 y en la conversación con el profe) | — |
| Modelo actualizado para dbdiagram.io | `modelo_v2.dbml` |

Sugerencia: incluye en tu documento una sección corta, "Ajustes al modelo por la retroalimentación", con el
diagrama nuevo (pega `modelo_v2.dbml` en dbdiagram.io y exporta PNG).

## 1. Cifras reales de la corrida (salen de `data/clean/bitacora.json` y `resumen_calidad.md`)
**Vuelve a ejecutar y usa los números que imprima TU corrida; deben coincidir con tus capturas.**

| Dato | Valor |
|---|---|
| Usuarios recibidos / aceptados / rechazados | 1,068 / 1,068 / 0 |
| Interacciones recibidas / aceptadas / rechazadas | 1,000 / 207 / 793 |
| Duplicados eliminados (por id_usuario, alias, id_interaccion y por contenido) | 0 |
| Huérfanas aisladas en cuarentena (`usuario_inexistente`) | 793 (614 id_usuario distintos, U001071–U005997; el padrón llega a U001068) |
| Celdas vacías normalizadas a NULL en usuarios | 550 (275 latitud + 275 longitud) |
| Celdas vacías normalizadas a NULL en interacciones | 894 (texto 144, pais/estado/ciudad 519, etiquetas 231) |
| Usuarios sin consentimiento depurados | 171 (684 datos de ubicación eliminados: país, estado, ciudad y zona horaria de cada uno; sus coordenadas ya venían vacías) |
| Interacciones válidas de esos usuarios | 26 |
| Registros de cuarentena a los que se les borró ubicación (consentimiento no verificable) | 646 de 793 |
| Fechas de usuario estandarizadas | 2,136 (2 por usuario) |
| Pares interacción-etiqueta generados | 318 (en las 207 válidas) |
| Catálogos geográficos generados | 7 países, 21 estados, 21 ciudades |
| Valores geográficos redundantes descartados de interacciones | 543 |

Anomalías que puedes describir con tus palabras:
1. **Fechas con día y mes invertidos** en el `.xlsx` (636 texto dd/mm/aaaa y 432 celdas de fecha). Prueba: tras corregir, `ultima_actividad ≥ fecha_ingreso` en 100 % (sin corregir: 94.2 % y 26 fechas futuras). Script: `scripts/xlsx_a_csv.py`. *Si tu profe te entregó CSV reales, comprueba si te aplica; si trabajaste desde el xlsx, sí.*
2. **793 interacciones huérfanas** (79.3 %).
3. **Texto vacío en 144 interacciones**, que coinciden con las de tipo `reaccion`; pero en esas 144 `longitud_texto` es mayor que 0 (inconsistencia del origen).
4. **Ubicación redundante**: la ubicación de la interacción era copia exacta de la del usuario (181/181) y ciudad→estado→país→zona horaria era una dependencia transitiva (solo 21 combinaciones en 1,068 usuarios).
5. **`estatus` derivado**: activo 0–14 días sin actividad, en riesgo 15–60, inactivo 61+.

## 2. Las 8 etapas → dónde están en el código
| # | Etapa | Archivo / función | Idea clave para tu explicación |
|---|---|---|---|
| 1 | Duplicados | `clean.js` → `procesarUsuarios` (`aceptados`, `ctx.aliasVistos`), `procesarInteracciones` (`ids`, `huellas`) | Criterios: id_usuario, alias (sin distinguir mayúsculas), id_interaccion y huella de contenido. El duplicado va a cuarentena con su motivo. |
| 2 | Vacíos y nulos | `nul()`, `NULOS`, `texto()` | Una sola función decide qué es "nulo" (vacío, nan, null, n/a…). |
| 3 | Estandarización | `parseFecha()`, `parseTimestamp()`, `enCatalogo()`, separación de `etiquetas` | Fechas aaaa-mm-dd, timestamps ISO en UTC, categorías a su forma canónica, etiquetas a minúscula/sin repetir en tabla puente. |
| 4 | Validación de tipos | `entero()`, `numero()` y las validaciones de rango en ambas funciones | Entero, decimal, booleano 0/1, fechas reales y catálogos; si falla, cuarentena con motivo. |
| 5 | Referencias | `procesarInteracciones` → `usuarios.get(i.id_usuario)` | Solo se aceptan interacciones cuyo usuario fue aceptado; el resto, `usuario_inexistente`. |
| 6 | Privacidad | `procesarUsuarios` (bloque consentimiento), `construirCatalogos()`, `ctx.rechazar()` | Sin consentimiento: id_ciudad, latitud y longitud en NULL; el catálogo se alimenta solo de usuarios que consintieron; en cuarentena también se borra la ubicación. |
| 7 | Archivos depurados | `main()` | Escribe `data/clean/*.csv`, `cuarentena.jsonl`, `bitacora.json`, `resumen_calidad.md`. |
| 8 | Carga | `etl/load.js` | Orden por dependencias (catálogos → usuarios → interacciones → etiquetas), `upsert` repetible, cuarentena y bitácora a Firestore. |

**Bloques de código sugeridos para citar** (breves y sin credenciales): `nul()`; `parseFecha()`; el bloque de privacidad en
`procesarUsuarios`; la verificación de referencia en `procesarInteracciones`; `upsert()` de `load.js`.
Nunca pegues el `.env` ni la cadena de conexión.

## 3. Preparación de la nube (una sola vez)
**Turso** (la interfaz puede cambiar un poco):
1. Crea cuenta en turso.tech y una base de datos nueva (p. ej. `community360`).
2. Copia la URL (`libsql://…`) y genera un token de acceso para esa base.

**Firebase**:
1. En console.firebase.google.com crea un proyecto y activa **Firestore Database** (elige una ubicación).
2. Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada" (baja un `.json`).
3. Para ponerlo en una sola línea: `node -e "console.log(JSON.stringify(require('./clave.json')))"` y pega el resultado **entre comillas simples** en `.env`.
4. Borra o guarda fuera del repositorio el `.json`.

**Proyecto**:
```
cp .env.example .env      # completa TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON
npm install
npm test                  # 10 pruebas
npm run etl:clean         # etapas 1-7
npm run etl:load          # etapa 8
node etl/verificar.js     # conteos y comprobación de privacidad en la nube
```
Importante: `etl/load.js` imprime `PRAGMA foreign_keys`; debe ser 1.

## 4. Checklist de capturas (deben ser legibles; tapa token y claves)
- [ ] `npm test` con las pruebas en verde.
- [ ] `npm run etl:clean` mostrando los conteos y `ls data/clean` con los archivos generados.
- [ ] `npm run etl:load` terminando sin errores (conteos de Turso y Firestore).
- [ ] Panel de Turso: las 7 tablas creadas (`paises`, `estados`, `ciudades`, `usuarios`, `interacciones`, `interaccion_etiqueta`, `usuarios_auth`).
- [ ] Consulta 1 de `db/consultas_evidencia.sql` (conteo por tabla).
- [ ] Consulta 2 (usuarios sin consentimiento con datos geográficos = **0**) y consulta 3 (muestra con campos vacíos).
- [ ] Consulta 5 (interacciones huérfanas = 0).
- [ ] Panel de Firestore: colecciones `cuarentena` y `bitacora_etl`; salida de `node etl/verificar.js` con el conteo de documentos (793 y 1).

## 5. Estructura que pide el profe (usa exactamente estos apartados)
1. Portada (misma de la Fase 1, con el título de la Fase 2).
2. Auditoría de calidad y reglas de limpieza aplicadas (sección 1 de esta guía).
3. Documentación del script (las 8 etapas, sección 2) + el subapartado de ajustes al modelo.
4. Evidencia de ejecución y carga (sección 4).
5. Referencias (si citas algo).
Nombre del archivo: `PROY_U3_Fase2_LEY_CESAR.pdf`.
