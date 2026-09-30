const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

function leer(nombre) {
  return fs.readFileSync(path.join(__dirname, nombre), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ");
}

function reemplazar(texto, anterior, nuevo) {
  const posicion = texto.indexOf(anterior);

  if (
    posicion < 0 ||
    texto.indexOf(anterior, posicion + anterior.length) >= 0
  ) {
    throw new Error("No se encontró una coincidencia única: " + anterior);
  }

  return texto.slice(0, posicion) +
    nuevo +
    texto.slice(posicion + anterior.length);
}

try {
  let drive = leer("controllers/driveController.js");
  let organizacion = leer("controllers/organizacionController.js");
  let rutas = leer("routes/documentos.js");
  let pantalla = leer("frontend/documentos.html");

  if (organizacion.includes("exports.buscarGeneral")) {
    throw new Error("La actualización ya fue aplicada.");
  }

  const inicio = drive.indexOf("function filtroLectura(usuario)");
  const fin = drive.indexOf("const consultaDocumentos", inicio);

  if (inicio < 0 || fin < 0) {
    throw new Error("No se encontró la función de permisos de lectura.");
  }

  drive = drive.slice(0, inicio) + `
function filtroLectura(usuario) {
  const roles = ["Administrador", "Supervisor", "Usuario"];

  if (!usuario || !roles.includes(usuario.nombre_rol)) {
    throw fallo(403, "Tu cuenta no tiene permiso de consulta.");
  }

  // Las rutas mantienen la comprobación de sesión y cuenta activa.
  // Esta regla solo amplía la lectura.
  return { sql: "1 = 1", parametros: [] };
}

` + drive.slice(fin);

  drive = reemplazar(
    drive,
    `'inline; filename="documento-'`,
    `(req.query.descargar === "1" ? "attachment" : "inline") +
          '; filename="documento-'`
  );

  organizacion = reemplazar(
    organizacion,
    'const esUsuario = usuario.nombre_rol === "Usuario";',
    `// Todos los roles autorizados pueden consultar la organización.
    // El cálculo de permisos de subida se conserva.
    const esUsuario = false;`
  );

  organizacion += `

// Búsqueda general para las cuentas activas autorizadas por la ruta.
exports.buscarGeneral = async (req, res) => {
  const termino = typeof req.query.q === "string"
    ? req.query.q.trim()
    : "";

  const pagina = Number(req.query.pagina || 1);

  if (
    termino.length < 2 ||
    termino.length > 150 ||
    !Number.isSafeInteger(pagina) ||
    pagina < 1 ||
    pagina > 1000000
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "Escribe entre 2 y 150 caracteres y una página válida."
    });
  }

  try {
    const [filas] = await pool.query(\`
      SELECT
        d.id_documento,
        d.nombre_archivo,
        d.descripcion,
        d.fecha_subida,
        d.estado_documento,
        c.nombre_carpeta,
        p.nombre_proyecto,
        a.nombre_area,
        cl.nombre_cliente,
        uc.nombre_unidad,
        CONCAT_WS(' ', u.nombre, u.apellido) AS subido_por
      FROM documentos d
      LEFT JOIN carpetas_documentos c
        ON c.id_carpeta = d.id_carpeta
      LEFT JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      LEFT JOIN proyectos p
        ON p.id_proyecto = COALESCE(d.id_proyecto, s.id_proyecto)
      LEFT JOIN areas a
        ON a.id_area = COALESCE(d.id_area, s.id_area)
      LEFT JOIN proyecto_unidad pu
        ON pu.id_proyecto = p.id_proyecto
      LEFT JOIN unidades_clientes uc
        ON uc.id_unidad = pu.id_unidad
      LEFT JOIN clientes cl
        ON cl.id_cliente = uc.id_cliente
      LEFT JOIN usuarios u
        ON u.id_usuario = d.id_usuario
      WHERE INSTR(
        LOWER(CONCAT_WS(' ',
          d.nombre_archivo,
          d.descripcion,
          d.estado_documento,
          c.nombre_carpeta,
          p.nombre_proyecto,
          a.nombre_area,
          cl.nombre_cliente,
          uc.nombre_unidad,
          u.nombre,
          u.apellido
        )),
        LOWER(?)
      ) > 0
      ORDER BY d.fecha_subida DESC, d.id_documento DESC
      LIMIT 101 OFFSET ?
    \`, [termino, (pagina - 1) * 100]);

    return res.json({
      success: true,
      documentos: filas.slice(0, 100),
      pagina,
      hay_mas: filas.length > 100
    });
  } catch (error) {
    console.error("Error búsqueda general:", error.code || "ERROR_INTERNO");

    return res.status(500).json({
      success: false,
      mensaje: "No se pudo completar la búsqueda."
    });
  }
};
`;

  rutas = reemplazar(
    rutas,
    'router.get("/organizacion", organizacion.consultar);',
    `router.get("/organizacion", organizacion.consultar);
router.get("/buscar", organizacion.buscarGeneral);`
  );

  pantalla = reemplazar(
    pantalla,
    '<a href="/subir_documento.html">Subir PDF</a>',
    `<a href="/subir_documento.html">Subir PDF</a>
      <a href="/buscar_documentos.html">Búsqueda general</a>`
  );

  const cambios = [
    ["controllers/driveController.js", drive],
    ["controllers/organizacionController.js", organizacion],
    ["routes/documentos.js", rutas],
    ["frontend/documentos.html", pantalla]
  ];

  for (const [nombre, contenido] of cambios) {
    if (nombre.endsWith(".js")) {
      new vm.Script(contenido, { filename: nombre });
    } else {
      for (const coincidencia of contenido.matchAll(
        /<script\b[^>]*>([\s\S]*?)<\/script>/gi
      )) {
        if (coincidencia[1].trim()) {
          new vm.Script(coincidencia[1], { filename: nombre });
        }
      }
    }
  }

  const respaldo = fs.mkdtempSync(
    path.join(os.homedir(), "coemsa-respaldo-consulta-")
  );

  for (const [nombre] of cambios) {
    const destino = path.join(respaldo, nombre);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(__dirname, nombre), destino);
  }

  try {
    for (const [nombre, contenido] of cambios) {
      fs.writeFileSync(path.join(__dirname, nombre), contenido, "utf8");
    }
  } catch (error) {
    for (const [nombre] of cambios) {
      fs.copyFileSync(
        path.join(respaldo, nombre),
        path.join(__dirname, nombre)
      );
    }

    throw error;
  }

  console.log("Consulta general habilitada en el código.");
  console.log("Permisos de subida conservados.");
  console.log("Sintaxis JavaScript comprobada.");
  console.log("Respaldo:", respaldo);
  console.log("Falta publicar los cambios en Railway.");
} catch (error) {
  console.error("No se completó la actualización:", error.message);
  process.exitCode = 1;
}