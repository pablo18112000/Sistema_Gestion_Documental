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

    const esSupervisor =
      req.usuario.nombre_rol === "Supervisor";

    const esSupervisorServicios =
      esSupervisor &&
      Number(req.usuario.id_area) === 2;

    // Los proyectos pertenecen a Servicios y Proyectos.
    // Supervisores de otras áreas no pueden consultar este módulo.
    if (
      esSupervisor &&
      !esSupervisorServicios
    ) {
      return res.status(403).json({
        success: false,
        mensaje:
          "Este módulo corresponde a Servicios y Proyectos."
      });
    }

    const [proyectos] = await pool.query(`
      SELECT
        p.id_proyecto,
        p.nombre_proyecto,
        p.descripcion,
        p.fecha_creacion,

        GROUP_CONCAT(
          DISTINCT cl.nombre_cliente
          ORDER BY cl.nombre_cliente
          SEPARATOR ', '
        ) AS nombre_cliente,

        GROUP_CONCAT(
          DISTINCT uc.nombre_unidad
          ORDER BY uc.nombre_unidad
          SEPARATOR ', '
        ) AS nombre_unidad,

        CASE
          WHEN ? = 1 OR up.id_usuario IS NOT NULL THEN 1
          ELSE 0
        END AS puede_subir

      FROM proyectos p

      LEFT JOIN usuario_proyectos up
        ON up.id_proyecto = p.id_proyecto
        AND up.id_usuario = ?

      LEFT JOIN proyecto_unidad pu
        ON pu.id_proyecto = p.id_proyecto

      LEFT JOIN unidades_clientes uc
        ON uc.id_unidad = pu.id_unidad

      LEFT JOIN clientes cl
        ON cl.id_cliente = uc.id_cliente

      ${esUsuario ? "WHERE up.id_usuario IS NOT NULL" : ""}

      GROUP BY
        p.id_proyecto,
        p.nombre_proyecto,
        p.descripcion,
        p.fecha_creacion,
        up.id_usuario

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
// UBICACIONES DISPONIBLES PARA PROYECTOS
// =====================================

router.get(
  "/ubicaciones",
  permitirRoles(
    "Administrador",
    "Supervisor"
  ),
  async (req, res) => {
    try {

      const esAdministrador =
        req.usuario.nombre_rol ===
        "Administrador";

      const esSupervisorServicios =
        req.usuario.nombre_rol ===
          "Supervisor" &&
        Number(req.usuario.id_area) === 2;

      if (
        !esAdministrador &&
        !esSupervisorServicios
      ) {
        return res.status(403).json({
          success: false,
          mensaje:
            "Solo Servicios y Proyectos puede crear proyectos."
        });
      }

      const [ubicaciones] =
        await pool.query(`
          SELECT
            cl.id_cliente,
            cl.nombre_cliente,
            uc.id_unidad,
            uc.nombre_unidad
          FROM clientes cl

          LEFT JOIN unidades_clientes uc
            ON uc.id_cliente =
               cl.id_cliente
            AND uc.estado = 1

          WHERE cl.estado = 1

          ORDER BY
            CASE
              WHEN UPPER(cl.nombre_cliente) = 'VOLCAN' THEN 1
              WHEN UPPER(cl.nombre_cliente) = 'NEXA' THEN 2
              WHEN UPPER(cl.nombre_cliente) = 'KOLPA' THEN 3
              WHEN UPPER(cl.nombre_cliente) = 'LINCUNA' THEN 4
              WHEN UPPER(cl.nombre_cliente) = 'OREX' THEN 5
              WHEN UPPER(cl.nombre_cliente) = 'YAURICOCHA' THEN 6
              WHEN UPPER(cl.nombre_cliente) = 'COLQUISIRI' THEN 7
              WHEN UPPER(cl.nombre_cliente) = 'HOSPITAL' THEN 8
              WHEN UPPER(cl.nombre_cliente) = 'OTROS' THEN 9
              ELSE 99
            END,
            cl.nombre_cliente,
            uc.id_unidad
        `);

      return res.json({
        success: true,
        ubicaciones
      });

    } catch (error) {

      console.error(
        "Error consultando ubicaciones:",
        error.code ||
          "ERROR_MYSQL"
      );

      return res.status(500).json({
        success: false,
        mensaje:
          "No se pudieron cargar clientes y unidades."
      });
    }
  }
);


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

    const idUnidad =
      Number(
        req.body?.id_unidad
      );

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

    if (
      !Number.isSafeInteger(idUnidad) ||
      idUnidad < 1 ||
      idUnidad > 2147483647
    ) {
      return res.status(400).json({
        success: false,
        mensaje:
          "Selecciona una unidad o lugar válido."
      });
    }

    const idUsuario =
      req.usuario.id_usuario;

    const esAdministrador =
      req.usuario.nombre_rol ===
      "Administrador";

    const esSupervisorServicios =
      req.usuario.nombre_rol ===
        "Supervisor" &&
      Number(req.usuario.id_area) === 2;

    if (
      !esAdministrador &&
      !esSupervisorServicios
    ) {
      return res.status(403).json({
        success: false,
        mensaje:
          "Solo Servicios y Proyectos puede crear proyectos."
      });
    }

    // Todos los proyectos de esta pantalla
    // pertenecen a Servicios y Proyectos.
    const idArea = 2;

    let conexion;

    try {
      conexion = await pool.getConnection();

      const [ubicaciones] =
        await conexion.query(
          `
            SELECT
              uc.id_unidad,
              uc.nombre_unidad,
              cl.id_cliente,
              cl.nombre_cliente
            FROM unidades_clientes uc
            INNER JOIN clientes cl
              ON cl.id_cliente =
                 uc.id_cliente
            WHERE uc.id_unidad = ?
              AND uc.estado = 1
              AND cl.estado = 1
            LIMIT 1
          `,
          [idUnidad]
        );

      if (!ubicaciones.length) {
        return res.status(400).json({
          success: false,
          mensaje:
            "La unidad seleccionada ya no está disponible."
        });
      }

      const ubicacion =
        ubicaciones[0];

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

      // Relacionar el proyecto con la unidad seleccionada.
      await conexion.query(
        `
          INSERT INTO proyecto_unidad (
            id_proyecto,
            id_unidad
          )
          VALUES (?, ?)
        `,
        [
          idProyecto,
          idUnidad
        ]
      );

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

          id_cliente:
            ubicacion.id_cliente,

          nombre_cliente:
            ubicacion.nombre_cliente,

          id_unidad:
            ubicacion.id_unidad,

          nombre_unidad:
            ubicacion.nombre_unidad,

          id_servicio:
            servicio.insertId,

          id_carpeta:
            carpeta.insertId
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