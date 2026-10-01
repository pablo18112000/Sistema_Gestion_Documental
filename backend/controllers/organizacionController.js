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


/*
 * =====================================
 * CREAR EXPEDIENTE DE TRABAJADOR
 * =====================================
 *
 * Estructura:
 *
 * Personal
 * └── CODIGO_APELLIDOS_NOMBRES
 *     ├── Contratos
 *     ├── Vacaciones y Permisos
 *     ├── Capacitaciones
 *     └── Documentos Laborales
 *
 * Puede crear:
 * - Administrador
 * - Supervisor de Recursos Humanos
 */
exports.crearTrabajador = async (req, res) => {

  const rol =
    req.usuario?.nombre_rol;

  const area =
    Number(req.usuario?.id_area);

  const autorizado =
    rol === "Administrador" ||
    (
      rol === "Supervisor" &&
      area === 1
    );

  if (!autorizado) {
    return res.status(403).json({
      success: false,
      mensaje:
        "Solo el Administrador o el Supervisor de Recursos Humanos puede crear trabajadores."
    });
  }

  const entrada =
    typeof req.body?.nombre_trabajador === "string"
      ? req.body.nombre_trabajador
      : "";

  const nombre =
    entrada
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");

  /*
   * Formato esperado:
   * 60006489_FLORES_PEDRO
   *
   * También permite nombres compuestos:
   * 60006489_FLORES_GARCIA_PEDRO_LUIS
   */
  const formato =
    /^[0-9]{4,20}(?:_[A-ZÁÉÍÓÚÑ-]{1,40}){2,10}$/u;

  if (
    !nombre ||
    [...nombre].length > 150 ||
    !formato.test(nombre)
  ) {
    return res.status(400).json({
      success: false,
      mensaje:
        "Usa el formato CODIGO_APELLIDOS_NOMBRES. Ejemplo: 60006489_FLORES_PEDRO."
    });
  }

  const categorias = [
    "Contratos",
    "Vacaciones y Permisos",
    "Capacitaciones",
    "Documentos Laborales"
  ];

  let conexion;

  try {

    conexion =
      await pool.getConnection();

    await conexion.beginTransaction();

    /*
     * Buscar y bloquear la carpeta Personal correcta.
     * No se acepta un ID enviado desde el navegador.
     */
    const [personales] =
      await conexion.query(`
        SELECT
          c.id_carpeta,
          c.id_servicio
        FROM carpetas_documentos c

        INNER JOIN carpetas_documentos padre
          ON padre.id_carpeta = c.id_carpeta_padre
          AND padre.id_servicio = c.id_servicio

        INNER JOIN servicios_proyectos s
          ON s.id_servicio = c.id_servicio

        INNER JOIN areas a
          ON a.id_area = s.id_area

        WHERE s.id_area = 1
          AND s.id_proyecto IS NULL
          AND s.estado = 1
          AND a.estado = 1

          AND c.nombre_carpeta = 'Personal'

          AND padre.nombre_carpeta =
            'Recursos Humanos'

          AND padre.id_carpeta_padre IS NULL

        FOR UPDATE
      `);

    if (personales.length !== 1) {
      const error =
        new Error(
          "No se encontró una única carpeta Personal de Recursos Humanos."
        );

      error.status = 409;
      throw error;
    }

    const personal =
      personales[0];

    /*
     * Evitar dos trabajadores con el mismo nombre.
     * Personal está bloqueada dentro de la transacción.
     */
    const [existentes] =
      await conexion.query(`
        SELECT
          id_carpeta
        FROM carpetas_documentos
        WHERE id_servicio = ?
          AND id_carpeta_padre = ?
          AND nombre_carpeta = ?
        FOR UPDATE
      `, [
        personal.id_servicio,
        personal.id_carpeta,
        nombre
      ]);

    if (existentes.length) {
      const error =
        new Error(
          "Ya existe un trabajador con ese código y nombre."
        );

      error.status = 409;
      throw error;
    }

    /*
     * Crear carpeta principal del trabajador.
     */
    const [trabajador] =
      await conexion.query(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, ?, NULL)
      `, [
        personal.id_servicio,
        nombre,
        "Expediente personal del trabajador",
        personal.id_carpeta
      ]);

    /*
     * Crear automáticamente las cuatro categorías.
     */
    for (const categoria of categorias) {

      await conexion.query(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, ?, NULL)
      `, [
        personal.id_servicio,
        categoria,
        "Documentación de " + categoria,
        trabajador.insertId
      ]);

    }

    await conexion.commit();

    return res.status(201).json({
      success: true,

      mensaje:
        "Trabajador creado correctamente con sus cuatro carpetas.",

      trabajador: {
        id_carpeta:
          trabajador.insertId,

        nombre_carpeta:
          nombre,

        categorias
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
      "Error creando trabajador:",
      error.code ||
      error.status ||
      "ERROR_INTERNO"
    );

    const estado =
      [400, 403, 409].includes(
        Number(error.status)
      )
        ? Number(error.status)
        : 500;

    return res.status(estado).json({
      success: false,

      mensaje:
        estado === 500
          ? "No se pudo crear el trabajador. Revisa la lista antes de repetir."
          : error.message
    });

  } finally {

    if (conexion) {
      conexion.release();
    }

  }
};


/*
 * =====================================
 * CREAR CARPETA DENTRO DE UN TRABAJADOR
 * =====================================
 *
 * Solo permite crear dentro de:
 *
 * Recursos Humanos
 * └── Personal
 *     └── TRABAJADOR
 *         └── NUEVA CARPETA
 *
 * No admite proyectos ni otras áreas.
 */
exports.crearCarpetaTrabajador = async (req, res) => {

  const rol =
    req.usuario?.nombre_rol;

  const area =
    Number(req.usuario?.id_area);

  const autorizado =
    rol === "Administrador" ||
    (
      rol === "Supervisor" &&
      area === 1
    );

  if (!autorizado) {
    return res.status(403).json({
      success: false,
      mensaje:
        "Solo el Administrador o el Supervisor de Recursos Humanos puede crear carpetas de trabajadores."
    });
  }

  const idTrabajador =
    Number(
      req.params.idTrabajador
    );

  if (
    !Number.isSafeInteger(
      idTrabajador
    ) ||
    idTrabajador < 1 ||
    idTrabajador > 2147483647
  ) {
    return res.status(400).json({
      success: false,
      mensaje:
        "El trabajador seleccionado no es válido."
    });
  }

  const entrada =
    typeof req.body?.nombre_carpeta ===
      "string"
      ? req.body.nombre_carpeta
      : "";

  const nombre =
    entrada
      .trim()
      .replace(/\s+/g, " ");

  if (
    !nombre ||
    [...nombre].length > 100 ||
    /[\\/\u0000-\u001f]/.test(nombre) ||
    nombre === "." ||
    nombre === ".."
  ) {
    return res.status(400).json({
      success: false,
      mensaje:
        "Escribe un nombre de carpeta de hasta 100 caracteres, sin barras ni saltos de línea."
    });
  }

  let conexion;

  try {

    conexion =
      await pool.getConnection();

    await conexion.beginTransaction();

    /*
     * Verificar que el ID recibido sea exactamente
     * una carpeta de trabajador dentro de Personal.
     */
    const [trabajadores] =
      await conexion.query(`
        SELECT
          trabajador.id_carpeta,
          trabajador.id_servicio,
          trabajador.nombre_carpeta,

          personal.id_carpeta
            AS id_personal

        FROM carpetas_documentos trabajador

        INNER JOIN carpetas_documentos personal
          ON personal.id_carpeta =
             trabajador.id_carpeta_padre
          AND personal.id_servicio =
              trabajador.id_servicio

        INNER JOIN carpetas_documentos rrhh
          ON rrhh.id_carpeta =
             personal.id_carpeta_padre
          AND rrhh.id_servicio =
              trabajador.id_servicio

        INNER JOIN servicios_proyectos s
          ON s.id_servicio =
             trabajador.id_servicio

        INNER JOIN areas a
          ON a.id_area =
             s.id_area

        WHERE trabajador.id_carpeta = ?

          AND s.id_area = 1
          AND s.id_proyecto IS NULL
          AND s.estado = 1
          AND a.estado = 1

          AND personal.nombre_carpeta =
            'Personal'

          AND rrhh.nombre_carpeta =
            'Recursos Humanos'

          AND rrhh.id_carpeta_padre
            IS NULL

        FOR UPDATE
      `, [
        idTrabajador
      ]);

    if (trabajadores.length !== 1) {

      const error =
        new Error(
          "Solo se pueden crear carpetas dentro de un trabajador de Recursos Humanos."
        );

      error.status = 409;

      throw error;
    }

    const trabajador =
      trabajadores[0];

    /*
     * Evitar duplicados dentro del mismo trabajador.
     */
    const [existentes] =
      await conexion.query(`
        SELECT
          id_carpeta
        FROM carpetas_documentos
        WHERE id_servicio = ?
          AND id_carpeta_padre = ?
          AND LOWER(
                TRIM(nombre_carpeta)
              ) = LOWER(?)
        FOR UPDATE
      `, [
        trabajador.id_servicio,
        trabajador.id_carpeta,
        nombre
      ]);

    if (existentes.length) {

      const error =
        new Error(
          "Ya existe una carpeta con ese nombre dentro del trabajador."
        );

      error.status = 409;

      throw error;
    }

    const [resultado] =
      await conexion.query(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, ?, NULL)
      `, [
        trabajador.id_servicio,
        nombre,
        "Carpeta adicional del trabajador",
        trabajador.id_carpeta
      ]);

    await conexion.commit();

    return res.status(201).json({
      success: true,

      mensaje:
        "Carpeta creada correctamente.",

      carpeta: {
        id_carpeta:
          resultado.insertId,

        nombre_carpeta:
          nombre,

        id_carpeta_padre:
          trabajador.id_carpeta
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
      "Error creando carpeta de trabajador:",
      error.code ||
      error.status ||
      "ERROR_INTERNO"
    );

    const estado =
      [400, 403, 409].includes(
        Number(error.status)
      )
        ? Number(error.status)
        : 500;

    return res.status(estado).json({
      success: false,

      mensaje:
        estado === 500
          ? "No se pudo crear la carpeta. Revisa el resultado antes de repetir."
          : error.message
    });

  } finally {

    if (conexion) {
      conexion.release();
    }

  }
};


/*
 * =====================================
 * CREAR CARPETA EN ADMINISTRACIÓN / RRHH
 * =====================================
 *
 * Permite crear solamente dentro de:
 *
 * Administración
 * o
 * Recursos Humanos
 *
 * Ambos son servicios independientes
 * y obligatoriamente sin proyecto.
 */
exports.crearCarpetaAdministracionRRHH =
async (req, res) => {

  const idPadre =
    Number(
      req.params.idPadre
    );

  if (
    !Number.isSafeInteger(
      idPadre
    ) ||
    idPadre < 1 ||
    idPadre > 2147483647
  ) {

    return res.status(400).json({
      success: false,
      mensaje:
        "La carpeta seleccionada no es válida."
    });

  }

  const entrada =
    typeof req.body?.nombre_carpeta ===
      "string"
      ? req.body.nombre_carpeta
      : "";

  const nombre =
    entrada
      .trim()
      .replace(/\s+/g, " ");

  if (
    !nombre ||
    [...nombre].length > 100 ||
    /[\\/\u0000-\u001f]/.test(
      nombre
    ) ||
    nombre === "." ||
    nombre === ".."
  ) {

    return res.status(400).json({
      success: false,
      mensaje:
        "Escribe un nombre de carpeta de hasta 100 caracteres, sin barras ni saltos de línea."
    });

  }

  if (
    nombre.localeCompare(
      "Otros",
      "es",
      {
        sensitivity: "base"
      }
    ) === 0
  ) {

    return res.status(400).json({
      success: false,
      mensaje:
        "Escribe un nombre específico para la carpeta en lugar de 'Otros'."
    });

  }

  let conexion;

  try {

    conexion =
      await pool.getConnection();

    await conexion.beginTransaction();

    /*
     * El padre debe ser EXCLUSIVAMENTE:
     *
     * área 3 -> Administración
     * área 1 -> Recursos Humanos
     *
     * y jamás puede pertenecer a un proyecto.
     */
    const [padres] =
      await conexion.query(`
        SELECT
          c.id_carpeta,
          c.id_servicio,
          c.nombre_carpeta,

          s.id_area,
          s.id_proyecto

        FROM carpetas_documentos c

        INNER JOIN servicios_proyectos s
          ON s.id_servicio =
             c.id_servicio

        INNER JOIN areas a
          ON a.id_area =
             s.id_area

        WHERE c.id_carpeta = ?

          AND c.id_carpeta_padre
            IS NULL

          AND s.id_proyecto
            IS NULL

          AND s.estado = 1
          AND a.estado = 1

          AND (
            (
              s.id_area = 3
              AND c.nombre_carpeta =
                'Administración'
            )

            OR

            (
              s.id_area = 1
              AND c.nombre_carpeta =
                'Recursos Humanos'
            )
          )

        FOR UPDATE
      `, [
        idPadre
      ]);

    if (
      padres.length !== 1
    ) {

      const error =
        new Error(
          "Solo se pueden crear carpetas directamente en Administración o Recursos Humanos."
        );

      error.status = 409;

      throw error;

    }

    const padre =
      padres[0];

    const rol =
      req.usuario?.nombre_rol;

    const areaUsuario =
      Number(
        req.usuario?.id_area
      );

    /*
     * Administrador:
     * puede crear en ambas áreas.
     *
     * Supervisor:
     * únicamente en su propia área.
     */
    const autorizado =
      rol === "Administrador" ||
      (
        rol === "Supervisor" &&
        areaUsuario ===
          Number(
            padre.id_area
          )
      );

    if (!autorizado) {

      const error =
        new Error(
          "No tienes permiso para crear carpetas en esta área."
        );

      error.status = 403;

      throw error;

    }

    /*
     * Evitar nombres repetidos
     * dentro de la misma carpeta.
     */
    const [existentes] =
      await conexion.query(`
        SELECT
          id_carpeta
        FROM carpetas_documentos

        WHERE id_servicio = ?
          AND id_carpeta_padre = ?

          AND LOWER(
                TRIM(
                  nombre_carpeta
                )
              ) =
              LOWER(?)

        FOR UPDATE
      `, [
        padre.id_servicio,
        padre.id_carpeta,
        nombre
      ]);

    if (
      existentes.length
    ) {

      const error =
        new Error(
          "Ya existe una carpeta con ese nombre."
        );

      error.status = 409;

      throw error;

    }

    const [resultado] =
      await conexion.query(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, ?, NULL)
      `, [
        padre.id_servicio,
        nombre,
        "Carpeta creada desde el archivo documental",
        padre.id_carpeta
      ]);

    await conexion.commit();

    return res.status(201).json({
      success: true,

      mensaje:
        "Carpeta creada correctamente.",

      carpeta: {
        id_carpeta:
          resultado.insertId,

        nombre_carpeta:
          nombre,

        id_carpeta_padre:
          padre.id_carpeta,

        id_area:
          padre.id_area
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
      "Error creando carpeta de Administración/RRHH:",
      error.code ||
      error.status ||
      "ERROR_INTERNO"
    );

    const estado =
      [400, 403, 409].includes(
        Number(
          error.status
        )
      )
        ? Number(
            error.status
          )
        : 500;

    return res.status(estado).json({
      success: false,

      mensaje:
        estado === 500
          ? "No se pudo crear la carpeta. Revisa el resultado antes de repetir."
          : error.message
    });

  } finally {

    if (conexion) {
      conexion.release();
    }

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