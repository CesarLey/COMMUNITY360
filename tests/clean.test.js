'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseFecha, parseTimestamp, parseCSV, ejecutar } = require('../etl/clean');

const U = (o = {}) => ({ id_usuario: 'U000001', alias: 'A', fecha_ingreso: '21/04/2026', pais: 'México', estado: 'Yucatán', ciudad: 'Mérida',
  latitud: '20.9', longitud: '-89.6', zona_horaria: 'America/Merida', rango_edad: '18-24', especie_fursona: 'Lobo', interes_principal: 'Cómics',
  plataforma_principal: 'Discord', es_artista: '1', mensajes_30d: '4', reacciones_30d: '2', eventos_asistidos: '0', comisiones_compradas: '0',
  sentimiento_promedio: '0.3', ultima_actividad: '2026-05-01', estatus: 'activo', consentimiento_datos: 'si', ...o });
const I = (o = {}) => ({ id_interaccion: 'I0000001', id_usuario: 'U000001', timestamp: '2026-10-28T16:59:03Z', canal: 'Discord', tipo: 'mensaje',
  texto: 'hola', tema: 'musica', sentimiento: '0.5', idioma: 'es', pais: 'México', estado: 'Yucatán', ciudad: 'Mérida', dispositivo: 'Web',
  longitud_texto: '4', reacciones_recibidas: '0', etiquetas: 'Arte|arte|humor', ...o });
const run = (u, i) => ejecutar({ rawUsuarios: u, rawInteracciones: i, runId: 't' });

test('fechas dd/mm/aaaa e ISO se estandarizan', () => {
  assert.strictEqual(parseFecha('21/04/2026'), '2026-04-21');
  assert.strictEqual(parseFecha('2026-11-10 00:00:00'), '2026-11-10');
  assert.strictEqual(parseFecha('31/02/2026'), null);
  assert.strictEqual(parseTimestamp('2026-10-28T16:59:03Z'), '2026-10-28T16:59:03Z');
});
test('CSV con comillas y comas', () => {
  assert.deepStrictEqual(parseCSV('a,b\n"x,y","say ""hi"""\n'), [{ a: 'x,y', b: 'say "hi"' }]);
});
test('sin consentimiento se elimina toda la ubicación del usuario (id_ciudad, latitud, longitud)', () => {
  const r = run([U({ consentimiento_datos: 'no' })], [I()]);
  const u = r.usuarios[0];
  assert.strictEqual(u.id_ciudad, null);
  assert.strictEqual(u.latitud, null);
  assert.strictEqual(u.longitud, null);
  assert.strictEqual(r.catalogos.ciudades.length, 0, 'el catálogo no se alimenta de usuarios sin consentimiento');
});
test('con consentimiento se conserva la ubicación mediante catálogos (3FN)', () => {
  const r = run([U()], [I()]);
  assert.deepStrictEqual(r.catalogos.paises.map((x) => x.nombre), ['México']);
  assert.deepStrictEqual(r.catalogos.estados.map((x) => x.nombre), ['Yucatán']);
  assert.strictEqual(r.catalogos.ciudades[0].nombre, 'Mérida');
  assert.strictEqual(r.catalogos.ciudades[0].zona_horaria, 'America/Merida');
  assert.strictEqual(r.usuarios[0].id_ciudad, r.catalogos.ciudades[0].id_ciudad);
});
test('las interacciones aceptadas ya no llevan columnas geográficas', () => {
  const r = run([U()], [I()]);
  ['pais', 'estado', 'ciudad'].forEach((c) => assert.ok(!(c in r.interacciones[0])));
});
test('ubicación incompleta o zona horaria inconsistente se rechaza', () => {
  const r = run([U({ ciudad: '' }), U({ id_usuario: 'U000002', alias: 'B', zona_horaria: 'America/Cancun' }), U({ id_usuario: 'U000003', alias: 'C' })], []);
  assert.deepStrictEqual(r.rechazados.map((x) => x.motivo).sort(), ['ubicacion_incompleta', 'ubicacion_inconsistente']);
  assert.strictEqual(r.usuarios.length, 1);
});
test('usuario inexistente -> cuarentena (no se pierde) y sin geografía', () => {
  const r = run([U()], [I({ id_usuario: 'U009999' })]);
  assert.strictEqual(r.interacciones.length, 0);
  assert.strictEqual(r.rechazados.length, 1);
  assert.strictEqual(r.rechazados[0].motivo, 'usuario_inexistente');
  assert.strictEqual(r.rechazados[0].payload.ciudad, null);
  assert.ok(r.bitacora.verificacion.cuadra_interacciones);
});
test('duplicados por id se rechazan y se documentan', () => {
  const r = run([U(), U()], [I(), I()]);
  assert.strictEqual(r.usuarios.length, 1);
  assert.strictEqual(r.interacciones.length, 1);
  assert.deepStrictEqual(r.rechazados.map((x) => x.motivo).sort(), ['duplicado_id_interaccion', 'duplicado_id_usuario']);
});
test('etiquetas multivaluadas se normalizan y deduplican', () => {
  const r = run([U()], [I()]);
  assert.deepStrictEqual(r.etiquetas.map((e) => e.etiqueta).sort(), ['arte', 'humor']);
});
test('valores fuera de rango o catálogo se rechazan', () => {
  const r = run([U()], [I({ sentimiento: '3' }), I({ id_interaccion: 'I0000002', canal: 'MySpace' })]);
  assert.strictEqual(r.interacciones.length, 0);
  assert.strictEqual(r.rechazados.length, 2);
});
