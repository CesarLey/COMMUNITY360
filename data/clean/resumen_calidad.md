# Resumen de calidad de datos — corrida run_20261120065558

## Conteos (bitácora)
| Entidad | Recibidos | Aceptados | Rechazados (cuarentena) |
|---|---|---|---|
| Usuarios | 1068 | 1068 | 0 |
| Interacciones | 1000 | 207 | 793 |

Etiquetas generadas (tabla puente): 318

### Motivos de rechazo — interacciones
| Motivo | Registros |
|---|---|
| usuario_inexistente | 793 |

### Motivos de rechazo — usuarios
| Motivo | Registros |
|---|---|
| (ninguno) | 0 |

## Antes vs después
| Indicador | Antes | Después |
|---|---|---|
| Usuarios duplicados por id | 0 | 0 |
| Interacciones duplicadas por id | 0 | 0 |
| Interacciones con usuario inexistente | 793 | 0 |
| Fechas de usuario en dd/mm/aaaa (CSV recibido) | 1068 | 0 (todas aaaa-mm-dd) |
| Usuarios sin consentimiento con datos geográficos | 171 de 171 | 0 |
| Celdas nulas/vacías en usuarios | 550 | 721 (incluye geografía eliminada por privacidad) |
| Celdas nulas/vacías en interacciones | 894 | 33 |

> Nota sobre fechas: el .xlsx original mezclaba 636 fechas como texto dd/mm/aaaa y 432 como celdas de fecha con día y mes invertidos por Excel. scripts/xlsx_a_csv.py las restaura antes de este proceso; después, ninguna fila viola ultima_actividad ≥ fecha_ingreso.
> Nota sobre nulos: en usuarios aumentan porque se elimina la geografía de quienes no dan consentimiento; en interacciones disminuyen porque los registros en cuarentena salen del conjunto aceptado.

Transformaciones: 2136 fechas estandarizadas · 684 datos de ubicación eliminados de usuarios sin consentimiento · 543 valores geográficos redundantes descartados de interacciones (la ubicación se obtiene por JOIN).

Catálogos geográficos generados (3FN): 7 países · 21 estados · 21 ciudades.

## Ejemplo de registro anonimizado (usuario sin consentimiento)
**Antes**
```json
{
  "id_usuario": "U000004",
  "alias": "AshCh'a30",
  "pais": "México",
  "estado": "Nuevo León",
  "ciudad": "Monterrey",
  "latitud": "",
  "longitud": "",
  "zona_horaria": "America/Monterrey",
  "consentimiento_datos": "no"
}
```
**Después**
```json
{
  "id_usuario": "U000004",
  "alias": "AshCh'a30",
  "id_ciudad": null,
  "latitud": null,
  "longitud": null,
  "consentimiento_datos": "no"
}
```
