"use strict";

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", "..", ".env")
});

const mysql = require("mysql2/promise");

async function main() {

  const db = await mysql.createConnection({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE
  });

  try {

    await db.beginTransaction();

    /*
     * Solo busca "Otros" dentro de las nuevas estructuras
     * independientes de Administración y RRHH.
     *
     * NO toca proyectos.
     */
    const [carpetas] = await db.query(`
      SELECT
        c.id_carpeta,
        c.nombre_carpeta,
        c.id_drive,
        c.id_carpeta_padre,
        s.id_servicio,
        s.id_area,
        s.id_proyecto,
        padre.nombre_carpeta AS carpeta_padre,

        (
          SELECT COUNT(*)
          FROM documentos d
          WHERE d.id_carpeta = c.id_carpeta
        ) AS documentos,

        (
          SELECT COUNT(*)
          FROM carpetas_documentos h
          WHERE h.id_carpeta_padre = c.id_carpeta
        ) AS subcarpetas

      FROM carpetas_documentos c

      INNER JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio

      INNER JOIN carpetas_documentos padre
        ON padre.id_carpeta = c.id_carpeta_padre
        AND padre.id_servicio = c.id_servicio

      WHERE c.nombre_carpeta = 'Otros'

        AND s.id_proyecto IS NULL

        AND (
          (
            s.id_area = 3
            AND padre.nombre_carpeta = 'Administración'
            AND padre.id_carpeta_padre IS NULL
          )

          OR

          (
            s.id_area = 1
            AND padre.nombre_carpeta = 'Recursos Humanos'
            AND padre.id_carpeta_padre IS NULL
          )
        )

      FOR UPDATE
    `);

    console.log(
      "\n=== OTROS DE ADMINISTRACIÓN / RRHH ==="
    );

    console.table(carpetas);

    for (const carpeta of carpetas) {

      if (
        carpeta.id_drive !== null ||
        Number(carpeta.documentos) !== 0 ||
        Number(carpeta.subcarpetas) !== 0
      ) {

        throw new Error(
          "La carpeta Otros ID " +
          carpeta.id_carpeta +
          " contiene información. No se eliminó nada."
        );
      }
    }

    for (const carpeta of carpetas) {

      await db.query(`
        DELETE FROM carpetas_documentos
        WHERE id_carpeta = ?
      `, [
        carpeta.id_carpeta
      ]);

    }

    await db.commit();

    console.log(
      "\nLOS 'OTROS' DE ADMINISTRACIÓN Y RRHH FUERON RETIRADOS CORRECTAMENTE."
    );

    console.log(
      "Servicios y Proyectos no fueron modificados."
    );

  } catch (error) {

    try {
      await db.rollback();
    } catch {}

    console.error(
      "\nNO SE REALIZARON LOS CAMBIOS:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;

  } finally {

    await db.end();

  }
}

main();
