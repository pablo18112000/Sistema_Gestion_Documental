require("dotenv").config();

const mysql = require("mysql2/promise");

async function corregir() {
  let conexion;

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

    await conexion.beginTransaction();

    const cambios = [];

    const [admin] = await conexion.execute(`
      UPDATE areas
      SET nombre_area = 'Administración'
      WHERE nombre_area = 'Administracin'
    `);

    cambios.push({
      cambio: "Administracin -> Administración",
      filas: admin.affectedRows
    });

    const [logistica] = await conexion.execute(`
      UPDATE areas
      SET nombre_area = 'Logística'
      WHERE nombre_area = 'Logstica'
    `);

    cambios.push({
      cambio: "Logstica -> Logística",
      filas: logistica.affectedRows
    });

    const [licitacion] = await conexion.execute(`
      UPDATE carpetas_documentos
      SET nombre_carpeta = 'Licitación'
      WHERE nombre_carpeta = 'Licitacin'
    `);

    cambios.push({
      cambio: "Licitacin -> Licitación",
      filas: licitacion.affectedRows
    });

    const [valorizacion] = await conexion.execute(`
      UPDATE carpetas_documentos
      SET nombre_carpeta = 'Valorización'
      WHERE nombre_carpeta = 'Valorizacin'
    `);

    cambios.push({
      cambio: "Valorizacin -> Valorización",
      filas: valorizacion.affectedRows
    });

    await conexion.commit();

    console.table(cambios);
    console.log("Corrección completada correctamente.");
  } catch (error) {
    if (conexion) {
      try {
        await conexion.rollback();
      } catch {}
    }

    console.error(
      "No se pudo completar la corrección:",
      error.code || error.message
    );

    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

corregir();