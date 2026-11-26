-- Consultas para las capturas de evidencia (ejecutar en la consola SQL de Turso)

-- 1) Conteo final de registros cargados por tabla
SELECT 'paises' AS tabla, COUNT(*) AS filas FROM paises
UNION ALL SELECT 'estados', COUNT(*) FROM estados
UNION ALL SELECT 'ciudades', COUNT(*) FROM ciudades
UNION ALL SELECT 'usuarios', COUNT(*) FROM usuarios
UNION ALL SELECT 'interacciones', COUNT(*) FROM interacciones
UNION ALL SELECT 'interaccion_etiqueta', COUNT(*) FROM interaccion_etiqueta;

-- 2) PRIVACIDAD: usuarios sin consentimiento que conservan algún dato geográfico (debe devolver 0)
SELECT COUNT(*) AS sin_consentimiento_con_datos_geo
FROM usuarios
WHERE consentimiento_datos = 'no'
  AND (id_ciudad IS NOT NULL OR latitud IS NOT NULL OR longitud IS NOT NULL);

-- 3) Muestra de usuarios sin consentimiento: sus campos de ubicación están vacíos
SELECT id_usuario, alias, consentimiento_datos, id_ciudad, latitud, longitud
FROM usuarios WHERE consentimiento_datos = 'no' LIMIT 5;

-- 4) Contraste: usuarios con consentimiento sí conservan ubicación (obtenida por JOIN con los catálogos)
SELECT u.id_usuario, u.consentimiento_datos, c.nombre AS ciudad, e.nombre AS estado, p.nombre AS pais
FROM usuarios u
JOIN ciudades c ON c.id_ciudad = u.id_ciudad
JOIN estados  e ON e.id_estado = c.id_estado
JOIN paises   p ON p.id_pais   = e.id_pais
WHERE u.consentimiento_datos = 'si' LIMIT 5;

-- 5) INTEGRIDAD: interacciones sin usuario en el padrón (debe devolver 0)
SELECT COUNT(*) AS interacciones_huerfanas
FROM interacciones i LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
WHERE u.id_usuario IS NULL;
