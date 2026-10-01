const mysql = require("mysql2/promise");

// Cada revisión usa su propia conexión durante la transacción.
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

function errorHTTP(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function responderError(res, error) {
  console.error(
    "Error en aprobaciones:",
    error.code || error.status || "ERROR_INTERNO"
  );

  const conocido = [400, 401, 403, 404, 409].includes(error.status);

  return res.status(conocido ? error.status : 500).json({
    success: false,
    mensaje: conocido
      ? error.message
      : "No se pudo completar la operación. Actualiza la lista antes de reintentar."
  });
}

function filtroRevision(usuario) {

  if (!usuario) {
    return { sql: "1 = 0" };
  }

  // El Administrador conserva acceso completo.
  if (usuario.nombre_rol === "Administrador") {
    return { sql: "1 = 1" };
  }

  // Esta pantalla solamente admite Administrador o Supervisor.
  if (usuario.nombre_rol !== "Supervisor") {
    return { sql: "1 = 0" };
  }

  const area = Number(usuario.id_area);

  const proyecto =
    "COALESCE(d.id_proyecto, s.id_proyecto)";

  const areaDocumento =
    "COALESCE(d.id_area, s.id_area)";

  // Recursos Humanos + Administración.
  if (area === 1 || area === 3) {
    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " IN (1, 3)"
    };
  }

  // Servicios y Proyectos.
  // Cualquier documento asociado a proyecto pertenece
  // visualmente a esta sección.
  if (area === 2) {
    return {
      sql:
        "(" +
        proyecto +
        " IS NOT NULL OR (" +
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 2))"
    };
  }

  // Logística.
  if (area === 4) {
    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 4"
    };
  }

  // Seguridad.
  if (area === 5) {
    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 5"
    };
  }

  // Un Supervisor sin área reconocida no obtiene documentos.
  return { sql: "1 = 0" };
}

// =====================================
// DOCUMENTOS PENDIENTES
// =====================================

exports.pendientes = async (req, res) => {
  try {
    const acceso = filtroRevision(req.usuario);

    const [filas] = await pool.query(`
      SELECT
        d.id_documento,
        d.nombre_archivo,
        d.fecha_subida,
        d.version,
        d.descripcion,
        d.estado_documento AS estado,
        u.nombre,
        u.apellido,
        u.correo,
        c.nombre_carpeta,
        p.nombre_proyecto,
        a.nombre_area
      FROM documentos d
      LEFT JOIN usuarios u
        ON u.id_usuario = d.id_usuario
      LEFT JOIN carpetas_documentos c
        ON c.id_carpeta = d.id_carpeta
      LEFT JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      LEFT JOIN proyectos p
        ON p.id_proyecto = COALESCE(d.id_proyecto, s.id_proyecto)
      LEFT JOIN areas a
        ON a.id_area = COALESCE(d.id_area, s.id_area)
      WHERE LOWER(TRIM(d.estado_documento)) = 'pendiente'
        AND (${acceso.sql})
      ORDER BY d.fecha_subida ASC, d.id_documento ASC
      LIMIT 201
    `);

    return res.json({
      success: true,
      documentos: filas.slice(0, 200),
      hay_mas: filas.length > 200
    });
  } catch (error) {
    return responderError(res, error);
  }
};

// =====================================
// REGISTRAR UNA DECISIÓN
// =====================================

async function revisarDocumento(req, res, nuevoEstado) {
  const idDocumento = Number(req.params.idDocumento);
  const idRevisor = Number(req.usuario?.id_usuario);
  const acceso = filtroRevision(req.usuario);

  if (
    !Number.isSafeInteger(idDocumento) ||
    idDocumento < 1 ||
    idDocumento > 2147483647
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "El documento indicado no es válido."
    });
  }

  if (!Number.isSafeInteger(idRevisor) || idRevisor < 1) {
    return res.status(401).json({
      success: false,
      mensaje: "Inicia sesión nuevamente."
    });
  }

  const valorComentario = req.body?.comentario;

  if (
    valorComentario !== undefined &&
    typeof valorComentario !== "string"
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "El comentario debe ser un texto."
    });
  }

  let comentario = (valorComentario || "").trim();

  if (Array.from(comentario).length > 255) {
    return res.status(400).json({
      success: false,
      mensaje: "El comentario admite hasta 255 caracteres."
    });
  }

  if (nuevoEstado === "Rechazado" && !comentario) {
    return res.status(400).json({
      success: false,
      mensaje: "Escribe el motivo del rechazo."
    });
  }

  if (!comentario) {
    comentario = "Documento aprobado.";
  }

  let conexion;
  let enTransaccion = false;

  try {
    conexion = await pool.getConnection();

    // Confirma que las tres tablas admitan transacciones.
    const [tablas] = await conexion.query(`
      SELECT TABLE_NAME, ENGINE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'documentos',
          'aprobaciones_documentos',
          'historial_documentos'
        )
    `);

    if (
      tablas.length !== 3 ||
      tablas.some(
        (tabla) => String(tabla.ENGINE).toUpperCase() !== "INNODB"
      )
    ) {
      throw errorHTTP(
        409,
        "Las tablas de revisión deben utilizar InnoDB."
      );
    }

    await conexion.beginTransaction();
    enTransaccion = true;

    // Bloquea este documento hasta terminar la revisión.
    const [documentos] = await conexion.query(
      `
        SELECT
          d.id_documento,
          d.estado_documento,
          d.version
        FROM documentos d
        LEFT JOIN carpetas_documentos c
          ON c.id_carpeta = d.id_carpeta
        LEFT JOIN servicios_proyectos s
          ON s.id_servicio = c.id_servicio
        WHERE d.id_documento = ?
          AND (${acceso.sql})
        FOR UPDATE
      `,
      [idDocumento]
    );

    if (documentos.length === 0) {
      throw errorHTTP(404, "Documento no disponible para tu área.");
    }

    const documento = documentos[0];

    const estadoActual = String(
      documento.estado_documento || ""
    ).trim().toLowerCase();

    if (estadoActual !== "pendiente") {
      throw errorHTTP(
        409,
        "El documento ya no está pendiente. Actualiza la lista."
      );
    }

    const [revisionesPendientes] = await conexion.query(
      `
        SELECT id_aprobacion
        FROM aprobaciones_documentos
        WHERE id_documento = ?
          AND LOWER(TRIM(estado)) = 'pendiente'
        FOR UPDATE
      `,
      [idDocumento]
    );

    if (revisionesPendientes.length > 1) {
      throw errorHTTP(
        409,
        "Este documento tiene varias revisiones pendientes. Requiere revisión del administrador."
      );
    }

    if (revisionesPendientes.length === 1) {
      await conexion.query(
        `
          UPDATE aprobaciones_documentos
          SET
            id_usuario = ?,
            estado = ?,
            comentario = ?,
            fecha_revision = NOW()
          WHERE id_aprobacion = ?
        `,
        [
          idRevisor,
          nuevoEstado,
          comentario,
          revisionesPendientes[0].id_aprobacion
        ]
      );
    } else {
      // Los cinco documentos detectados entrarán aquí
      // cuando un supervisor tome una decisión.
      await conexion.query(
        `
          INSERT INTO aprobaciones_documentos (
            id_documento,
            id_usuario,
            estado,
            comentario,
            fecha_revision
          )
          VALUES (?, ?, ?, ?, NOW())
        `,
        [
          idDocumento,
          idRevisor,
          nuevoEstado,
          comentario
        ]
      );
    }

    await conexion.query(
      `
        UPDATE documentos
        SET
          estado_documento = ?,
          aprobado_por = ?,
          fecha_aprobacion =
            CASE WHEN ? = 'Aprobado' THEN NOW() ELSE NULL END
        WHERE id_documento = ?
      `,
      [
        nuevoEstado,
        nuevoEstado === "Aprobado" ? idRevisor : null,
        nuevoEstado,
        idDocumento
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
        VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [
        idDocumento,
        idRevisor,
        documento.version,
        documento.version,
        nuevoEstado === "Aprobado"
          ? "Aprobación de documento"
          : "Rechazo de documento"
      ]
    );

    await conexion.commit();
    enTransaccion = false;

    return res.json({
      success: true,
      mensaje:
        nuevoEstado === "Aprobado"
          ? "Documento aprobado correctamente."
          : "Documento rechazado correctamente.",
      id_documento: idDocumento,
      estado: nuevoEstado
    });
  } catch (error) {
    if (conexion && enTransaccion) {
      try {
        await conexion.rollback();
      } catch {
        conexion.destroy();
        conexion = null;
      }
    }

    return responderError(res, error);
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
}

exports.aprobarDocumento = (req, res) => {
  return revisarDocumento(req, res, "Aprobado");
};

exports.rechazarDocumento = (req, res) => {
  return revisarDocumento(req, res, "Rechazado");
};

// =====================================
// HISTORIAL DE REVISIONES
// =====================================

exports.historial = async (req, res) => {
  try {
    const acceso = filtroRevision(req.usuario);

    const [filas] = await pool.query(`
      SELECT
        ad.id_aprobacion,
        ad.id_documento,
        ad.estado,
        ad.comentario,
        ad.fecha_revision,
        d.nombre_archivo,
        d.fecha_subida,
        u.nombre,
        u.apellido,
        u.correo
      FROM aprobaciones_documentos ad
      LEFT JOIN documentos d
        ON d.id_documento = ad.id_documento
      LEFT JOIN carpetas_documentos c
        ON c.id_carpeta = d.id_carpeta
      LEFT JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      LEFT JOIN usuarios u
        ON u.id_usuario = d.id_usuario
      WHERE LOWER(TRIM(ad.estado)) IN ('aprobado', 'rechazado')
        AND (${acceso.sql})
      ORDER BY ad.fecha_revision DESC, ad.id_aprobacion DESC
      LIMIT 201
    `);

    return res.json({
      success: true,
      documentos: filas.slice(0, 200),
      hay_mas: filas.length > 200
    });
  } catch (error) {
    return responderError(res, error);
  }
};