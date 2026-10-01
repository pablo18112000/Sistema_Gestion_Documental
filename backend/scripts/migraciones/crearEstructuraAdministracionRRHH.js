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

  async function asegurarServicio(
    idArea,
    nombre,
    descripcion
  ) {
    const [existentes] = await db.query(`
      SELECT
        id_servicio,
        estado
      FROM servicios_proyectos
      WHERE id_area = ?
        AND id_proyecto IS NULL
        AND nombre_servicio = ?
      ORDER BY id_servicio
      FOR UPDATE
    `, [
      idArea,
      nombre
    ]);

    if (existentes.length > 1) {
      throw new Error(
        "Hay más de un servicio llamado " +
        nombre +
        " en el área " +
        idArea +
        ". No se realizaron cambios."
      );
    }

    if (existentes.length === 1) {
      if (Number(existentes[0].estado) !== 1) {
        throw new Error(
          "El servicio " +
          nombre +
          " existe pero está inactivo."
        );
      }

      return existentes[0].id_servicio;
    }

    const [resultado] = await db.query(`
      INSERT INTO servicios_proyectos (
        id_area,
        id_proyecto,
        nombre_servicio,
        descripcion,
        estado
      )
      VALUES (?, NULL, ?, ?, 1)
    `, [
      idArea,
      nombre,
      descripcion
    ]);

    return resultado.insertId;
  }

  async function asegurarCarpeta(
    idServicio,
    nombre,
    idPadre,
    descripcion
  ) {
    const [existentes] = await db.query(`
      SELECT
        id_carpeta,
        id_drive
      FROM carpetas_documentos
      WHERE id_servicio = ?
        AND nombre_carpeta = ?
        AND id_carpeta_padre <=> ?
      ORDER BY id_carpeta
      FOR UPDATE
    `, [
      idServicio,
      nombre,
      idPadre
    ]);

    if (existentes.length > 1) {
      throw new Error(
        "Hay carpetas duplicadas: " +
        nombre +
        ". No se realizaron cambios."
      );
    }

    if (existentes.length === 1) {
      return existentes[0].id_carpeta;
    }

    const [resultado] = await db.query(`
      INSERT INTO carpetas_documentos (
        id_servicio,
        nombre_carpeta,
        descripcion,
        id_carpeta_padre,
        id_drive
      )
      VALUES (?, ?, ?, ?, NULL)
    `, [
      idServicio,
      nombre,
      descripcion,
      idPadre
    ]);

    return resultado.insertId;
  }

  try {
    await db.beginTransaction();

    const [areas] = await db.query(`
      SELECT
        id_area,
        nombre_area,
        estado
      FROM areas
      WHERE id_area IN (1, 3)
      FOR UPDATE
    `);

    if (
      areas.length !== 2 ||
      areas.some(
        (area) => Number(area.estado) !== 1
      )
    ) {
      throw new Error(
        "Administración y Recursos Humanos deben existir y estar activas."
      );
    }

    /*
     * =====================================
     * ADMINISTRACIÓN — ÁREA 3
     * =====================================
     */

    const servicioAdministracion =
      await asegurarServicio(
        3,
        "Administración",
        "Estructura documental de Administración"
      );

    const administracion =
      await asegurarCarpeta(
        servicioAdministracion,
        "Administración",
        null,
        "Carpeta principal de Administración"
      );

    const carpetasAdministracion = [
      "Documentos Administrativos",
      "Compras",
      "Facturación",
      "Contabilidad",
      "Correspondencia"
    ];

    for (
      const nombre
      of carpetasAdministracion
    ) {
      await asegurarCarpeta(
        servicioAdministracion,
        nombre,
        administracion,
        "Carpeta de Administración"
      );
    }

    /*
     * =====================================
     * RECURSOS HUMANOS — ÁREA 1
     * =====================================
     */

    const servicioRRHH =
      await asegurarServicio(
        1,
        "Recursos Humanos",
        "Estructura documental de Recursos Humanos"
      );

    const recursosHumanos =
      await asegurarCarpeta(
        servicioRRHH,
        "Recursos Humanos",
        null,
        "Carpeta principal de Recursos Humanos"
      );

    const personal =
      await asegurarCarpeta(
        servicioRRHH,
        "Personal",
        recursosHumanos,
        "Gestión documental del personal"
      );

    // Personal funciona como contenedor de trabajadores.
    // Las carpetas de cada trabajador y sus categorías
    // se crearán dinámicamente desde el sistema.
await db.commit();

    console.log(
      "\nESTRUCTURA CREADA CORRECTAMENTE\n"
    );

    const [estructura] = await db.query(`
      SELECT
        a.nombre_area,
        s.id_servicio,
        s.nombre_servicio,
        c.id_carpeta,
        c.nombre_carpeta,
        c.id_carpeta_padre,
        c.id_drive
      FROM servicios_proyectos s
      INNER JOIN areas a
        ON a.id_area = s.id_area
      INNER JOIN carpetas_documentos c
        ON c.id_servicio = s.id_servicio
      WHERE s.id_proyecto IS NULL
        AND s.id_area IN (1, 3)
      ORDER BY
        s.id_area DESC,
        c.id_carpeta
    `);

    console.table(estructura);

  } catch (error) {
    try {
      await db.rollback();
    } catch {}

    console.error(
      "\nNO SE CREÓ LA ESTRUCTURA:"
    );

    console.error(error.message);
    process.exitCode = 1;

  } finally {
    await db.end();
  }
}

main();
