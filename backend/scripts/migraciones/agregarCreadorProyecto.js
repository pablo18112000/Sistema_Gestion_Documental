"use strict";

const path = require("path");

require("dotenv").config({
  path: path.join(
    __dirname,
    "..",
    "..",
    ".env"
  )
});

const mysql = require("mysql2/promise");

(async () => {

  const db = await mysql.createConnection({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE
  });

  try {

    const [columnas] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos'
        AND COLUMN_NAME = 'id_usuario_creador'
    `);

    if (!columnas.length) {

      await db.query(`
        ALTER TABLE proyectos
        ADD COLUMN id_usuario_creador INT NULL
        AFTER descripcion
      `);

      console.log(
        "Campo id_usuario_creador creado."
      );

    } else {

      console.log(
        "El campo id_usuario_creador ya existe."
      );

    }


    const [indices] = await db.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos'
        AND INDEX_NAME = 'idx_proyectos_usuario_creador'
    `);

    if (!indices.length) {

      await db.query(`
        CREATE INDEX idx_proyectos_usuario_creador
        ON proyectos (id_usuario_creador)
      `);

      console.log(
        "Indice del creador creado."
      );

    } else {

      console.log(
        "El indice del creador ya existe."
      );

    }


    const [foraneas] = await db.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos'
        AND COLUMN_NAME = 'id_usuario_creador'
        AND REFERENCED_TABLE_NAME = 'usuarios'
    `);

    if (!foraneas.length) {

      await db.query(`
        ALTER TABLE proyectos
        ADD CONSTRAINT fk_proyectos_usuario_creador
        FOREIGN KEY (id_usuario_creador)
        REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL
      `);

      console.log(
        "Relacion con usuarios creada."
      );

    } else {

      console.log(
        "La relacion con usuarios ya existe."
      );

    }


    console.log("");
    console.log("MIGRACION COMPLETADA");
    console.log("");
    console.log(
      "Los proyectos nuevos podran guardar a su creador."
    );
    console.log(
      "Los proyectos antiguos quedan con creador NULL."
    );

  } finally {

    await db.end();

  }

})().catch((error) => {

  console.error(
    "Error en migracion:",
    error
  );

  process.exit(1);

});
