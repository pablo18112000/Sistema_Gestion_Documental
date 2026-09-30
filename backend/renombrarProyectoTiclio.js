require("dotenv").config();

const mysql = require("mysql2/promise");

async function ejecutar() {
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
        AND TABLE_NAME IN ('proyectos', 'carpetas_documentos')
    `);

    if (
      tablas.length !== 2 ||
      tablas.some(t => String(t.ENGINE).toUpperCase() !== "INNODB")
    ) {
      throw new Error("Las tablas deben utilizar InnoDB.");
    }

    await conexion.beginTransaction();
    transaccion = true;

    const [filas] = await conexion.execute(`
      SELECT
        p.nombre_proyecto,
        c.nombre_carpeta,
        c.id_carpeta_padre,
        cl.nombre_cliente,
        uc.nombre_unidad
      FROM proyectos p
      INNER JOIN proyecto_unidad pu
        ON pu.id_proyecto = p.id_proyecto
      INNER JOIN unidades_clientes uc
        ON uc.id_unidad = pu.id_unidad
      INNER JOIN clientes cl
        ON cl.id_cliente = uc.id_cliente
      INNER JOIN servicios_proyectos s
        ON s.id_proyecto = p.id_proyecto
      INNER JOIN carpetas_documentos c
        ON c.id_servicio = s.id_servicio
      WHERE p.id_proyecto = 4
        AND c.id_carpeta = 95
      FOR UPDATE
    `);

    const registro = filas[0];
    const nombresPermitidos = ["VOLCAN-TICLIO", "Tendido de cable"];

    if (
      filas.length !== 1 ||
      registro.nombre_cliente !== "Volcan" ||
      registro.nombre_unidad !== "Ticlio" ||
      registro.id_carpeta_padre !== null ||
      !nombresPermitidos.includes(registro.nombre_proyecto) ||
      !nombresPermitidos.includes(registro.nombre_carpeta)
    ) {
      throw new Error(
        "Los datos no coinciden con el proyecto esperado. No se cambió el nombre."
      );
    }

    await conexion.execute(`
      UPDATE proyectos
      SET nombre_proyecto = ?
      WHERE id_proyecto = ?
    `, ["Tendido de cable", 4]);

    await conexion.execute(`
      UPDATE carpetas_documentos
      SET nombre_carpeta = ?
      WHERE id_carpeta = ?
    `, ["Tendido de cable", 95]);

    await conexion.commit();
    transaccion = false;

    console.log("Nombre actualizado: Tendido de cable.");
    console.log("Cliente: Volcan. Unidad: Ticlio.");
    console.log("Se conservaron los documentos y las asignaciones.");
    console.log("El nombre físico de la carpeta en Drive no se modificó.");
  } catch (error) {
    if (conexion && transaccion) {
      try {
        await conexion.rollback();
      } catch {
        console.error("No se pudo confirmar la reversión.");
      }
    }

    console.error(error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

ejecutar();