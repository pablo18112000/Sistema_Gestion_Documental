require("dotenv").config();

const mysql = require("mysql2/promise");

async function prepararCategorias() {
  let conexion;
  let transaccion = false;

  try {
    conexion = await mysql.createConnection({
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      charset: "utf8mb4",
      connectTimeout: 10000
    });

    const [tablas] = await conexion.execute(`
      SELECT ENGINE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'carpetas_documentos'
    `);

    if (
      tablas.length !== 1 ||
      String(tablas[0].ENGINE).toUpperCase() !== "INNODB"
    ) {
      throw new Error("La tabla de carpetas debe utilizar InnoDB.");
    }

    await conexion.beginTransaction();
    transaccion = true;

    // Carpeta existente identificada en la revisión.
    const [carpetas] = await conexion.execute(`
      SELECT
        c.id_carpeta,
        c.id_servicio,
        c.id_carpeta_padre,
        s.id_proyecto,
        p.nombre_proyecto
      FROM carpetas_documentos c
      INNER JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      INNER JOIN proyectos p
        ON p.id_proyecto = s.id_proyecto
      WHERE c.id_carpeta = ?
      FOR UPDATE
    `, [95]);

    const principal = carpetas[0];

    if (
      !principal ||
      Number(principal.id_proyecto) !== 4 ||
      principal.id_carpeta_padre !== null ||
      principal.nombre_proyecto.trim().toUpperCase() !== "VOLCAN-TICLIO"
    ) {
      throw new Error(
        "La carpeta 95 no coincide con la carpeta principal esperada."
      );
    }

    const categorias = [
      "Dossier",
      "Licitación",
      "Fotos",
      "Valorización",
      "Otros"
    ];

    const resultado = [];

    for (const nombre of categorias) {
      const [existentes] = await conexion.execute(`
        SELECT id_carpeta, id_servicio
        FROM carpetas_documentos
        WHERE id_carpeta_padre = ?
          AND nombre_carpeta = ?
        FOR UPDATE
      `, [principal.id_carpeta, nombre]);

      if (existentes.length > 1) {
        throw new Error("Hay carpetas duplicadas para: " + nombre);
      }

      if (existentes.length === 1) {
        if (
          Number(existentes[0].id_servicio) !==
          Number(principal.id_servicio)
        ) {
          throw new Error(
            "La categoría pertenece a un servicio diferente: " + nombre
          );
        }

        resultado.push({
          categoria: nombre,
          id_carpeta: existentes[0].id_carpeta,
          resultado: "Ya existía"
        });

        continue;
      }

      const [insertada] = await conexion.execute(`
        INSERT INTO carpetas_documentos (
          id_servicio,
          nombre_carpeta,
          descripcion,
          id_carpeta_padre,
          id_drive
        )
        VALUES (?, ?, ?, ?, NULL)
      `, [
        principal.id_servicio,
        nombre,
        "Categoría documental del proyecto",
        principal.id_carpeta
      ]);

      resultado.push({
        categoria: nombre,
        id_carpeta: insertada.insertId,
        resultado: "Creada"
      });
    }

    await conexion.commit();
    transaccion = false;

    console.table(resultado);
    console.log("Categorías registradas correctamente en MySQL.");
    console.log("Los documentos existentes conservan su ubicación.");
    console.log("Todavía no se crearon estas carpetas en Google Drive.");
  } catch (error) {
    if (conexion && transaccion) {
      try {
        await conexion.rollback();
      } catch {
        console.error("No se pudo confirmar la reversión.");
      }
    }

    console.error(
      "No se completó la preparación:",
      error.code || error.message
    );

    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

prepararCategorias();