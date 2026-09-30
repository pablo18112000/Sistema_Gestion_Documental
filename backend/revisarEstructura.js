const connection = require("./config/db");

async function revisar() {
  const db = connection.promise();

const tablas = [
  "carpetas_documentos",
  "servicios_proyectos"
];

  for (const tabla of tablas) {
    // Los nombres proceden de la lista fija anterior.
    const [columnas] = await db.query(
      `SHOW COLUMNS FROM \`${tabla}\``
    );

    console.log(`\nTABLA: ${tabla}`);

    console.table(
      columnas.map((columna) => ({
        campo: columna.Field,
        tipo: columna.Type,
        permite_nulo: columna.Null,
        clave: columna.Key,
        extra: columna.Extra
      }))
    );
  }
}

revisar()
  .catch((error) => {
    console.error(
      "No se pudo revisar la estructura:",
      error.code || "ERROR_MYSQL"
    );
  })
  .finally(() => {
    connection.end();
  });