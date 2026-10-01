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

function seccionSupervisor(idArea) {

  const area =
    Number(idArea);


  if (
    area === 1 ||
    area === 3
  ) {
    return "administracion";
  }


  if (area === 2) {
    return "servicios";
  }


  if (area === 4) {
    return "logistica";
  }


  if (area === 5) {
    return "seguridad";
  }


  return null;
}


function filtroServicioSupervisor(idArea) {

  const area =
    Number(idArea);


  /*
   * Recursos Humanos + Administración
   */
  if (
    area === 1 ||
    area === 3
  ) {

    return {
      sql:
        "s.id_proyecto IS NULL AND s.id_area IN (1, 3)",
      parametros: []
    };
  }


  /*
   * Servicios y Proyectos.
   *
   * Todo proyecto se presenta dentro de esta sección,
   * incluso si algún registro antiguo conserva otra área.
   */
  if (area === 2) {

    return {
      sql:
        "(s.id_proyecto IS NOT NULL OR (s.id_proyecto IS NULL AND s.id_area = 2))",
      parametros: []
    };
  }


  /*
   * Logística
   */
  if (area === 4) {

    return {
      sql:
        "s.id_proyecto IS NULL AND s.id_area = 4",
      parametros: []
    };
  }


  /*
   * Seguridad
   */
  if (area === 5) {

    return {
      sql:
        "s.id_proyecto IS NULL AND s.id_area = 5",
      parametros: []
    };
  }


  /*
   * Área desconocida:
   * no entregar carpetas.
   */
  return {
    sql: "1 = 0",
    parametros: []
  };
}


function filtroDocumentoSupervisor(usuario) {

  if (
    !usuario ||
    usuario.nombre_rol !==
      "Supervisor"
  ) {

    return {
      sql: "1 = 1",
      parametros: []
    };
  }


  const area =
    Number(
      usuario.id_area
    );


  const proyecto =
    "COALESCE(d.id_proyecto, s.id_proyecto)";

  const areaDocumento =
    "COALESCE(d.id_area, s.id_area)";


  if (
    area === 1 ||
    area === 3
  ) {

    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " IN (1, 3)",
      parametros: []
    };
  }


  if (area === 2) {

    return {
      sql:
        "(" +
        proyecto +
        " IS NOT NULL OR (" +
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 2))",
      parametros: []
    };
  }


  if (area === 4) {

    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 4",
      parametros: []
    };
  }


  if (area === 5) {

    return {
      sql:
        proyecto +
        " IS NULL AND " +
        areaDocumento +
        " = 5",
      parametros: []
    };
  }


  return {
    sql: "1 = 0",
    parametros: []
  };
}


exports.consultar = async (req, res) => {
  try {
    const usuario = req.usuario;

    // El Administrador conserva acceso completo.
    // El Supervisor consulta únicamente su sección.
    // El comportamiento actual del rol Usuario se conserva.
    const esUsuario = false;

    const esAdministrador =
      usuario.nombre_rol === "Administrador";

    const esSupervisor =
      usuario.nombre_rol === "Supervisor";

    const seccionPermitidaSupervisor =
      esSupervisor
        ? seccionSupervisor(
            usuario.id_area
          )
        : null;

    // Los clientes y las unidades se consultan directamente.
    // Así aparecen aunque todavía no tengan proyectos o carpetas.
    const [clientes] = await pool.query(`
      SELECT
        id_cliente,
        nombre_cliente,
        estado
      FROM clientes
      WHERE estado = 1
      ORDER BY id_cliente
    `);

    const [unidades] = await pool.query(`
      SELECT
        id_unidad,
        id_cliente,
        nombre_unidad,
        estado
      FROM unidades_clientes
      WHERE estado = 1
      ORDER BY id_cliente, id_unidad
    `);

    const parametros = [
      esAdministrador ? 1 : 0,
      usuario.id_usuario,
      usuario.id_area
    ];

    // Administrador: todas las carpetas.
    // Supervisor: únicamente su sección.
    // Usuario: se conserva el comportamiento actual.
    let filtro = "";

    if (esSupervisor) {

      const accesoSupervisor =
        filtroServicioSupervisor(
          usuario.id_area
        );

      filtro =
        "WHERE (" +
        accesoSupervisor.sql +
        ")";

      parametros.push(
        ...accesoSupervisor.parametros
      );

    } else if (esUsuario) {

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

      parametros.push(
        usuario.id_usuario,
        usuario.id_area
      );
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
      const seccion =
        fila.id_proyecto !== null
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

        puede_subir:
          Number(fila.permiso_subida) === 1 &&
          fila.id_carpeta_padre === null
      };
    });

    const disponibles = secciones
      .filter((seccion) => {

        if (esSupervisor) {
          return (
            seccion.clave ===
            seccionPermitidaSupervisor
          );
        }

        return (
          !esUsuario ||
          seccion.areas.includes(
            Number(usuario.id_area)
          ) ||
          carpetas.some(
            (carpeta) =>
              carpeta.seccion ===
              seccion.clave
          )
        );
      })
      .map(({ clave, nombre }) => ({
        clave,
        nombre
      }));

    if (
      carpetas.some(
        (c) => c.seccion === "sin_clasificar"
      )
    ) {
      disponibles.push({
        clave: "sin_clasificar",
        nombre: "Pendientes de clasificación"
      });
    }

    const mostrarClientes =
      !esSupervisor ||
      seccionPermitidaSupervisor ===
        "servicios";

    return res.json({
      success: true,
      secciones: disponibles,
      clientes:
        mostrarClientes
          ? clientes
          : [],
      unidades:
        mostrarClientes
          ? unidades
          : [],
      carpetas
    });

  } catch (error) {
    console.error(
      "Error consultando organización:",
      error.code || "ERROR_INTERNO"
    );

    return res.status(500).json({
      success: false,
      mensaje:
        "No se pudo cargar la organización de carpetas."
    });
  }
};

// Búsqueda general para las cuentas activas autorizadas por la ruta.
exports.buscarGeneral = async (req, res) => {
  const termino =
    typeof req.query.q === "string"
      ? req.query.q.trim()
      : "";

  const pagina = Number(
    req.query.pagina || 1
  );

  if (
    termino.length < 2 ||
    termino.length > 150 ||
    !Number.isSafeInteger(pagina) ||
    pagina < 1 ||
    pagina > 1000000
  ) {
    return res.status(400).json({
      success: false,
      mensaje:
        "Escribe entre 2 y 150 caracteres y una página válida."
    });
  }

  try {

    const accesoSupervisor =
      filtroDocumentoSupervisor(
        req.usuario
      );

    const [filas] = await pool.query(`
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
        CONCAT_WS(
          ' ',
          u.nombre,
          u.apellido
        ) AS subido_por
      FROM documentos d
      LEFT JOIN carpetas_documentos c
        ON c.id_carpeta = d.id_carpeta
      LEFT JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      LEFT JOIN proyectos p
        ON p.id_proyecto =
          COALESCE(
            d.id_proyecto,
            s.id_proyecto
          )
      LEFT JOIN areas a
        ON a.id_area =
          COALESCE(
            d.id_area,
            s.id_area
          )
      LEFT JOIN proyecto_unidad pu
        ON pu.id_proyecto = p.id_proyecto
      LEFT JOIN unidades_clientes uc
        ON uc.id_unidad = pu.id_unidad
      LEFT JOIN clientes cl
        ON cl.id_cliente = uc.id_cliente
      LEFT JOIN usuarios u
        ON u.id_usuario = d.id_usuario
      WHERE (
        ${accesoSupervisor.sql}
      )
        AND INSTR(
        LOWER(
          CONCAT_WS(
            ' ',
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
          )
        ),
        LOWER(?)
      ) > 0
      ORDER BY
        d.fecha_subida DESC,
        d.id_documento DESC
      LIMIT 101 OFFSET ?
    `, [
      termino,
      (pagina - 1) * 100
    ]);

    return res.json({
      success: true,
      documentos: filas.slice(0, 100),
      pagina,
      hay_mas: filas.length > 100
    });

  } catch (error) {
    console.error(
      "Error búsqueda general:",
      error.code || "ERROR_INTERNO"
    );

    return res.status(500).json({
      success: false,
      mensaje:
        "No se pudo completar la búsqueda."
    });
  }
};