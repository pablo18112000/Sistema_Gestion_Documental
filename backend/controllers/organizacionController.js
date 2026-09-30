const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 20,
  connectTimeout: 10000
});

// Agrupación visual.
// Administración y Recursos Humanos se muestran juntos,
// pero esta agrupación no amplía los permisos existentes.
const secciones = [
  {
    clave: "administracion",
    nombre: "Administración y Recursos Humanos",
    areas: [1, 3]
  },
  {
    clave: "servicios",
    nombre: "Servicios y Proyectos",
    areas: [2]
  },
  {
    clave: "logistica",
    nombre: "Logística",
    areas: [4]
  },
  {
    clave: "seguridad",
    nombre: "Seguridad",
    areas: [5]
  }
];

exports.consultar = async (req, res) => {
  try {
    const usuario = req.usuario;

    const esUsuario = usuario.nombre_rol === "Usuario";
    const esAdministrador =
      usuario.nombre_rol === "Administrador";

    const parametros = [
      esAdministrador ? 1 : 0,
      usuario.id_usuario,
      usuario.id_area
    ];

    // Administrador y Supervisor pueden consultar todas las carpetas.
    // Usuario: solo su área o los proyectos asignados.
    let filtro = "";

    if (esUsuario) {
      filtro = `
        WHERE (
          (
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
      `;

      parametros.push(usuario.id_usuario, usuario.id_area);
    }

    const [filas] = await pool.query(`
      SELECT
        c.id_carpeta,
        c.nombre_carpeta,
        c.id_carpeta_padre,
        s.id_servicio,
        s.id_area,
        a.nombre_area,
        s.id_proyecto,
        p.nombre_proyecto,
        uc.id_unidad,
        uc.nombre_unidad,
        cl.id_cliente,
        cl.nombre_cliente,
        CASE
          WHEN s.estado = 1
            AND a.estado = 1
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
          THEN 1
          ELSE 0
        END AS permiso_subida
      FROM carpetas_documentos c
      INNER JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      INNER JOIN areas a
        ON a.id_area = s.id_area
      LEFT JOIN proyectos p
        ON p.id_proyecto = s.id_proyecto
      LEFT JOIN proyecto_unidad pu
        ON pu.id_proyecto = p.id_proyecto
      LEFT JOIN unidades_clientes uc
        ON uc.id_unidad = pu.id_unidad
      LEFT JOIN clientes cl
        ON cl.id_cliente = uc.id_cliente
      ${filtro}
      ORDER BY
        cl.nombre_cliente,
        uc.nombre_unidad,
        p.nombre_proyecto,
        c.nombre_carpeta,
        c.id_carpeta
      LIMIT 10001
    `, parametros);

    if (filas.length > 10000) {
      return res.status(409).json({
        success: false,
        mensaje:
          "La organización supera 10000 carpetas. Se necesita paginar la consulta."
      });
    }

    const carpetas = filas.map((fila) => {
      // Los proyectos se presentan en Servicios y Proyectos,
      // aunque un registro antiguo tenga otra área.
      // Esto no cambia sus permisos ni su área en MySQL.
      const seccion = fila.id_proyecto !== null
        ? "servicios"
        : secciones.find((item) =>
            item.areas.includes(Number(fila.id_area))
          )?.clave || "sin_clasificar";

      return {
        id_carpeta: fila.id_carpeta,
        nombre_carpeta: fila.nombre_carpeta,
        id_carpeta_padre: fila.id_carpeta_padre,
        id_servicio: fila.id_servicio,
        id_area: fila.id_area,
        nombre_area: fila.nombre_area,
        id_proyecto: fila.id_proyecto,
        nombre_proyecto: fila.nombre_proyecto,
        id_cliente: fila.id_cliente,
        nombre_cliente: fila.nombre_cliente,
        id_unidad: fila.id_unidad,
        nombre_unidad: fila.nombre_unidad,
        seccion,

        // El controlador actual todavía permite subir
        // únicamente a carpetas principales.
        puede_subir:
          Number(fila.permiso_subida) === 1 &&
          fila.id_carpeta_padre === null
      };
    });

    const disponibles = secciones
      .filter((seccion) =>
        !esUsuario ||
        seccion.areas.includes(Number(usuario.id_area)) ||
        carpetas.some((carpeta) =>
          carpeta.seccion === seccion.clave
        )
      )
      .map(({ clave, nombre }) => ({ clave, nombre }));

    if (carpetas.some((c) => c.seccion === "sin_clasificar")) {
      disponibles.push({
        clave: "sin_clasificar",
        nombre: "Pendientes de clasificación"
      });
    }

    return res.json({
      success: true,
      secciones: disponibles,
      carpetas
    });
  } catch (error) {
    console.error(
      "Error consultando organización:",
      error.code || "ERROR_INTERNO"
    );

    return res.status(500).json({
      success: false,
      mensaje: "No se pudo cargar la organización de carpetas."
    });
  }
};