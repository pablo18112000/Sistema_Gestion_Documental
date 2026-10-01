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
  const visitadas = new Set();

  while (true) {
    const clave =
      String(actual.id_carpeta);

    if (visitadas.has(clave)) {
      throw fallo(
        409,
        "La jerarquía de carpetas no es válida."
      );
    }

    visitadas.add(clave);

    if (actual.id_carpeta_padre === null) {
      return {
        raiz: actual,
        profundidad
      };
    }

    profundidad++;

    /*
     * subcarpetasDrive admite hasta 10 niveles.
     * El padre puede estar como máximo en el
     * nivel 9 para crear un hijo en el nivel 10.
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
          id_carpeta,
          id_carpeta_padre,
          id_servicio,
          nombre_carpeta
        FROM carpetas_documentos
        WHERE id_carpeta = ?
          AND id_servicio = ?
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

    actual =
      padres[0];
  }
}

async function comprobarPermiso(
  conexion,
  padre,
  usuario
) {
  const rol =
    usuario?.nombre_rol;

  if (rol === "Administrador") {
    return;
  }

  if (
    rol !== "Supervisor" ||
    Number(usuario?.id_area) !== 2
  ) {
    throw fallo(
      403,
      "Solo el Administrador o el Supervisor de Servicios y Proyectos puede crear carpetas aquí."
    );
  }

  /*
   * En proyectos se conserva la asignación.
   * El creador del proyecto queda asignado
   * cuando el proyecto se registra.
   */
  if (padre.id_proyecto !== null) {
    const [asignaciones] =
      await conexion.query(`
        SELECT id_usuario
        FROM usuario_proyectos
        WHERE id_usuario = ?
          AND id_proyecto = ?
        FOR UPDATE
      `, [
        usuario.id_usuario,
        padre.id_proyecto
      ]);

    if (!asignaciones.length) {
      throw fallo(
        403,
        "No tienes este proyecto asignado."
      );
    }
  }
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

    if (
      Number(padre.servicio_activo) !== 1 ||
      Number(padre.area_activa) !== 1
    ) {
      throw fallo(
        409,
        "El área o servicio ya no está activo."
      );
    }

    const arbol =
      await comprobarArbol(
        conexion,
        padre
      );

    if (padre.id_proyecto === null) {
      /*
       * Las carpetas sin proyecto solo son
       * válidas dentro de la nueva raíz real
       * de Servicios y Proyectos.
       */
      const [raices] =
        await conexion.query(`
          SELECT
            uds.id_carpeta,
            c.id_servicio
          FROM ubicaciones_documentales_servicios uds
          INNER JOIN carpetas_documentos c
            ON c.id_carpeta = uds.id_carpeta
          WHERE uds.tipo_ubicacion = 'servicios'
            AND uds.id_referencia = 0
          FOR UPDATE
        `);

      if (
        raices.length !== 1 ||
        Number(padre.id_area) !== 2 ||
        Number(raices[0].id_servicio) !==
          Number(padre.id_servicio) ||
        Number(raices[0].id_carpeta) !==
          Number(arbol.raiz.id_carpeta)
      ) {
        throw fallo(
          403,
          "Esta carpeta no pertenece a la estructura de Servicios y Proyectos."
        );
      }

    } else {
      /*
       * Todo proyecto se presenta visualmente
       * en Servicios y Proyectos, incluso si
       * un proyecto histórico conserva otra área.
       */
      if (
        arbol.raiz.id_carpeta_padre !== null
      ) {
        throw fallo(
          409,
          "No se encontró la raíz del proyecto."
        );
      }
    }

    await comprobarPermiso(
      conexion,
      padre,
      req.usuario
    );

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
        "Subcarpeta creada desde Servicios y Proyectos",
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
          padre.id_area,

        id_proyecto:
          padre.id_proyecto
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
      "Crear carpeta Servicios/Proyectos:",
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
