const connection = require("./config/db");

async function preparar() {
  const db = connection.promise();

  // Evitar esperar indefinidamente si una tabla está ocupada.
  await db.query("SET SESSION lock_wait_timeout = 15");

  // Una persona puede participar en varios proyectos.
  // La clave compuesta impide repetir la misma asignación.
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuario_proyectos (
      id_usuario INT NOT NULL,
      id_proyecto INT NOT NULL,
      fecha_asignacion TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (id_usuario, id_proyecto),

      INDEX idx_up_proyecto (id_proyecto),

      CONSTRAINT fk_up_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios (id_usuario)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

      CONSTRAINT fk_up_proyecto
        FOREIGN KEY (id_proyecto)
        REFERENCES proyectos (id_proyecto)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
    ) ENGINE=InnoDB
  `);

  console.log("Tabla usuario_proyectos disponible.");

  // Comprobar si el área ya fue agregada anteriormente.
  const [columnas] = await db.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'documentos'
      AND COLUMN_NAME = 'id_area'
  `);

  if (columnas.length === 0) {
    await db.query(`
      ALTER TABLE documentos
        ADD COLUMN id_area INT NULL DEFAULT NULL,
        ADD INDEX idx_documentos_area (id_area),
        ADD CONSTRAINT fk_documentos_area_coemsa
          FOREIGN KEY (id_area)
          REFERENCES areas (id_area)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
    `);

    console.log("Columna documentos.id_area agregada.");
  } else {
    console.log(
      "documentos.id_area ya existe; no se modificó."
    );
  }

  console.log(
    "LISTO: preparación terminada. No se asignaron usuarios ni documentos."
  );
}

preparar()
  .catch((error) => {
    process.exitCode = 1;

    console.error(
      "La preparación no se completó:",
      error.code || "ERROR_MYSQL"
    );

    console.error(
      "Puede haberse completado el primer paso. Comparte este mensaje de error."
    );
  })
  .finally(() => {
    connection.end();
  });