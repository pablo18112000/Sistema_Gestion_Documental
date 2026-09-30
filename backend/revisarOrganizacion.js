require("dotenv").config();

const mysql = require("mysql2/promise");

async function revisarOrganizacion() {
  let conexion;

  try {
    conexion = await mysql.createConnection({
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      connectTimeout: 10000
    });

    console.log("\n1. ESTRUCTURA DE LAS TABLAS");

    const [columnas] = await conexion.execute(`
      SELECT
        TABLE_NAME AS tabla,
        COLUMN_NAME AS campo,
        COLUMN_TYPE AS tipo,
        IS_NULLABLE AS acepta_null,
        COLUMN_KEY AS clave
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'areas',
          'proyectos',
          'servicios_proyectos',
          'carpetas_documentos',
          'clientes',
          'unidades',
          'unidades_clientes'
        )
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    console.table(columnas);

    console.log("\n2. ÁREAS Y CANTIDAD DE USUARIOS");

    const [areas] = await conexion.execute(`
      SELECT
        a.id_area,
        a.nombre_area,
        a.estado,
        (
          SELECT COUNT(*)
          FROM usuarios u
          WHERE u.id_area = a.id_area
        ) AS usuarios
      FROM areas a
      ORDER BY a.id_area
    `);

    console.table(areas);

    console.log("\n3. PROYECTOS EXISTENTES (HASTA 100)");

    const [proyectos] = await conexion.execute(`
      SELECT
        p.id_proyecto,
        p.nombre_proyecto,
        (
          SELECT COUNT(*)
          FROM usuario_proyectos up
          WHERE up.id_proyecto = p.id_proyecto
        ) AS usuarios_asignados
      FROM proyectos p
      ORDER BY p.id_proyecto
      LIMIT 100
    `);

    console.table(proyectos);

    console.log("\n4. CARPETAS EXISTENTES (HASTA 100)");

    const [carpetas] = await conexion.execute(`
      SELECT
        c.id_carpeta,
        c.nombre_carpeta,
        c.id_carpeta_padre,
        c.id_servicio,
        s.id_area,
        s.id_proyecto,
        CASE
          WHEN c.id_drive IS NULL OR c.id_drive = ''
          THEN 'No'
          ELSE 'Sí'
        END AS vinculada_a_drive,
        (
          SELECT COUNT(*)
          FROM documentos d
          WHERE d.id_carpeta = c.id_carpeta
        ) AS documentos
      FROM carpetas_documentos c
      LEFT JOIN servicios_proyectos s
        ON s.id_servicio = c.id_servicio
      ORDER BY c.id_carpeta
      LIMIT 100
    `);

    console.table(carpetas);

    console.log("\n5. TOTALES");

    const [totales] = await conexion.execute(`
      SELECT
        (SELECT COUNT(*) FROM proyectos) AS proyectos,
        (SELECT COUNT(*) FROM carpetas_documentos) AS carpetas,
        (SELECT COUNT(*) FROM documentos) AS documentos
    `);

    console.table(totales);

    console.log(
      "\nRevisión terminada. No se modificaron datos ni archivos de Drive."
    );
  } catch (error) {
    console.error(
      "\nNo se pudo completar la revisión:",
      error.code || "ERROR_DE_CONEXION"
    );

    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
}

revisarOrganizacion();