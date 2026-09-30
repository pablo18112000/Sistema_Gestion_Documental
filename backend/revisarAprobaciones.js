const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const connection = require("./config/db");
const db = connection.promise();

async function revisar() {
  try {
    const tablas = [
      "aprobaciones_documentos",
      "historial_documentos"
    ];

    for (const tabla of tablas) {
      console.log("\nESTRUCTURA:", tabla);

      const [columnas] = await db.query(
        `SHOW COLUMNS FROM \`${tabla}\``
      );

      console.table(
        columnas.map((columna) => ({
          campo: columna.Field,
          tipo: columna.Type,
          acepta_null: columna.Null,
          clave: columna.Key,
          predeterminado: columna.Default,
          extra: columna.Extra
        }))
      );
    }

    console.log("\nESTADOS EN DOCUMENTOS");

    const [estadosDocumentos] = await db.query(`
      SELECT estado_documento, COUNT(*) AS cantidad
      FROM documentos
      GROUP BY estado_documento
    `);

    console.table(estadosDocumentos);

    console.log("\nESTADOS EN APROBACIONES");

    const [estadosAprobaciones] = await db.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM aprobaciones_documentos
      GROUP BY estado
    `);

    console.table(estadosAprobaciones);

    console.log("\nREVISIONES DE DOCUMENTOS PENDIENTES");

    const [pendientes] = await db.query(`
      SELECT
        d.id_documento,
        d.estado_documento,
        a.id_aprobacion,
        a.estado AS estado_revision,
        CASE
          WHEN u.id_usuario IS NULL THEN 'No'
          ELSE 'Si'
        END AS usuario_existe
      FROM documentos d
      LEFT JOIN aprobaciones_documentos a
        ON a.id_documento = d.id_documento
      LEFT JOIN usuarios u
        ON u.id_usuario = d.id_usuario
      WHERE LOWER(TRIM(d.estado_documento)) = 'pendiente'
      ORDER BY d.id_documento, a.id_aprobacion
      LIMIT 100
    `);

    console.table(pendientes);
    console.log("\nRevision terminada. No se modificaron datos.");
  } catch (error) {
    console.error(
      "No se pudo completar la revision:",
      error.code || "ERROR_DESCONOCIDO"
    );

    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

revisar().catch(() => {
  console.error("No se pudo cerrar la conexion.");
  process.exitCode = 1;
});