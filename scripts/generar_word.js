'use strict';
/**
 * Generador del reporte final en Word (.docx) — Community 360
 * Formato APA 7.ª edición (trabajo estudiantil):
 *  - Times New Roman 12 pt, interlineado doble (480 twips), márgenes de 2.54 cm (1440 twips)
 *  - Sangría de primera línea (1.27 cm) en párrafos de cuerpo y sangría francesa en referencias
 *  - Tablas estilo APA 7 (solo filetes horizontales) y marcadores de figuras numeradas
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Header,
  PageNumber
} = require('docx');

const FONT = 'Times New Roman';
const TEXT_COLOR = '000000';
const MUTED_COLOR = '475569';
const BORDER_COLOR = '94A3B8';

function parrafo(runsOrText, opts = {}) {
  const {
    align = AlignmentType.LEFT,
    indentFirstLine = true,
    hanging = false,
    spaceBefore = 0,
    spaceAfter = 160,
    line = 480 // doble espacio APA 7
  } = opts;

  const runs = Array.isArray(runsOrText)
    ? runsOrText.map(
        (r) =>
          new TextRun({
            text: r.text,
            bold: Boolean(r.bold),
            italic: Boolean(r.italic),
            font: r.font || FONT,
            size: r.size || 24,
            color: r.color || TEXT_COLOR
          })
      )
    : [
        new TextRun({
          text: String(runsOrText),
          bold: Boolean(opts.bold),
          italic: Boolean(opts.italic),
          font: FONT,
          size: opts.size || 24,
          color: opts.color || TEXT_COLOR
        })
      ];

  let indent;
  if (hanging) {
    indent = { left: 720, hanging: 720 };
  } else if (indentFirstLine) {
    indent = { firstLine: 720 };
  }

  return new Paragraph({
    alignment: align,
    indent,
    spacing: { before: spaceBefore, after: spaceAfter, line },
    children: runs
  });
}

// Nivel 1 APA 7: Centrado, Negrita, 12 pt
function titulo1(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 320, after: 160, line: 480 },
    children: [
      new TextRun({
        text: texto,
        bold: true,
        font: FONT,
        size: 24,
        color: TEXT_COLOR
      })
    ]
  });
}

// Nivel 2 APA 7: Alineado a la izquierda, Negrita, 12 pt
function titulo2(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.LEFT,
    spacing: { before: 260, after: 120, line: 480 },
    children: [
      new TextRun({
        text: texto,
        bold: true,
        font: FONT,
        size: 24,
        color: TEXT_COLOR
      })
    ]
  });
}

// Nivel 3 APA 7: Alineado a la izquierda, Negrita Cursiva, 12 pt
function titulo3(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 100, line: 480 },
    children: [
      new TextRun({
        text: texto,
        bold: true,
        italic: true,
        font: FONT,
        size: 24,
        color: TEXT_COLOR
      })
    ]
  });
}

function vineta(tituloItem, cuerpo) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720, hanging: 360 },
    spacing: { before: 40, after: 120, line: 480 },
    children: [
      new TextRun({ text: '•  ', bold: true, font: FONT, size: 24 }),
      new TextRun({ text: `${tituloItem}: `, bold: true, font: FONT, size: 24 }),
      new TextRun({ text: cuerpo, font: FONT, size: 24 })
    ]
  });
}

function encabezadoTablaAPA(numero, tituloCursiva) {
  return [
    parrafo(numero, { bold: true, indentFirstLine: false, spaceBefore: 200, spaceAfter: 40, line: 360 }),
    parrafo(tituloCursiva, { italic: true, indentFirstLine: false, spaceBefore: 0, spaceAfter: 120, line: 360 })
  ];
}

function celdaAPA(texto, opts = {}) {
  const { isHeader = false, isLastRow = false, bold = false, width = 2500, align = AlignmentType.LEFT } = opts;
  const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bordeFino = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    borders: {
      top: isHeader ? bordeFino : sinBorde,
      bottom: isHeader || isLastRow ? bordeFino : sinBorde,
      left: sinBorde,
      right: sinBorde
    },
    children: [
      new Paragraph({
        alignment: isHeader ? AlignmentType.LEFT : align,
        spacing: { before: 20, after: 20, line: 280 },
        children: [
          new TextRun({
            text: String(texto),
            bold: isHeader || bold,
            font: FONT,
            size: 20, // 10 pt permitido en tablas APA 7 para legibilidad
            color: TEXT_COLOR
          })
        ]
      })
    ]
  });
}

function bloqueFiguraAPA(numFigura, tituloFigura, instruccionCaptura, notaFuncional) {
  const bordePunteado = { style: BorderStyle.DASHED, size: 6, color: BORDER_COLOR };
  return [
    parrafo(`Figura ${numFigura}`, {
      bold: true,
      indentFirstLine: false,
      spaceBefore: 240,
      spaceAfter: 40,
      line: 360
    }),
    parrafo(tituloFigura, {
      italic: true,
      indentFirstLine: false,
      spaceBefore: 0,
      spaceAfter: 100,
      line: 360
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 360, bottom: 360, left: 240, right: 240 },
              shading: { fill: 'F8FAFC' },
              borders: {
                top: bordePunteado,
                bottom: bordePunteado,
                left: bordePunteado,
                right: bordePunteado
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 60, after: 60, line: 320 },
                  children: [
                    new TextRun({
                      text: `[ Insertar aquí captura: ${instruccionCaptura} ]`,
                      italic: true,
                      font: FONT,
                      size: 21,
                      color: MUTED_COLOR
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }),
    parrafo(
      [
        { text: 'Nota. ', italic: true },
        { text: notaFuncional }
      ],
      { indentFirstLine: false, spaceBefore: 100, spaceAfter: 200, size: 22, line: 360 }
    )
  ];
}

async function generarDocumento() {
  const endpointsData = [
    ['POST', '/api/auth/login', 'Valida usuario o correo contra el hash bcrypt en Turso y emite token JWT de 8 horas.', 'Autentica el acceso desde la vista /login y desde Postman.'],
    ['POST', '/api/auth/logout', 'Limpia la cookie de sesión activa del navegador.', 'Ejecutado al cerrar sesión desde la barra lateral del panel.'],
    ['GET', '/api/auth/me', 'Devuelve los datos y el rol del usuario autenticado a partir del JWT.', 'Verifica sesión vigente en rutas protegidas.'],
    ['GET', '/api/interacciones', 'Consulta interacciones paginadas con filtros (canal, tema, tipo) y calcula métricas del segmento.', 'Alimenta la tabla paginada y las 3 tarjetas superiores del módulo Interacciones.'],
    ['GET', '/api/interacciones/:id', 'Recupera el detalle de una interacción junto con el alias del autor y sus etiquetas.', 'Consulta puntual de registros desde cliente HTTP.'],
    ['POST', '/api/interacciones', 'Inserta una nueva interacción validando catálogos e integridad referencial del usuario.', 'Se ejecuta desde Postman y dispara el evento INTERACCION_CREADA por WebSocket.'],
    ['PUT', '/api/interacciones/:id', 'Modifica campos permitidos y reemplaza etiquetas asociadas en Turso.', 'Se ejecuta desde Postman y transmite INTERACCION_ACTUALIZADA en vivo.'],
    ['DELETE', '/api/interacciones/:id', 'Elimina la interacción y sus etiquetas vinculadas en la tabla puente.', 'Se ejecuta desde Postman y notifica INTERACCION_ELIMINADA al panel.'],
    ['GET', '/api/metricas/kpis', 'Obtiene total de usuarios, miembros en riesgo, interacciones totales y sentimiento global.', 'Carga inicial de las cuatro tarjetas del apartado Resumen general.'],
    ['GET', '/api/metricas/por-canal', 'Agrupa volumen de publicaciones y sentimiento medio por red social.', 'Construye la gráfica de barras horizontales por plataforma.'],
    ['GET', '/api/metricas/mapa-calor', 'Cruza ocurrencias entre los 6 canales y las 8 categorías temáticas.', 'Puebla la matriz de interés Canal × Tema del Resumen general.'],
    ['GET', '/api/metricas/sentimiento-tiempo', 'Calcula el promedio diario de sentimiento y el volumen de publicaciones por fecha.', 'Alimenta la gráfica combinada de línea y barras de evolución histórica.'],
    ['GET', '/api/metricas/geografia', 'Agrupa miembros por país y ciudades principales filtrando consentimiento_datos = "si".', 'Genera la gráfica de dona y el listado urbano en Comunidad y riesgo.'],
    ['GET', '/api/metricas/usuarios-en-riesgo', 'Filtra y pagina miembros en riesgo por canal principal y prioridad, calculando promedios del grupo.', 'Alimenta la tabla paginada y los filtros del apartado Comunidad y riesgo.'],
    ['GET', '/api/metricas/mapa-geografico', 'Entrega las 793 coordenadas autorizadas, los 21 nodos urbanos y la configuración de teselas MapTiler.', 'Renderiza el mapa de calor geográfico interactivo en /dashboard/mapa.']
  ];

  const filasEndpoints = [
    new TableRow({
      tableHeader: true,
      children: [
        celdaAPA('Método', { isHeader: true, width: 1000 }),
        celdaAPA('Ruta', { isHeader: true, width: 2550 }),
        celdaAPA('Propósito dentro del sistema', { isHeader: true, width: 3150 }),
        celdaAPA('Relación con el Dashboard / Postman', { isHeader: true, width: 2660 })
      ]
    }),
    ...endpointsData.map((fila, idx) => {
      const esUltima = idx === endpointsData.length - 1;
      return new TableRow({
        children: [
          celdaAPA(fila[0], { bold: true, width: 1000, isLastRow: esUltima }),
          celdaAPA(fila[1], { width: 2550, isLastRow: esUltima }),
          celdaAPA(fila[2], { width: 3150, isLastRow: esUltima }),
          celdaAPA(fila[3], { width: 2660, isLastRow: esUltima })
        ]
      });
    })
  ];

  const stackData = [
    ['Base de datos SQL (nube)', 'Turso (libSQL / SQLite distribuido)', 'Almacenamiento relacional en 3FN de catálogos geográficos, usuarios, interacciones, etiquetas y cuentas de acceso.'],
    ['Base de datos NoSQL (nube)', 'Google Firebase Firestore', 'Resguardo documental de la bitácora del proceso ETL y de las 793 interacciones enviadas a cuarentena.'],
    ['Backend y API REST', 'Node.js 22 + Express 5', 'Servidor HTTP, validación de catálogos, paginación SQL, control de acceso y entrega de la aplicación compilada.'],
    ['Seguridad y sesiones', 'bcryptjs + jsonwebtoken (JWT)', 'Hash de contraseñas con sal y verificación de sesión mediante encabezados Bearer y cookies HttpOnly.'],
    ['Tiempo real', 'Biblioteca ws (WebSocket nativo)', 'Difusión inmediata de eventos sobre ws://.../ws ante inserciones, ediciones o bajas ejecutadas en la API.'],
    ['Frontend SPA', 'Angular 20 + TypeScript + SCSS', 'Interfaz dividida en módulos independientes con rutas protegidas por guard y soporte de modo claro y oscuro.'],
    ['Graficación y cartografía', 'Chart.js 4 + Leaflet + MapTiler Cloud API', 'Gráficas estadísticas dinámicas y mapa de calor geográfico sobre HTML5 Canvas con teselas basic-v2 y basic-v2-dark.'],
    ['Variables y configuración', 'dotenv (.env)', 'Aislamiento fuera del código fuente de credenciales de Turso, Firebase, clave JWT y API Key de MapTiler.']
  ];

  const filasStack = [
    new TableRow({
      tableHeader: true,
      children: [
        celdaAPA('Capa arquitectónica', { isHeader: true, width: 2300 }),
        celdaAPA('Tecnología utilizada', { isHeader: true, width: 2700 }),
        celdaAPA('Función específica en el proyecto', { isHeader: true, width: 4360 })
      ]
    }),
    ...stackData.map((fila, idx) => {
      const esUltima = idx === stackData.length - 1;
      return new TableRow({
        children: [
          celdaAPA(fila[0], { bold: true, width: 2300, isLastRow: esUltima }),
          celdaAPA(fila[1], { width: 2700, isLastRow: esUltima }),
          celdaAPA(fila[2], { width: 4360, isLastRow: esUltima })
        ]
      });
    })
  ];

  const headerPaginacionAPA = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: 24,
            color: TEXT_COLOR
          })
        ]
      })
    ]
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24, color: TEXT_COLOR }
        }
      }
    },
    sections: [
      // =====================================================================
      // 1. PORTADA ESTUDIANTIL APA 7.ª EDICIÓN
      // =====================================================================
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        headers: { default: headerPaginacionAPA },
        children: [
          new Paragraph({ spacing: { before: 1600 } }),
          parrafo(
            'COMMUNITY 360: Arquitectura de datos en la nube y dashboard analítico en tiempo real',
            {
              bold: true,
              align: AlignmentType.CENTER,
              indentFirstLine: false,
              spaceAfter: 480
            }
          ),
          parrafo('César Andrés Ley Zapata', {
            align: AlignmentType.CENTER,
            indentFirstLine: false,
            spaceAfter: 120
          }),
          parrafo(
            'Licenciatura en Ingeniería en Tecnologías de la Información e Innovación Digital, Universidad Tecnológica Metropolitana',
            {
              align: AlignmentType.CENTER,
              indentFirstLine: false,
              spaceAfter: 120
            }
          ),
          parrafo('Bases de Datos en la Nube (Unidad III) — Grupo 7°B', {
            align: AlignmentType.CENTER,
            indentFirstLine: false,
            spaceAfter: 120
          }),
          parrafo('Mtro. Lizandro Israel Reyes Carrillo', {
            align: AlignmentType.CENTER,
            indentFirstLine: false,
            spaceAfter: 120
          }),
          parrafo('27 de noviembre de 2026', {
            align: AlignmentType.CENTER,
            indentFirstLine: false,
            spaceAfter: 120
          })
        ]
      },

      // =====================================================================
      // CONTENIDO PRINCIPAL DEL REPORTE (APARTADOS 2 AL 7)
      // =====================================================================
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        headers: { default: headerPaginacionAPA },
        children: [
          // -----------------------------------------------------------------
          // 2. DESCRIPCIÓN GENERAL DEL SISTEMA Y SOLUCIÓN PLANTEADA
          // -----------------------------------------------------------------
          titulo1('Descripción General del Sistema y Solución Planteada'),

          parrafo(
            'Community 360 es una plataforma web orientada a concentrar y analizar la actividad de una comunidad digital distribuida en seis redes sociales: Telegram, Discord, Facebook, Instagram, TikTok y Twitter/X. Al inicio del proyecto, los registros provenían de archivos CSV con formatos de fecha mezclados, valores fuera de catálogo, ubicación repetida y 793 interacciones asociadas a identificadores de usuario inexistentes en el padrón. Además, 171 de los 1,068 usuarios registrados indicaron explícitamente que no autorizaban el uso de su ubicación geográfica.'
          ),
          parrafo(
            'Para resolver este problema sin perder trazabilidad de los datos descartados, se construyó primero un flujo de limpieza y carga (ETL) que valida y deposita los registros íntegros en una base relacional en la nube (Turso) bajo Tercera Forma Normal (Codd, 1970), mientras envía los registros en cuarentena y el resumen de auditoría a una colección documental en Firebase Firestore (Google Cloud, 2025). Sobre esa base de datos opera un servidor en Node.js y Express que alimenta una interfaz de página única desarrollada en Angular (Angular, 2025), organizada en cuatro apartados independientes: Resumen general, Explorador de interacciones, Comunidad y retención, y Mapa de calor geográfico.'
          ),

          titulo2('Módulos Integrados en la Aplicación'),
          vineta(
            'Autenticación y control de acceso (Login)',
            'Valida el ingreso por nombre de usuario o correo institucional contra la tabla usuarios_auth en Turso, comparando el hash generado con bcrypt. Al autenticarse se emite un token JWT con vigencia de ocho horas que protege tanto las rutas del cliente en Angular mediante un guard como todos los endpoints analíticos en Express.'
          ),
          vineta(
            'Consulta histórica y filtrado por segmentos (API REST)',
            'Permite consultar indicadores globales, series de tiempo, distribuciones por plataforma y tablas paginadas directamente desde la nube. En los apartados de Interacciones y Comunidad en riesgo, los selectores envían parámetros GET para recalcular conteos, promedios de sentimiento y niveles de participación del segmento elegido.'
          ),
          vineta(
            'Actualización reactiva sin recarga (WebSockets)',
            'Mantiene una conexión persistente sobre el protocolo WebSocket (Fette & Melnikov, 2011). Como el panel no incluye formularios de captura, cualquier alta, edición o eliminación ejecutada desde Postman sobre la API notifica de inmediato a los navegadores conectados para actualizar tarjetas, tablas, gráficas y alertas visuales sin refrescar la página.'
          ),
          vineta(
            'Cumplimiento estricto de privacidad geográfica',
            'Se aplica desde el proceso ETL, se refuerza con una restricción CHECK en el esquema SQL y se mantiene en las consultas de geografía y del mapa de calor. Los usuarios con consentimiento_datos igual a "no" conservan sus columnas de ciudad, latitud y longitud en NULL, por lo que únicamente las 793 ubicaciones con permiso activo se proyectan en los reportes regionales.'
          ),

          titulo2('Resumen de la API REST Desarrollada'),
          parrafo(
            'El backend expone en total 15 endpoints REST agrupados en tres rutas base (/api/auth, /api/interacciones y /api/metricas). En la Tabla 1 se detalla el método, la ruta, el objetivo de cada servicio y su relación directa con el dashboard o con las pruebas desde Postman.'
          ),

          ...encabezadoTablaAPA(
            'Tabla 1',
            'Endpoints REST implementados en el servidor de Community 360 (15 rutas en total)'
          ),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: filasEndpoints
          }),
          parrafo('', { indentFirstLine: false, spaceAfter: 80 }),

          // -----------------------------------------------------------------
          // 3. EVOLUCIÓN DEL STACK TECNOLÓGICO
          // -----------------------------------------------------------------
          titulo1('Evolución del Stack Tecnológico'),

          titulo2('Tecnologías Finales Utilizadas'),
          parrafo(
            'En la Tabla 2 se concentran las herramientas que integran la versión final del proyecto, abarcando almacenamiento híbrido en la nube, servicios de backend, interfaz reactiva y visualización cartográfica.'
          ),

          ...encabezadoTablaAPA(
            'Tabla 2',
            'Stack tecnológico final implementado por capa del sistema'
          ),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: filasStack
          }),
          parrafo('', { indentFirstLine: false, spaceAfter: 80 }),

          titulo2('Modificaciones Respecto a la Fase 1 y Justificación Técnica'),
          parrafo(
            'A lo largo del desarrollo se realizaron cuatro ajustes concretos frente al planteamiento inicial de la Fase 1, motivados por retroalimentación docente y necesidades técnicas surgidas al construir el panel:'
          ),
          vineta(
            'Normalización geográfica a 3FN en Turso',
            'En la propuesta inicial, país, estado, ciudad y zona horaria estaban como texto directo en las tablas principales. Se separaron en los catálogos jerárquicos paises (7 filas), estados (21 filas) y ciudades (21 filas), y se eliminaron los campos geográficos repetidos en interacciones para resolverlos mediante JOIN con usuarios.'
          ),
          vineta(
            'Migración del frontend de HTML estático a Angular 20',
            'Inicialmente se contempló construir las pantallas con HTML, CSS y JavaScript convencional. Al crecer la cantidad de gráficas, tablas paginadas, temas visuales (claro y oscuro) y eventos en vivo, una sola página resultaba saturada y difícil de mantener. Se migró a Angular 20 con componentes standalone, servicios inyectables y enrutamiento por módulos exclusivos (/resumen, /interacciones, /comunidad y /mapa).'
          ),
          vineta(
            'Incorporación de mapa de calor cartográfico con MapTiler Cloud y Leaflet',
            'Para aprovechar las coordenadas reales almacenadas en los perfiles con consentimiento, se añadió el módulo Mapa de calor consumiendo teselas raster de MapTiler Cloud (estilos basic-v2 para modo claro y basic-v2-dark para modo oscuro) mediante una API Key en el archivo .env. En una prueba previa con MapLibre WebGL se detectó que el modo ahorro de energía del navegador en Windows bloqueaba el lienzo 3D; al sustituirlo por Leaflet (Agafonkin, 2023) junto con una capa térmica propia en HTML5 Canvas 2D se garantizó compatibilidad total en cualquier equipo.'
          ),
          vineta(
            'Uso de la biblioteca nativa ws en lugar de Socket.io',
            'Se eligió el paquete ligero ws conectado directamente a la instancia HTTP de Express para transmitir tramas JSON estándar sin añadir peso adicional al cliente ni requerir protocolos propietarios.'
          ),

          // -----------------------------------------------------------------
          // 4. ANÁLISIS DE BASE DE DATOS Y ESCALABILIDAD (ENFOQUE PRINCIPAL)
          // -----------------------------------------------------------------
          titulo1('Análisis de Base de Datos y Escalabilidad'),

          titulo2('Comportamiento Actual y Evaluación ante Grandes Volúmenes'),
          parrafo(
            'La persistencia actual sigue un modelo híbrido: Turso (Turso, 2025) administra la información relacional estructurada (1,068 usuarios, 207 interacciones válidas, sus etiquetas normalizadas y las cuentas de acceso), mientras que Firestore almacena documentos JSON sin esquema rígido para la cuarentena (793 registros rechazados) y las ejecuciones del ETL. Con el volumen actual del proyecto, los tiempos de lectura y escritura se mantienen por debajo de unos cientos de milisegundos gracias a los índices creados sobre usuario, fecha, canal/tema, estatus y ciudad.'
          ),
          parrafo(
            'Sin embargo, si la comunidad creciera de mil miembros a cientos de miles de usuarios activos generando cientos de miles o millones de interacciones en tiempo real, aparecerían tres cuellos de botella claros en la arquitectura actual:'
          ),
          vineta(
            'Contención de escrituras concurrentes en SQLite/libSQL',
            'Aunque Turso distribuye muy bien las lecturas, un mismo archivo de base de datos basado en SQLite serializa las transacciones de escritura. Miles de inserciones simultáneas por segundo provocarían esperas de bloqueo (SQLITE_BUSY) y aumento de latencia en POST, PUT y DELETE.'
          ),
          vineta(
            'Recálculo repetitivo de agregaciones SQL en cada evento',
            'Actualmente, cada vez que ocurre un cambio en interacciones, el módulo WebSocket ejecuta consultas COUNT y AVG sobre la tabla completa y los clientes refrescan sus métricas. Con millones de filas, recorrer la tabla en cada mensaje degradaría la respuesta de la base de datos.'
          ),
          vineta(
            'Difusión WebSocket atada a un solo proceso de Node.js',
            'El servidor mantiene las conexiones WebSocket en la memoria de una única instancia de Express. Si se levantaran varias réplicas horizontales detrás de un balanceador de carga, un POST atendido por la instancia A no notificaría a los navegadores conectados en la instancia B.'
          ),

          titulo2('Modificaciones Técnicas Propuestas para Escalar'),
          parrafo(
            'Para soportar ese crecimiento sin perder el esquema híbrido ni la actualización en tiempo real, se plantean cuatro cambios concretos de ingeniería (Kleppmann, 2017):'
          ),
          vineta(
            'Caché en memoria y pub/sub con Redis',
            'Colocar Redis frente a la base de datos para guardar los KPIs globales, la matriz Canal × Tema y los conteos por canal con tiempos de vida cortos o contadores incrementales, además de usar Redis Pub/Sub para sincronizar eventos WebSocket entre múltiples instancias de Node.js.'
          ),
          vineta(
            'Cola de ingesta asíncrona para escrituras intensivas',
            'Introducir una cola de mensajes (como RabbitMQ o Google Cloud Pub/Sub) entre la API de recepción y la base de datos, de modo que las interacciones entrantes se agrupen y se inserten por lotes (batch writes) en lugar de abrir una transacción individual por cada publicación.'
          ),
          vineta(
            'Tablas de resumen precalculadas y particionamiento temporal',
            'Mantener tablas agregadas diarias por canal y fecha para que las gráficas históricas lean decenas de filas resumidas en lugar de escanear millones de eventos crudos, o bien migrar el núcleo transaccional de escritura intensiva a PostgreSQL administrado conservando Firestore para auditoría y eventos no estructurados.'
          ),
          vineta(
            'Agrupamiento espacial en servidor para el mapa de calor',
            'En lugar de enviar cada coordenada individual al navegador cuando existan decenas de miles de ubicaciones, preagrupar la densidad por celdas geográficas (geohash) desde el backend según el nivel de zoom solicitado.'
          ),

          // -----------------------------------------------------------------
          // 5. EVIDENCIAS DEL SISTEMA DESPLEGADO
          // -----------------------------------------------------------------
          titulo1('Evidencias del Sistema Desplegado'),

          titulo2('Arquitectura de Consumo: Peticiones REST frente a WebSockets'),
          parrafo(
            'La separación entre REST y WebSockets dentro del dashboard responde directamente a qué tan rápido cambia cada bloque de información y cuánto cuesta calcularlo:'
          ),
          vineta(
            'Secciones alimentadas mediante peticiones REST (GET)',
            'La carga inicial de los cuatro apartados, la serie histórica de sentimiento por día, la distribución demográfica por país y ciudad, el mapa de calor geográfico y las consultas paginadas con filtros (por canal, temática, tipo o prioridad de riesgo) utilizan REST. Se eligió este mecanismo porque requieren parámetros de consulta (limit, offset, filtros bajo demanda) y consolidan datos históricos o demográficos que no cambian cada segundo.'
          ),
          vineta(
            'Indicadores y vistas actualizados mediante WebSockets',
            'Las tarjetas de conteo de interacciones, el promedio global de sentimiento, el estado de conexión en tiempo real, la tabla de interacciones recientes, la línea de tiempo de actividad y las notificaciones emergentes (toasts) escuchan el canal WebSocket. Se eligió WebSockets para evitar el sondeo repetitivo (polling HTTP cada pocos segundos) y lograr que las altas, modificaciones y bajas hechas desde Postman se reflejen al instante sin recargar la vista.'
          ),

          titulo2('Justificación y Utilidad de las Métricas Implementadas'),
          vineta(
            'Tarjetas KPI ejecutivas (Resumen general)',
            'Muestran el tamaño del padrón (1,068 miembros), el volumen de conversaciones analizadas, el índice medio de sentimiento en escala de -1.00 a +1.00 con barra visual de polaridad y el porcentaje de usuarios en alerta de retención (39.4 %). Permiten evaluar de un vistazo el estado general de la comunidad.'
          ),
          vineta(
            'Gráfica combinada de evolución temporal y barras por canal',
            'Cruza el sentimiento diario (línea) contra el volumen de mensajes (barras) para detectar fechas con caídas de ánimo o picos de conflicto, mientras que las barras horizontales por red social indican en qué canales se concentra la participación (encabezada por Telegram y TikTok).'
          ),
          vineta(
            'Matriz de interés Canal × Tema',
            'Cruza las seis plataformas con las ocho temáticas de la comunidad. Ayuda a los administradores a ubicar dónde moderar o impulsar contenido; por ejemplo, distinguir si arte y comisiones tiene mayor tracción en un canal específico frente a videojuegos o eventos.'
          ),
          vineta(
            'Métricas dinámicas por segmento en el Explorador de interacciones',
            'Al filtrar por canal, categoría temática o tipo de interacción, las tarjetas superiores recalculan en vivo el total de coincidencias, el sentimiento exclusivo de ese segmento y el total y promedio de reacciones por publicación, facilitando comparar qué temas generan mejor respuesta.'
          ),
          vineta(
            'Indicadores de retención, dona por país y tabla paginada de riesgo',
            'En Comunidad y retención se contrastan los miembros estables (60.6 %) frente a los 421 perfiles en riesgo. La tabla inferior permite filtrar por canal principal y nivel de alerta (Prioridad alta cuando el sentimiento es menor o igual a -0.35, o Seguimiento preventivo), recalculando el sentimiento medio y los mensajes en 30 días del grupo filtrado con paginación completa para revisar todos los casos.'
          ),
          vineta(
            'Mapa de calor geográfico y directorio interactivo de ciudades',
            'Representa sobre cartografía de MapTiler las 793 ubicaciones con consentimiento distribuidas en 21 ciudades y 7 países (destacando Ciudad de México con 149 miembros y Mérida con 118). Aporta valor directo para decidir en qué ciudades organizar reuniones o convenciones presenciales respetando la privacidad de quienes no dieron autorización.'
          ),

          titulo2('Vistas del Sistema y Descripción Funcional'),

          ...bloqueFiguraAPA(
            1,
            'Pantalla de inicio de sesión (/login) en modo claro y modo oscuro',
            'Pantalla de Login de Community 360',
            'Vista de acceso restringido con validación de credenciales contra Turso, resumen funcional de la plataforma y selector de tema visual.'
          ),

          ...bloqueFiguraAPA(
            2,
            'Apartado exclusivo de Resumen ejecutivo (/dashboard/resumen)',
            'Vista completa del módulo Resumen general',
            'Presenta los cuatro KPIs principales, la evolución diaria de sentimiento y volumen, la participación por canal, la matriz Canal × Tema y el panel de actividad reciente.'
          ),

          ...bloqueFiguraAPA(
            3,
            'Apartado exclusivo del Explorador de interacciones (/dashboard/interacciones)',
            'Vista del módulo Interacciones aplicando filtros por canal y temática',
            'Muestra el recálculo dinámico de sentimiento e impacto del segmento filtrado, la tabla paginada con etiquetas y el flujo lateral en tiempo real.'
          ),

          ...bloqueFiguraAPA(
            4,
            'Apartado exclusivo de Comunidad y retención (/dashboard/comunidad)',
            'Vista del módulo Comunidad y riesgo con filtros y paginación activos',
            'Integra métricas de salud comunitaria, principales ciudades, distribución por país y la tabla paginada de seguimiento de miembros en riesgo de abandono.'
          ),

          ...bloqueFiguraAPA(
            5,
            'Apartado exclusivo del Mapa de calor geográfico (/dashboard/mapa) en modo claro y oscuro',
            'Vista del Mapa de calor con MapTiler Cloud y directorio de ciudades',
            'Visualiza la concentración térmica de las 793 coordenadas con consentimiento activo y permite enfocar cualquiera de las 21 ciudades con su sentimiento promedio.'
          ),

          titulo2('Pruebas Funcionales de Actualización en Vivo (Postman + WebSockets)'),
          parrafo(
            'A continuación se documentan las tres pruebas funcionales en pantalla dividida (petición ejecutada desde Postman junto con la reacción automática del dashboard en el navegador sin recargar la página):'
          ),

          ...bloqueFiguraAPA(
            6,
            'Prueba funcional 1: Creación de interacción en vivo mediante POST /api/interacciones',
            'Pantalla dividida: Postman ejecutando POST (201 Created) y dashboard mostrando fila resaltada y notificación',
            'Al enviar el POST desde Postman con token Bearer, el servidor inserta en Turso y emite INTERACCION_CREADA; el dashboard incrementa el contador total, inserta la fila al inicio con animación y muestra el aviso emergente.'
          ),

          ...bloqueFiguraAPA(
            7,
            'Prueba funcional 2: Modificación en vivo mediante PUT /api/interacciones/:id',
            'Pantalla dividida: Postman ejecutando PUT (200 OK) y dashboard actualizando sentimiento y texto en tiempo real',
            'Al modificar el sentimiento y el contenido desde Postman, el evento INTERACCION_ACTUALIZADA actualiza el registro en pantalla y recalcula el sentimiento promedio sin refrescar el navegador.'
          ),

          ...bloqueFiguraAPA(
            8,
            'Prueba funcional 3: Eliminación en vivo mediante DELETE /api/interacciones/:id',
            'Pantalla dividida: Postman ejecutando DELETE (200 OK) y dashboard retirando el registro automáticamente',
            'Al eliminar la interacción desde Postman, el servidor propaga INTERACCION_ELIMINADA; el panel retira la fila de inmediato, registra la acción en el historial en vivo y ajusta los indicadores globales.'
          ),

          // -----------------------------------------------------------------
          // 6. ENLACES DE DESPLIEGUE Y CREDENCIALES DE EVALUACIÓN
          // -----------------------------------------------------------------
          titulo1('Enlaces de Despliegue y Credenciales de Evaluación'),

          parrafo(
            'Para la revisión funcional del proyecto se dejan configurados los enlaces de acceso al sistema y la cuenta institucional solicitada en los lineamientos con permisos completos sobre el dashboard y la API:'
          ),

          titulo2('Liga Pública del Proyecto Desplegado'),
          vineta(
            'URL pública activa en la nube (Frontend + Backend + WebSockets)',
            'https://community360-62t6.onrender.com'
          ),
          vineta(
            'Canal WebSocket seguro en producción',
            'wss://community360-62t6.onrender.com/ws'
          ),
          vineta(
            'Repositorio de código fuente en GitHub',
            'https://github.com/CesarLey/COMMUNITY360'
          ),

          titulo2('Credenciales Activas para Evaluación Docente'),
          vineta('Usuario', 'lizandro.reyes'),
          vineta('Correo electrónico', 'lizandro.reyes@utmetropolitana.edu.mx'),
          vineta('Contraseña', 'lizandr0_reye$'),
          vineta(
            'Rol asignado',
            'admin (almacenado en la tabla usuarios_auth de Turso mediante hash bcrypt; permite iniciar sesión tanto con el nombre de usuario como con el correo institucional).'
          ),

          // -----------------------------------------------------------------
          // 7. CONCLUSIONES Y REFERENCIAS BIBLIOGRÁFICAS (APA 7)
          // -----------------------------------------------------------------
          titulo1('Conclusiones y Referencias Bibliográficas'),

          titulo2('Reflexión Personal sobre Retos y Aprendizajes'),
          parrafo(
            'Desarrollar Community 360 de principio a fin me permitió entender en la práctica por qué una arquitectura híbrida en la nube resulta mucho más útil que forzar un solo motor para todo. Limpiar los archivos originales evidenció que en un entorno real los datos casi nunca llegan listos para insertarse: separar los catálogos en Tercera Forma Normal en Turso evitó duplicidades y facilitó validar llaves foráneas y reglas de privacidad desde el propio motor SQL, mientras que contar con Firestore permitió conservar las 793 interacciones rechazadas para auditoría sin perder información ni romper la integridad relacional.'
          ),
          parrafo(
            'En la parte de aplicación web, dos retos marcaron la mayor diferencia en el resultado. El primero fue coordinar las consultas REST con la difusión por WebSockets para que el panel respondiera al instante a las pruebas externas desde Postman sin incluir formularios de edición en la interfaz. El segundo fue llevar el dashboard a una estructura modular en Angular pensando como un sistema en producción: separar las vistas en apartados independientes, implementar paginación real conectada a los filtros de la base de datos y resolver la visualización del mapa de calor con MapTiler y Leaflet en modo claro y oscuro dejaron un aprendizaje directo sobre cómo cuidar tanto el sustento de datos en la nube como la experiencia de quien analiza la información.'
          ),

          titulo2('Referencias'),
          parrafo(
            [
              { text: 'Agafonkin, V. (2023). ' },
              { text: 'Leaflet: An open-source JavaScript library for mobile-friendly interactive maps', italic: true },
              { text: '. https://leafletjs.com/' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Angular. (2025). ' },
              { text: 'Angular documentation: Standalone components, routing, and signals', italic: true },
              { text: '. Google. https://angular.dev/overview' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Codd, E. F. (1970). A relational model of data for large shared data banks. ' },
              { text: 'Communications of the ACM, 13', italic: true },
              { text: '(6), 377–387. https://doi.org/10.1145/362384.362685' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Fette, I., & Melnikov, A. (2011). ' },
              { text: 'The WebSocket Protocol', italic: true },
              { text: ' (RFC 6455). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc6455' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Google Cloud. (2025). ' },
              { text: 'Cloud Firestore documentation: NoSQL document database', italic: true },
              { text: '. https://firebase.google.com/docs/firestore' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Kleppmann, M. (2017). ' },
              { text: 'Designing data-intensive applications: The big ideas behind reliable, scalable, and maintainable systems', italic: true },
              { text: '. O\'Reilly Media.' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          ),
          parrafo(
            [
              { text: 'Turso. (2025). ' },
              { text: 'Turso documentation: Distributed SQLite powered by libSQL', italic: true },
              { text: '. https://docs.turso.tech/' }
            ],
            { indentFirstLine: false, hanging: true, spaceAfter: 140 }
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, '..', 'docs', 'PROY_U3_Final_Ley_Cesar.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Documento Word (.docx) actualizado en: ${outPath} (${buffer.length} bytes)`);
}

generarDocumento().catch((err) => {
  console.error('Error al generar documento Word:', err);
  process.exit(1);
});
