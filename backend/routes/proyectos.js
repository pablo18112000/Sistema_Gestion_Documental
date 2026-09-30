const express = require("express");
const mysql = require("mysql2/promise");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

// Conexiones independientes para no mezclar transacciones
// con otras operaciones del servidor.
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 20
});

router.use(
  verificarSesion,
  permitirRoles("Administrador", "Supervisor", "Usuario")
);

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// =====================================
// LISTAR PROYECTOS SEGÚN EL ROL
// =====================================

router.get("/", async (req, res) => {
  try {
    const esUsuario = req.usuario.nombre_rol === "Usuario";
    const esAdministrador =
      req.usuario.nombre_rol === "Administrador";

    const [proyectos] = await pool.query(`
      SELECT
        p.id_proyecto,
        p.nombre_proyecto,
        p.descripcion,
        p.fecha_creacion,
        CASE
          WHEN ? = 1 OR up.id_usuario IS NOT NULL THEN 1
          ELSE 0
        END AS puede_subir
      FROM proyectos p
      LEFT JOIN usuario_proyectos up
        ON up.id_proyecto = p.id_proyecto
        AND up.id_usuario = ?
      ${esUsuario ? "WHERE up.id_usuario IS NOT NULL" : ""}
      ORDER BY p.nombre_proyecto
    `, [
      esAdministrador ? 1 : 0,
      req.usuario.id_usuario
    ]);

    return res.json({
      success: true,
      proyectos
    });
  } catch (error) {
    console.error(
      "Error consultando proyectos:",
      error.code || "ERROR_MYSQL"
    );

    return res.status(500).json({
      success: false,
      mensaje: "No se pudieron cargar los proyectos."
    });
  }
});

// =====================================
// CREAR PROYECTO
// Solo Administrador y Supervisor.
// =====================================

router.post(
  "/",
  permitirRoles("Administrador", "Supervisor"),
  async (req, res) => {
    const nombre = typeof req.body?.nombre_proyecto === "string"
      ? req.body.nombre_proyecto.trim()
      : "";

    const descripcion = typeof req.body?.descripcion === "string"
      ? req.body.descripcion.trim()
      : "";

    if (
      !nombre ||
      [...nombre].length > 100 ||
      /[\\/\u0000-\u001f]/.test(nombre)
    ) {
      return res.status(400).json({
        success: false,
        mensaje:
          "Escribe un nombre de hasta 100 caracteres, sin barras ni saltos de línea."
      });
    }

    if ([...descripcion].length > 255) {
      return res.status(400).json({
        success: false,
        mensaje: "La descripción admite hasta 255 caracteres."
      });
    }

    // El área procede del usuario autenticado.
    // No se acepta un área enviada por el navegador.
    const idArea = req.usuario.id_area;
    const idUsuario = req.usuario.id_usuario;

    let conexion;

    try {
      conexion = await pool.getConnection();
      await conexion.beginTransaction();

      const [areas] = await conexion.query(`
        SELECT id_area
        FROM areas
        WHERE id_area = ? AND estado = 1
      `, [idArea]);

      if (areas.length === 0) {
        await conexion.rollback();

        return res.status(400).json({
          success: false,
          mensaje: "Tu cuenta debe tener un área activa asignada."
        });
      }

      // Crear el proyecto.
      const [proyecto] = await conexion.query(`
        INSERT INTO proyectos (
          nombre_proyecto,
          descripcion
        )
        VALUES (?, ?)
      `, [nombre, descripcion || null]);

      const idProyecto = proyecto.insertId;

      // Crear el servicio inicial dentro del proyecto.
      const [servicio] = await conexion.query(`
        INSERT INTO servicios_proyectos (
          id_area,
          id_proyecto,
          nombre_servicio,
          descripcion,
          estado
        )
        VALUES (?, ?, ?, ?, 1)
      `, [
        idArea,
        idProyecto,
        "Documentación general",
        "Servicio inicial del proyecto"
      ]);

      // Crear el registro de la carpeta principal.
      // id_drive queda vacío hasta conectar Google Drive.
      const [carpeta] = await conexion.query(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, NULL, NULL)
      `, [
        servicio.insertId,
        nombre,
        "Carpeta principal del proyecto"
      ]);

      // Asignar al creador para que pueda subir al proyecto.
      await conexion.query(`
        INSERT INTO usuario_proyectos (
          id_usuario,
          id_proyecto
        )
        VALUES (?, ?)
      `, [idUsuario, idProyecto]);

      await conexion.commit();

      return res.status(201).json({
        success: true,
        mensaje:
          "Proyecto registrado. La conexión de su carpeta con Drive está pendiente.",
        proyecto: {
          id_proyecto: idProyecto,
          nombre_proyecto: nombre,
          id_servicio: servicio.insertId,
          id_carpeta: carpeta.insertId
        }
      });
    } catch (error) {
      if (conexion) {
        try {
          await conexion.rollback();
        } catch {
          conexion.destroy();
          conexion = null;
        }
      }

      console.error(
        "Error creando proyecto:",
        error.code || "ERROR_MYSQL"
      );

      return res.status(500).json({
        success: false,
        mensaje:
          "No se pudo completar la creación. Revisa la lista antes de reintentar."
      });
    } finally {
      if (conexion) {
        conexion.release();
      }
    }
  }
);

module.exports = router;