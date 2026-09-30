require("dotenv").config();

const mysql = require("mysql2/promise");

async function vincular() {
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

    await conexion.beginTransaction();
    transaccion = true;

    const [proyectos] = await conexion.execute(`
      SELECT id_proyecto, nombre_proyecto
      FROM proyectos
      WHERE id_proyecto = 4
      FOR UPDATE
    `);

    if (
      proyectos.length !== 1 ||
      proyectos[0].nombre_proyecto.trim().toUpperCase() !== "VOLCAN-TICLIO"
    ) {
      throw new Error(
        "El proyecto 4 no coincide con VOLCAN-TICLIO. No se realizará la vinculación."
      );
    }

    const [unidades] = await conexion.execute(`
      SELECT u.id_unidad, u.nombre_unidad, c.nombre_cliente
      FROM unidades_clientes u
      INNER JOIN clientes c
        ON c.id_cliente = u.id_cliente
      WHERE c.nombre_cliente = ?
        AND u.nombre_unidad = ?
        AND c.estado = 1
        AND u.estado = 1
      FOR UPDATE
    `, ["Volcan", "Ticlio"]);

    if (unidades.length !== 1) {
      throw new Error("No se encontró una única unidad Ticlio de Volcan.");
    }

    const idProyecto = proyectos[0].id_proyecto;
    const idUnidad = unidades[0].id_unidad;

    const [vinculos] = await conexion.execute(`
      SELECT id_unidad
      FROM proyecto_unidad
      WHERE id_proyecto = ?
      FOR UPDATE
    `, [idProyecto]);

    if (vinculos.length > 0) {
      if (Number(vinculos[0].id_unidad) !== Number(idUnidad)) {
        throw new Error(
          "El proyecto ya pertenece a otra unidad. Se conservó su vinculación."
        );
      }

      console.log("El proyecto ya estaba vinculado correctamente.");
    } else {
      await conexion.execute(`
        INSERT INTO proyecto_unidad (id_proyecto, id_unidad)
        VALUES (?, ?)
      `, [idProyecto, idUnidad]);
    }

    await conexion.commit();
    transaccion = false;

    console.table([{
      cliente: unidades[0].nombre_cliente,
      unidad: unidades[0].nombre_unidad,
      proyecto: proyectos[0].nombre_proyecto
    }]);

    console.log("Vinculación completada.");
    console.log("No se cambiaron documentos, áreas ni permisos.");
    console.log("No se movieron carpetas de Google Drive.");
  } catch (error) {
    if (conexion && transaccion) {
      try {
        await conexion.rollback();
      } catch {
        console.error("No se pudo confirmar la reversión.");
      }
    }

    console.error(
      "No se completó la vinculación:",
      error.code || error.message
    );

    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

vincular();