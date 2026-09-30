require("dotenv").config();

const mysql = require("mysql2/promise");

async function preparar() {
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

    // Verificar compatibilidad antes de crear las relaciones.
    const [tablas] = await conexion.execute(`
      SELECT ENGINE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos'
    `);

    const [columnas] = await conexion.execute(`
      SELECT COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'proyectos'
        AND COLUMN_NAME = 'id_proyecto'
    `);

    if (
      tablas.length !== 1 ||
      String(tablas[0].ENGINE).toUpperCase() !== "INNODB" ||
      columnas.length !== 1 ||
      !/^int(?:\\(\\d+\\))?$/i.test(columnas[0].COLUMN_TYPE)
    ) {
      throw new Error(
        "La tabla proyectos no tiene la estructura esperada. No se realizaron cambios."
      );
    }

    // La creación de tablas no forma parte de la transacción.
    // IF NOT EXISTS permite repetir el script después de una interrupción.
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente INT NOT NULL AUTO_INCREMENT,
        nombre_cliente VARCHAR(100) NOT NULL,
        estado TINYINT(1) NOT NULL DEFAULT 1,
        fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_cliente),
        UNIQUE KEY uq_cliente_nombre (nombre_cliente)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS unidades_clientes (
        id_unidad INT NOT NULL AUTO_INCREMENT,
        id_cliente INT NOT NULL,
        nombre_unidad VARCHAR(100) NOT NULL,
        estado TINYINT(1) NOT NULL DEFAULT 1,
        fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_unidad),
        UNIQUE KEY uq_unidad_cliente (id_cliente, nombre_unidad),
        CONSTRAINT fk_unidad_cliente_coemsa
          FOREIGN KEY (id_cliente)
          REFERENCES clientes (id_cliente)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    // Cada proyecto podrá pertenecer a una unidad.
    // Todavía no se asignan los proyectos existentes.
    await conexion.execute(`
      CREATE TABLE IF NOT EXISTS proyecto_unidad (
        id_proyecto INT NOT NULL,
        id_unidad INT NOT NULL,
        fecha_asignacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_proyecto),
        KEY idx_proyecto_unidad (id_unidad),
        CONSTRAINT fk_pu_proyecto_coemsa
          FOREIGN KEY (id_proyecto)
          REFERENCES proyectos (id_proyecto)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,
        CONSTRAINT fk_pu_unidad_coemsa
          FOREIGN KEY (id_unidad)
          REFERENCES unidades_clientes (id_unidad)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await conexion.beginTransaction();
    transaccion = true;

    // Si Volcan ya existe, conservar el registro.
    await conexion.execute(`
      INSERT INTO clientes (nombre_cliente)
      VALUES (?)
      ON DUPLICATE KEY UPDATE
        id_cliente = LAST_INSERT_ID(id_cliente)
    `, ["Volcan"]);

    const [clientes] = await conexion.execute(`
      SELECT id_cliente
      FROM clientes
      WHERE nombre_cliente = ?
      FOR UPDATE
    `, ["Volcan"]);

    const idCliente = clientes[0].id_cliente;

    const unidades = [
      "Ticlio",
      "Chungar - Animón",
      "Romina",
      "Paragsha"
    ];

    for (const nombre of unidades) {
      await conexion.execute(`
        INSERT INTO unidades_clientes (
          id_cliente,
          nombre_unidad
        )
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          id_unidad = LAST_INSERT_ID(id_unidad)
      `, [idCliente, nombre]);
    }

    await conexion.commit();
    transaccion = false;

    const [resultado] = await conexion.execute(`
      SELECT
        c.id_cliente,
        c.nombre_cliente,
        u.id_unidad,
        u.nombre_unidad
      FROM clientes c
      INNER JOIN unidades_clientes u
        ON u.id_cliente = c.id_cliente
      WHERE c.id_cliente = ?
      ORDER BY u.id_unidad
    `, [idCliente]);

    console.log("\nCLIENTE Y UNIDADES PREPARADOS");
    console.table(resultado);

    console.log("\nPreparación completada.");
    console.log("No se movieron archivos de Google Drive.");
    console.log("No se modificaron documentos ni permisos.");
    console.log("Los proyectos existentes aún no fueron reasignados.");
  } catch (error) {
    if (conexion && transaccion) {
      try {
        await conexion.rollback();
      } catch {
        console.error("No se pudo confirmar la reversión de los registros.");
      }
    }

    console.error(
      "\nNo se completó la preparación:",
      error.code || error.message
    );

    console.error(
      "Si se crearon tablas antes del error, estas pueden permanecer."
    );

    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

preparar();