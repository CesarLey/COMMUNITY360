-- COMMUNITY 360 - Esquema relacional NORMALIZADO (3FN) para Turso (libSQL / SQLite)
-- Cambios respecto a la Fase 1 (retroalimentación del docente):
--   * La ubicación se separa en catálogos paises > estados > ciudades (elimina la dependencia transitiva
--     ciudad -> estado -> país y ciudad -> zona_horaria).
--   * usuarios guarda solo id_ciudad (FK). Sin consentimiento: id_ciudad, latitud y longitud = NULL.
--   * interacciones ya no repite país/estado/ciudad (se obtienen por JOIN con usuarios).
-- Las fechas se guardan como TEXT ISO-8601 (SQLite no tiene tipo DATE).
-- Verifica que las llaves foráneas estén activas:  PRAGMA foreign_keys;  (debe devolver 1)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paises (
  id_pais  INTEGER PRIMARY KEY,
  nombre   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estados (
  id_estado INTEGER PRIMARY KEY,
  nombre    TEXT NOT NULL,
  id_pais   INTEGER NOT NULL REFERENCES paises(id_pais) ON DELETE RESTRICT,
  UNIQUE (id_pais, nombre)
);

CREATE TABLE IF NOT EXISTS ciudades (
  id_ciudad    INTEGER PRIMARY KEY,
  nombre       TEXT NOT NULL,
  id_estado    INTEGER NOT NULL REFERENCES estados(id_estado) ON DELETE RESTRICT,
  zona_horaria TEXT NOT NULL,
  UNIQUE (id_estado, nombre)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario            TEXT PRIMARY KEY CHECK (id_usuario GLOB 'U[0-9][0-9][0-9][0-9][0-9][0-9]'),
  alias                 TEXT NOT NULL UNIQUE,
  fecha_ingreso         TEXT NOT NULL,                       -- aaaa-mm-dd
  id_ciudad             INTEGER REFERENCES ciudades(id_ciudad) ON DELETE RESTRICT,   -- NULL si consentimiento_datos = 'no'
  latitud               REAL CHECK (latitud  BETWEEN -90  AND 90),                   -- NULL si consentimiento_datos = 'no'
  longitud              REAL CHECK (longitud BETWEEN -180 AND 180),                  -- NULL si consentimiento_datos = 'no'
  rango_edad            TEXT NOT NULL,
  especie_fursona       TEXT NOT NULL,
  interes_principal     TEXT NOT NULL,
  plataforma_principal  TEXT NOT NULL,
  es_artista            INTEGER NOT NULL CHECK (es_artista IN (0,1)),
  mensajes_30d          INTEGER NOT NULL CHECK (mensajes_30d >= 0),
  reacciones_30d        INTEGER NOT NULL CHECK (reacciones_30d >= 0),
  eventos_asistidos     INTEGER NOT NULL CHECK (eventos_asistidos >= 0),
  comisiones_compradas  INTEGER NOT NULL CHECK (comisiones_compradas >= 0),
  sentimiento_promedio  REAL    NOT NULL CHECK (sentimiento_promedio BETWEEN -1 AND 1),
  ultima_actividad      TEXT NOT NULL,                       -- aaaa-mm-dd
  estatus               TEXT NOT NULL CHECK (estatus IN ('activo','en_riesgo','inactivo')),
  consentimiento_datos  TEXT NOT NULL CHECK (consentimiento_datos IN ('si','no')),
  -- privacidad garantizada por el motor: sin consentimiento no puede existir ubicación
  CHECK (consentimiento_datos = 'si' OR (id_ciudad IS NULL AND latitud IS NULL AND longitud IS NULL)),
  CHECK (ultima_actividad >= fecha_ingreso)
);

CREATE TABLE IF NOT EXISTS interacciones (
  id_interaccion        TEXT PRIMARY KEY CHECK (id_interaccion GLOB 'I[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  id_usuario            TEXT NOT NULL REFERENCES usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  timestamp             TEXT NOT NULL,                       -- aaaa-mm-ddThh:mm:ssZ (UTC)
  canal                 TEXT NOT NULL CHECK (canal IN ('Telegram','Facebook','Instagram','TikTok','Twitter/X','Discord')),
  tipo                  TEXT NOT NULL CHECK (tipo  IN ('mensaje','comentario','reaccion','respuesta_encuesta','rsvp_evento')),
  texto                 TEXT,
  tema                  TEXT NOT NULL CHECK (tema IN ('arte_comisiones','reglas_moderacion','eventos_convenciones',
                                                      'videojuegos','memes_humor','fursuits','seguridad_privacidad','musica')),
  sentimiento           REAL NOT NULL CHECK (sentimiento BETWEEN -1 AND 1),
  idioma                TEXT,
  dispositivo           TEXT,
  longitud_texto        INTEGER NOT NULL CHECK (longitud_texto >= 0),
  reacciones_recibidas  INTEGER NOT NULL CHECK (reacciones_recibidas >= 0)
);

-- Atributo multivaluado "etiquetas" (a|b|c) normalizado en tabla puente
CREATE TABLE IF NOT EXISTS interaccion_etiqueta (
  id_interaccion TEXT NOT NULL REFERENCES interacciones(id_interaccion) ON DELETE CASCADE,
  etiqueta       TEXT NOT NULL,
  PRIMARY KEY (id_interaccion, etiqueta)
);

-- Credenciales del dashboard (Fase 3). Solo hash, nunca contraseña en texto plano.
CREATE TABLE IF NOT EXISTS usuarios_auth (
  id_auth        INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  email          TEXT,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'analista' CHECK (rol IN ('admin','analista')),
  creado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_inter_usuario    ON interacciones(id_usuario);
CREATE INDEX IF NOT EXISTS idx_inter_ts         ON interacciones(timestamp);
CREATE INDEX IF NOT EXISTS idx_inter_canal_tema ON interacciones(canal, tema);
CREATE INDEX IF NOT EXISTS idx_usuarios_estatus ON usuarios(estatus);
CREATE INDEX IF NOT EXISTS idx_usuarios_ciudad  ON usuarios(id_ciudad);
