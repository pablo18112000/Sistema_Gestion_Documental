"use strict";

const mysql = require("mysql2/promise");

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
  const numero = Number(valor);

  return (
    Number.isSafeInteger(numero) &&
    numero > 0 &&
    numero <= 2147483647
  );
}

function nombreValido(nombre) {
  return (
    nombre &&
    [...nombre].length <= 100 &&
    !/[\\/\u0000-\u001f]/.test(nombre) &&
    nombre !== "." &&
    nombre !== ".."
  );
}

async function comprobarArbol(
  conexion,
  carpetaInicial
) {
  let actual = carpetaInicial;
  let profundidad = 1;

  while (actual.id_carpeta_padre !== null) {
    profundidad++;

    /*
     * subcarpetasDrive trabaja con un máximo
     * de 10 niveles. No permitimos superar
     * ese límite.
     */
    if (profundidad > 9) {
      throw fallo(
        409,
        "Esta ubicación alcanzó el límite de profundidad de carpetas."
      );
    }

    const [padres] =
      await conexion.query(`
        SELECT
          c.id_carpeta,
          c.id_carpeta_padre,
          c.id_servicio,
          c.nombre_carpeta
        FROM carpetas_documentos c
        WHERE c.id_carpeta = ?
          AND c.id_servicio = ?
        FOR UPDATE
      `, [
        actual.id_carpeta_padre,
        carpetaInicial.id_servicio
      ]);

    if (padres.length !== 1) {
      throw fallo(
        409,
        "La jerarquía de carpetas no es válida."
      );
    }

    actual = padres[0];
  }

  const area =
    Number(carpetaInicial.id_area);

  const raizEsperada =
    area === 3
      ? "Administración"
      : area === 1
        ? "Recursos Humanos"
        : null;

  if (
    !raizEsperada ||
    actual.nombre_carpeta !== raizEsperada
  ) {
    throw fallo(
      409,
      "Esta carpeta no pertenece a Administración o Recursos Humanos."
    );
  }

  return actual;
}

exports.crear = async (req, res) => {
  const idPadre =
    Number(req.params.idPadre);

  const entrada =
    typeof req.body?.nombre_carpeta === "string"
      ? req.body.nombre_carpeta
      : "";

  const nombre =
    entrada
      .trim()
      .replace(/\s+/g, " ");

  if (!idValido(idPadre)) {
    return res.status(400).json({
      success: false,
      mensaje:
        "La carpeta seleccionada no es válida."
    });
  }

  if (!nombreValido(nombre)) {
    return res.status(400).json({
      success: false,
      mensaje:
        "Escribe un nombre de hasta 100 caracteres, sin barras ni saltos de línea."
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
        "Escribe un nombre específico en lugar de 'Otros'."
    });
  }

  let conexion;

  try {
    conexion =
      await pool.getConnection();

    await conexion.beginTransaction();

    const [padres] =
      await conexion.query(`
        SELECT
          c.id_carpeta,
          c.id_carpeta_padre,
          c.id_servicio,
          c.nombre_carpeta,

          s.id_area,
          s.id_proyecto,
          s.estado AS servicio_activo,

          a.estado AS area_activa

        FROM carpetas_documentos c

        INNER JOIN servicios_proyectos s
          ON s.id_servicio = c.id_servicio

        INNER JOIN areas a
          ON a.id_area = s.id_area

        WHERE c.id_carpeta = ?

        FOR UPDATE
      `, [
        idPadre
      ]);

    if (padres.length !== 1) {
      throw fallo(
        404,
        "La carpeta seleccionada no existe."
      );
    }

    const padre =
      padres[0];

    /*
     * MUY IMPORTANTE:
     * jamás permite crear dentro de proyectos.
     */
    if (
      padre.id_proyecto !== null ||
      ![1, 3].includes(
        Number(padre.id_area)
      )
    ) {
      throw fallo(
        403,
        "Esta función solamente pertenece a Administración y Recursos Humanos."
      );
    }

    if (
      Number(padre.servicio_activo) !== 1 ||
      Number(padre.area_activa) !== 1
    ) {
      throw fallo(
        409,
        "El área o servicio ya no está activo."
      );
    }

    /*
     * Confirmar que realmente desciende de:
     *
     * Administración
     * o
     * Recursos Humanos
     */
    await comprobarArbol(
      conexion,
      padre
    );

    /*
     * Personal tiene su propia operación:
     * Crear trabajador.
     *
     * Evitamos crear carpetas sueltas
     * directamente dentro de Personal.
     */
    if (
      Number(padre.id_area) === 1 &&
      padre.nombre_carpeta === "Personal"
    ) {
      throw fallo(
        409,
        "Dentro de Personal utiliza la opción Crear trabajador."
      );
    }

    const rol =
      req.usuario?.nombre_rol;

    const areaUsuario =
      Number(req.usuario?.id_area);

    const autorizado =
      rol === "Administrador" ||
      (
        rol === "Supervisor" &&
        areaUsuario ===
          Number(padre.id_area)
      );

    if (!autorizado) {
      throw fallo(
        403,
        "No tienes permiso para crear carpetas en esta área."
      );
    }

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
        padre.id_servicio,
        padre.id_carpeta,
        nombre
      ]);

    if (existentes.length) {
      throw fallo(
        409,
        "Ya existe una carpeta con ese nombre en esta ubicación."
      );
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
        "Subcarpeta creada desde el archivo documental",
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
      "Crear subcarpeta Administración/RRHH:",
      error.code ||
      error.status ||
      "ERROR_INTERNO"
    );

    const estado =
      [400, 403, 404, 409].includes(
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