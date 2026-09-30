const connection = require("./config/db");

async function agregarSiFalta(db, tabla, columna, sql) {
  const [resultado] = await db.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `, [tabla, columna]);

  if (resultado.length > 0) {
    console.log(`${tabla}.${columna} ya existe; no se modificó.`);
    return;
  }

  await db.query(sql);

  console.log(`${tabla}.${columna} agregado correctamente.`);
}

async function preparar() {
  const db = connection.promise();

  await db.query("SET SESSION lock_wait_timeout = 15");

  // Relacionar un servicio con un proyecto.
  // Los servicios existentes conservarán sus datos.
  await agregarSiFalta(
    db,
    "servicios_proyectos",
    "id_proyecto",
    `
      ALTER TABLE servicios_proyectos
        ADD COLUMN id_proyecto INT NULL DEFAULT NULL,
        ADD INDEX idx_servicios_proyecto (id_proyecto),
        ADD CONSTRAINT fk_servicios_proyecto_coemsa
          FOREIGN KEY (id_proyecto)
          REFERENCES proyectos (id_proyecto)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
    `
  );

  // Una carpeta puede contener otras carpetas.
  // NULL significa que no tiene carpeta padre.
  await agregarSiFalta(
    db,
    "carpetas_documentos",
    "id_carpeta_padre",
    `
      ALTER TABLE carpetas_documentos
        ADD COLUMN id_carpeta_padre INT NULL DEFAULT NULL,
        ADD INDEX idx_carpetas_padre (id_carpeta_padre),
        ADD CONSTRAINT fk_carpetas_padre_coemsa
          FOREIGN KEY (id_carpeta_padre)
          REFERENCES carpetas_documentos (id_carpeta)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
    `
  );

  // Identificador de la carpeta física en Google Drive.
  // Se completará cuando conectemos Drive.
  await agregarSiFalta(
    db,
    "carpetas_documentos",
    "id_drive",
    `
      ALTER TABLE carpetas_documentos
        ADD COLUMN id_drive VARCHAR(255) NULL DEFAULT NULL,
        ADD UNIQUE INDEX uq_carpetas_drive_coemsa (id_drive)
    `
  );

  console.log(
    "LISTO: estructura de carpetas preparada."
  );

  console.log(
    "No se crearon proyectos, asignaciones ni carpetas en Drive."
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
      "Los pasos anteriores pueden haberse aplicado. Comparte el mensaje antes de continuar."
    );
  })
  .finally(() => {
    connection.end();
  });