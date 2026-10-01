const subcarpetas = require("./subcarpetasDrive");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs/promises");
const { Readable } = require("stream");
const crypto = require("crypto");

const drive = require("../config/googleDrive");

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 20,
  connectTimeout: 10000
});

function fallo(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function idValido(valor) {
  return (
    /^\d+$/.test(String(valor)) &&
    Number.isSafeInteger(Number(valor)) &&
    Number(valor) > 0 &&
    Number(valor) <= 2147483647
  );
}

function responderError(res, error) {
  console.error(
    "Error documentos:",
    error.code || error.status || "ERROR_INTERNO"
  );

  const conocido = [400, 403, 404, 409, 413, 415, 503]
    .includes(error.status);

  return res.status(conocido ? error.status : 500).json({
    success: false,
    mensaje: conocido
      ? error.message
      : "No se pudo completar la operación. Actualiza la lista antes de reintentar."
  });
}

// =====================================
// PERMISOS DE LECTURA
// =====================================


function filtroLectura(usuario) {
  const roles = ["Administrador", "Supervisor", "Usuario"];

  if (!usuario || !roles.includes(usuario.nombre_rol)) {
    throw fallo(403, "Tu cuenta no tiene permiso de consulta.");
  }

  // Las rutas mantienen la comprobación de sesión y cuenta activa.
  // Esta regla solo amplía la lectura.
  return { sql: "1 = 1", parametros: [] };
}

const consultaDocumentos = `
  SELECT
    d.id_documento,
    d.id_carpeta,
    d.nombre_archivo,
    d.tipo_archivo,
    d.ruta_nube,
    d.descripcion,
    d.version,
    d.fecha_subida,
    d.estado,
    d.estado_documento,
    d.fecha_aprobacion,
    COALESCE(d.id_proyecto, s.id_proyecto) AS id_proyecto,
    COALESCE(d.id_area, s.id_area) AS id_area,
    p.nombre_proyecto,
    a.nombre_area,
    c.nombre_carpeta,
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
  LEFT JOIN usuarios u
    ON u.id_usuario = d.id_usuario
`;

exports.listarDocumentos = async (req, res) => {
  try {
    const pagina = Number(req.query.pagina || 1);

    if (
      !Number.isSafeInteger(pagina) ||
      pagina < 1 ||
      pagina > 1000000
    ) {
      throw fallo(400, "La página solicitada no es válida.");
    }

    const filtro = filtroLectura(req.usuario);

    const carpetasTexto =
      typeof req.query.carpetas === "string"
        ? req.query.carpetas.trim()
        : "";

    let carpetas = [];

    if (carpetasTexto) {
      const partes = carpetasTexto
        .split(",")
        .map((valor) => valor.trim())
        .filter(Boolean);

      if (
        partes.length === 0 ||
        partes.length > 100 ||
        partes.some((valor) => !idValido(valor))
      ) {
        throw fallo(
          400,
          "La selección de carpetas no es válida."
        );
      }

      carpetas = [
        ...new Set(partes.map((valor) => Number(valor)))
      ];
    }

    const condiciones = [`(${filtro.sql})`];
    const parametros = [...filtro.parametros];

    if (carpetas.length) {
      condiciones.push(
        `d.id_carpeta IN (${carpetas.map(() => "?").join(",")})`
      );

      parametros.push(...carpetas);
    }

    const [filas] = await pool.query(
      `
        ${consultaDocumentos}
        WHERE ${condiciones.join(" AND ")}
        ORDER BY d.fecha_subida DESC, d.id_documento DESC
        LIMIT ? OFFSET ?
      `,
      [
        ...parametros,
        101,
        (pagina - 1) * 100
      ]
    );

    const documentos = filas
      .slice(0, 100)
      .map((fila) => {
        const {
          ruta_nube,
          ...datos
        } = fila;

        return datos;
      });

    res.json({
      success: true,
      documentos,
      pagina,
      por_pagina: 100,
      hay_mas: filas.length > 100
    });

  } catch (error) {
    responderError(res, error);
  }
};

// =====================================
// CARPETAS DONDE PUEDE SUBIR
// =====================================

exports.destinos = async (req, res) => {
  try {
    const carpetas = await subcarpetas.listarDestinos(pool, req.usuario);
    return res.json({ success: true, carpetas });
  } catch (error) {
    return responderError(res, error);
  }
};

async function comprobarDestino(conexion, idCarpeta, usuario, bloquear) {
  return subcarpetas.comprobar(
    conexion,
    idCarpeta,
    usuario,
    bloquear
  );
}

exports.validarDestino = async (req, res, next) => {
  try {
    await comprobarDestino(
      pool,
      req.params.idCarpeta,
      req.usuario,
      false
    );

    next();
  } catch (error) {
    responderError(res, error);
  }
};

// =====================================
// CARPETA FÍSICA EN DRIVE
// =====================================

async function obtenerCarpetaDrive(conexion, carpeta) {
  return subcarpetas.asegurarEnDrive(conexion, carpeta);
}

exports.subirArchivo = async (req, res) => {
  let conexion;
  let transaccion = false;
  let idDrive = null;
  const operacion = crypto.randomUUID();

  try {
    if (!req.file) {
      throw fallo(400, "Selecciona un archivo PDF.");
    }

    const nombre = req.file.originalname.trim();
    const descripcion = req.body.descripcion ?? "";

    if (
      !nombre ||
      Array.from(nombre).length > 255 ||
      /[\\/\x00-\x1F\x7F]/.test(nombre) ||
      !nombre.toLowerCase().endsWith(".pdf")
    ) {
      throw fallo(400, "El nombre del PDF no es válido.");
    }

    if (
      typeof descripcion !== "string" ||
      Array.from(descripcion).length > 2000
    ) {
      throw fallo(400, "La descripción admite hasta 2000 caracteres.");
    }

    if (
      req.file.buffer.length < 5 ||
      req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw fallo(415, "El archivo no tiene una cabecera PDF válida.");
    }

    conexion = await pool.getConnection();

    const [tablas] = await conexion.query(`
      SELECT ENGINE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'documentos',
          'carpetas_documentos',
          'historial_documentos'
        )
    `);

    if (
      tablas.length !== 3 ||
      tablas.some((t) => String(t.ENGINE).toUpperCase() !== "INNODB")
    ) {
      throw fallo(409, "Las tablas de documentos deben utilizar InnoDB.");
    }

    await conexion.beginTransaction();
    transaccion = true;

    // Revalida la cuenta al terminar de recibir el archivo.
    const [usuarios] = await conexion.query(
      `
        SELECT u.id_usuario, u.id_area, r.nombre_rol
        FROM usuarios u
        INNER JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ? AND u.estado = 1
        FOR UPDATE
      `,
      [req.usuario.id_usuario]
    );

    const usuario = usuarios[0];

    if (
      !usuario ||
      !["Administrador", "Supervisor", "Usuario"]
        .includes(usuario.nombre_rol)
    ) {
      throw fallo(403, "Tu cuenta ya no tiene permiso para subir.");
    }

    const carpeta = await comprobarDestino(
      conexion,
      req.params.idCarpeta,
      usuario,
      true
    );

    const carpetaDrive = await obtenerCarpetaDrive(conexion, carpeta);

    const respuesta = await drive.files.create(
      {
        requestBody: {
          name: nombre,
          parents: [carpetaDrive],
          appProperties: {
            coemsa_operacion: operacion,
            coemsa_usuario: String(usuario.id_usuario),
            coemsa_carpeta: String(carpeta.id_carpeta)
          }
        },
        media: {
          mimeType: "application/pdf",
          body: Readable.from([req.file.buffer])
        },
        fields: "id"
      },
      { timeout: 60000, retry: false }
    );

    idDrive = respuesta.data.id;

    if (!idDrive) {
      throw fallo(503, "Drive no confirmó el archivo.");
    }

    const [resultado] = await conexion.query(
      `
        INSERT INTO documentos (
          id_carpeta,
          id_tipo,
          id_usuario,
          nombre_archivo,
          tipo_archivo,
          ruta_nube,
          descripcion,
          version,
          estado,
          estado_documento,
          id_proyecto,
          id_area
        )
        VALUES (?, NULL, ?, ?, ?, ?, ?, '1.0', 1, 'Pendiente', ?, ?)
      `,
      [
        carpeta.id_carpeta,
        usuario.id_usuario,
        nombre,
        "application/pdf",
        "drive:" + idDrive,
        descripcion.trim(),
        carpeta.id_proyecto,
        carpeta.id_area
      ]
    );

    await conexion.query(
      `
        INSERT INTO historial_documentos (
          id_documento,
          id_usuario,
          version_anterior,
          version_nueva,
          accion,
          fecha_cambio
        )
        VALUES (?, ?, NULL, '1.0', 'Subida de documento', NOW())
      `,
      [resultado.insertId, usuario.id_usuario]
    );

    await conexion.commit();
    transaccion = false;

    return res.status(201).json({
      success: true,
      mensaje: "PDF guardado en Drive y registrado como pendiente.",
      id_documento: resultado.insertId
    });
  } catch (error) {
    if (conexion && transaccion) {
      try {
        await conexion.rollback();
      } catch {
        conexion.destroy();
        conexion = null;
      }
    }

    // No elimina archivos de Drive ante un resultado incierto.
    // Estos identificadores sirven para reconciliar una subida fallida.
    console.error("Referencia de subida:", operacion);

    if (idDrive) {
      console.error("Archivo Drive a comprobar:", idDrive);
    }

    return responderError(res, error);
  } finally {
    if (conexion) conexion.release();
    if (req.file) req.file.buffer = null;
  }
};

// =====================================
// VER PDF LOCAL O DE DRIVE
// =====================================

exports.verDocumento = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) {
      throw fallo(400, "El ID del documento no es válido.");
    }

    const filtro = filtroLectura(req.usuario);

    const [documentos] = await pool.query(
      `
        ${consultaDocumentos}
        WHERE d.id_documento = ?
          AND (${filtro.sql})
        LIMIT 1
      `,
      [Number(req.params.id), ...filtro.parametros]
    );

    if (!documentos.length) {
      throw fallo(404, "Documento no disponible para tu cuenta.");
    }

    const documento = documentos[0];
    const ruta = String(documento.ruta_nube || "");
    const coincidenciaDrive = /^drive:([a-zA-Z0-9_-]+)$/.exec(ruta);

    function cabecerasPDF() {
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition":
          (req.query.descargar === "1" ? "attachment" : "inline") +
          '; filename="documento-' + documento.id_documento + '.pdf"',
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN"
      });
    }

    if (coincidenciaDrive) {
      const fileId = coincidenciaDrive[1];

      const { data: metadata } = await drive.files.get(
        {
          fileId,
          fields: "mimeType,trashed"
        },
        { timeout: 20000, retry: false }
      );

      if (metadata.trashed) {
        throw fallo(404, "El archivo está en la papelera de Drive.");
      }

      if (metadata.mimeType !== "application/pdf") {
        throw fallo(415, "Este visor admite archivos PDF.");
      }

      const respuesta = await drive.files.get(
        { fileId, alt: "media" },
        {
          responseType: "stream",
          timeout: 60000,
          retry: false
        }
      );

      const flujo = respuesta.data;

      if (res.destroyed) {
        flujo.destroy();
        return;
      }

      cabecerasPDF();

      flujo.on("error", () => {
        if (res.destroyed) return;

        if (res.headersSent) {
          res.destroy();
        } else {
          res.removeHeader("Content-Disposition");
          res.status(502).type("text/plain")
            .send("No se pudo leer el PDF desde Drive.");
        }
      });

      res.on("close", () => flujo.destroy());
      flujo.pipe(res);
      return;
    }

    // Compatibilidad con los PDF antiguos de uploads.
    const coincidenciaLocal =
      /^uploads\/([^/]+\.pdf)$/i.exec(ruta.replace(/\\/g, "/"));

    if (
      !coincidenciaLocal ||
      coincidenciaLocal[1].startsWith(".") ||
      /[\x00-\x1F\x7F<>:"|?*]/.test(coincidenciaLocal[1])
    ) {
      throw fallo(
        409,
        "Este registro no tiene un PDF vinculado. Debe recuperarse el archivo."
      );
    }

    const raiz = await fs.realpath(
      path.join(__dirname, "../uploads")
    );

    const archivo = await fs.realpath(
      path.join(raiz, coincidenciaLocal[1])
    );

    const relativo = path.relative(raiz, archivo);

    if (
      !relativo ||
      relativo === ".." ||
      relativo.startsWith(".." + path.sep) ||
      path.isAbsolute(relativo)
    ) {
      throw fallo(403, "Ruta de archivo no permitida.");
    }

    const manejador = await fs.open(archivo, "r");

    try {
      const datos = await manejador.stat();
      const cabecera = Buffer.alloc(5);

      if (!datos.isFile()) {
        throw fallo(404, "El archivo no está disponible.");
      }

      const { bytesRead } = await manejador.read(cabecera, 0, 5, 0);

      if (bytesRead !== 5 || cabecera.toString("ascii") !== "%PDF-") {
        throw fallo(415, "El archivo no tiene una cabecera PDF válida.");
      }
    } finally {
      await manejador.close();
    }

    cabecerasPDF();

    res.sendFile(
      relativo,
      {
        root: raiz,
        dotfiles: "deny",
        cacheControl: false,
        lastModified: false
      },
      (error) => {
        if (!error || res.destroyed) return;
        if (res.headersSent) return next(error);

        res.removeHeader("Content-Disposition");
        res.status(404).type("text/plain")
          .send("No se pudo abrir el archivo local.");
      }
    );
  } catch (error) {
    if (res.destroyed) return;
    if (res.headersSent) return next(error);

    res.removeHeader("Content-Disposition");

    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      error = fallo(404, "El PDF no está disponible en el servidor.");
    }

    if (Number(error.response?.status) === 404) {
      error = fallo(404, "El PDF no está disponible en Drive.");
    }

    responderError(res, error);
  }
};