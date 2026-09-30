const path = require("path");
const fs = require("fs/promises");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const connection = require("./config/db");
const db = connection.promise();

function describirRuta(valor) {
  if (!valor) return "(sin ruta guardada)";

  const ruta = String(valor);

  // No muestra parámetros que pudieran contener tokens.
  if (/^https?:\/\//i.test(ruta)) {
    try {
      const url = new URL(ruta);
      return url.origin + url.pathname;
    } catch {
      return "(URL no válida)";
    }
  }

  return ruta;
}

async function revisar() {
  try {
    const [documentos] = await db.query(`
      SELECT
        id_documento,
        nombre_archivo,
        ruta_nube
      FROM documentos
      WHERE LOWER(TRIM(estado_documento)) = 'pendiente'
      ORDER BY id_documento
      LIMIT 100
    `);

    console.log("\nRUTAS DE DOCUMENTOS PENDIENTES");

    console.table(
      documentos.map((documento) => ({
        id: documento.id_documento,
        archivo: documento.nombre_archivo,
        ruta_guardada: describirRuta(documento.ruta_nube)
      }))
    );

    console.log("\nARCHIVOS PRESENTES EN backend/uploads");

    const carpeta = path.join(__dirname, "uploads");

    try {
      const entradas = await fs.readdir(carpeta, {
        withFileTypes: true
      });

      const archivos = entradas
        .filter((entrada) => entrada.isFile())
        .map((entrada) => ({
          archivo: entrada.name
        }));

      console.table(archivos);

      if (archivos.length === 0) {
        console.log("La carpeta no contiene archivos.");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("La carpeta uploads no existe.");
      } else {
        throw error;
      }
    }

    console.log("\nConsulta terminada. No se modificaron datos.");
  } catch (error) {
    console.error(
      "No se pudo completar la consulta:",
      error.code || "ERROR_DESCONOCIDO"
    );

    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

revisar().catch(() => {
  console.error("No se pudo cerrar la conexión.");
  process.exitCode = 1;
});