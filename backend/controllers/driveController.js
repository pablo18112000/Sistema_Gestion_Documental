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
  if (usuario.nombre_rol !== "Usuario") {
    return { sql: "1 = 1", parametros: [] };
  }

  return {
    sql: `
      (
        d.id_proyecto IS NULL
        OR s.id_proyecto IS NULL
        OR d.id_proyecto = s.id_proyecto
      )
      AND (
        (
          COALESCE(d.id_proyecto, s.id_proyecto) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM usuario_proyectos up
            WHERE up.id_usuario = ?
              AND up.id_proyecto =
                COALESCE(d.id_proyecto, s.id_proyecto)
          )
        )
        OR (
          COALESCE(d.id_proyecto, s.id_proyecto) IS NULL
          AND COALESCE(d.id_area, s.id_area) = ?
          AND (
            d.id_area IS NULL
            OR s.id_area IS NULL
            OR d.id_area = s.id_area
          )
        )
      )
    `,
    parametros: [usuario.id_usuario, usuario.id_area]
  };
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

    const [filas] = await pool.query(
      `
        ${consultaDocumentos}
        WHERE ${filtro.sql}
        ORDER BY d.fecha_subida DESC, d.id_documento DESC
        LIMIT ? OFFSET ?
      `,
      [...filtro.parametros, 101, (pagina - 1) * 100]
    );

    const documentos = filas.slice(0, 100).map((fila) => {
      const { ruta_nube, ...datos } = fila;
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
    const [carpetas] = await pool.query(
      `
        SELECT
          c.id_carpeta,
          c.nombre_carpeta,
          s.id_proyecto,
          p.nombre_proyecto,
          s.id_area,
          a.nombre_area
        FROM carpetas_documentos c
        INNER JOIN servicios_proyectos s
          ON s.id_servicio = c.id_servicio
        INNER JOIN areas a
          ON a.id_area = s.id_area
        LEFT JOIN proyectos p
          ON p.id_proyecto = s.id_proyecto
        WHERE s.estado = 1
          AND a.estado = 1
          AND c.id_carpeta_padre IS NULL
          AND (
            ? = 1
            OR (
              s.id_proyecto IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM usuario_proyectos up
                WHERE up.id_usuario = ?
                  AND up.id_proyecto = s.id_proyecto
              )
            )
            OR (
              s.id_proyecto IS NULL
              AND s.id_area = ?
            )
          )
        ORDER BY
          p.nombre_proyecto,
          a.nombre_area,
          c.nombre_carpeta
      `,
      [
        req.usuario.nombre_rol === "Administrador" ? 1 : 0,
        req.usuario.id_usuario,
        req.usuario.id_area
      ]
    );

    res.json({ success: true, carpetas });
  } catch (error) {
    responderError(res, error);
  }
};

async function comprobarDestino(conexion, idCarpeta, usuario, bloquear) {
  if (!idValido(idCarpeta)) {
    throw fallo(400, "Selecciona una carpeta válida.");
  }

  const [carpetas] = await conexion.query(
    `
      SELECT
        c.id_carpeta,
        c.nombre_carpeta,
        c.id_drive,
        c.id_carpeta_padre,
        s.id_proyecto,
        s.id_area
      FROM carpetas_documentos c
      INNER JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      INNER JOIN areas a
        ON a.id_area = s.id_area
      WHERE c.id_carpeta = ?
        AND s.estado = 1
        AND a.estado = 1
      ${bloquear ? "FOR UPDATE" : ""}
    `,
    [Number(idCarpeta)]
  );

  if (!carpetas.length) {
    throw fallo(404, "La carpeta no está disponible.");
  }

  const carpeta = carpetas[0];

  if (carpeta.id_carpeta_padre !== null) {
    throw fallo(
      409,
      "La subida a subcarpetas todavía no está habilitada."
    );
  }

  if (usuario.nombre_rol === "Administrador") {
    return carpeta;
  }

  if (carpeta.id_proyecto !== null) {
    const [asignaciones] = await conexion.query(
      `
        SELECT id_usuario
        FROM usuario_proyectos
        WHERE id_usuario = ?
          AND id_proyecto = ?
        ${bloquear ? "FOR UPDATE" : ""}
      `,
      [usuario.id_usuario, carpeta.id_proyecto]
    );

    if (!asignaciones.length) {
      throw fallo(403, "No tienes permiso para subir a este proyecto.");
    }
  } else if (Number(carpeta.id_area) !== Number(usuario.id_area)) {
    throw fallo(403, "Solo puedes subir documentos a tu área.");
  }

  return carpeta;
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
  const raiz = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

  if (!raiz || !process.env.GOOGLE_REFRESH_TOKEN?.trim()) {
    throw fallo(503, "La conexión con Drive no está configurada.");
  }

  const idConsultar = carpeta.id_drive || raiz;

  const { data } = await drive.files.get(
    {
      fileId: idConsultar,
      fields: "id,mimeType,trashed,parents,capabilities(canAddChildren)"
    },
    { timeout: 20000, retry: false }
  );

  if (
    data.trashed ||
    data.mimeType !== "application/vnd.google-apps.folder" ||
    data.capabilities?.canAddChildren !== true
  ) {
    throw fallo(409, "La carpeta de Drive no permite agregar archivos.");
  }

  if (carpeta.id_drive) {
    if (!data.parents?.includes(raiz)) {
      throw fallo(
        409,
        "La carpeta de Drive no está dentro de la raíz de COEMSA."
      );
    }

    return carpeta.id_drive;
  }

  const respuesta = await drive.files.create(
    {
      requestBody: {
        name: "Carpeta " + carpeta.id_carpeta + " - " + carpeta.nombre_carpeta,
        mimeType: "application/vnd.google-apps.folder",
        parents: [raiz],
        appProperties: {
          coemsa_carpeta: String(carpeta.id_carpeta)
        }
      },
      fields: "id"
    },
    { timeout: 30000, retry: false }
  );

  const idDrive = respuesta.data.id;

  if (!idDrive) {
    throw fallo(503, "Drive no devolvió el ID de la carpeta.");
  }

  // Permite recuperar una carpeta si falla el guardado posterior.
  console.log("Carpeta Drive creada:", carpeta.id_carpeta, idDrive);

  await conexion.query(
    `
      UPDATE carpetas_documentos
      SET id_drive = ?
      WHERE id_carpeta = ?
    `,
    [idDrive, carpeta.id_carpeta]
  );

  return idDrive;
}

// =====================================
// SUBIR PDF + REGISTRAR EN MYSQL
// =====================================

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
          'inline; filename="documento-' + documento.id_documento + '.pdf"',
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