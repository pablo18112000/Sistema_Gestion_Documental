"use strict";

const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({
  path: path.join(
    __dirname,
    "..",
    "..",
    ".env"
  )
});

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function conexionConfig() {
  return {
    host: process.env.MYSQLHOST,
    port: Number(
      process.env.MYSQLPORT || 3306
    ),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    connectTimeout: 10000
  };
}

async function obtenerOCrearCarpeta(
  conexion,
  {
    idServicio,
    nombre,
    descripcion,
    idPadre
  }
) {
  const [existentes] =
    await conexion.query(`
      SELECT
        id_carpeta,
        nombre_carpeta,
        id_carpeta_padre
      FROM carpetas_documentos
      WHERE id_servicio = ?
        AND (
          (id_carpeta_padre IS NULL AND ? IS NULL)
          OR id_carpeta_padre = ?
        )
        AND LOWER(TRIM(nombre_carpeta)) =
            LOWER(TRIM(?))
      FOR UPDATE
    `, [
      idServicio,
      idPadre,
      idPadre,
      nombre
    ]);

  if (existentes.length > 1) {
    throw new Error(
      "Hay carpetas duplicadas llamadas \"" +
      nombre +
      "\" en la ubicación que se iba a preparar."
    );
  }

  if (existentes.length === 1) {
    return existentes[0].id_carpeta;
  }

  const [resultado] =
    await conexion.query(`
      INSERT INTO carpetas_documentos (
        id_servicio,
        nombre_carpeta,
        descripcion,
        id_carpeta_padre,
        id_drive
      )
      VALUES (?, ?, ?, ?, NULL)
    `, [
      idServicio,
      nombre,
      descripcion,
      idPadre
    ]);

  return resultado.insertId;
}

async function registrarUbicacion(
  conexion,
  tipo,
  referencia,
  idCarpeta
) {
  const [porClave] =
    await conexion.query(`
      SELECT
        tipo_ubicacion,
        id_referencia,
        id_carpeta
      FROM ubicaciones_documentales_servicios
      WHERE tipo_ubicacion = ?
        AND id_referencia = ?
      FOR UPDATE
    `, [
      tipo,
      referencia
    ]);

  if (porClave.length) {
    if (
      Number(porClave[0].id_carpeta) !==
      Number(idCarpeta)
    ) {
      throw new Error(
        "La ubicación " +
        tipo +
        ":" +
        referencia +
        " ya apunta a otra carpeta."
      );
    }

    return;
  }

  const [porCarpeta] =
    await conexion.query(`
      SELECT
        tipo_ubicacion,
        id_referencia
      FROM ubicaciones_documentales_servicios
      WHERE id_carpeta = ?
      FOR UPDATE
    `, [
      idCarpeta
    ]);

  if (porCarpeta.length) {
    throw new Error(
      "La carpeta " +
      idCarpeta +
      " ya está asociada a otra ubicación documental."
    );
  }

  await conexion.query(`
    INSERT INTO ubicaciones_documentales_servicios (
      tipo_ubicacion,
      id_referencia,
      id_carpeta
    )
    VALUES (?, ?, ?)
  `, [
    tipo,
    referencia,
    idCarpeta
  ]);
}

async function principal() {
  const conexion =
    await mysql.createConnection(
      conexionConfig()
    );

  try {
    /*
     * La tabla solo relaciona niveles visuales
     * (Servicios, Cliente y Unidad) con una
     * carpeta real. No modifica las tablas
     * existentes de clientes, unidades o proyectos.
     */
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS
        ubicaciones_documentales_servicios (
          tipo_ubicacion VARCHAR(20) NOT NULL,
          id_referencia INT NOT NULL,
          id_carpeta INT NOT NULL,

          PRIMARY KEY (
            tipo_ubicacion,
            id_referencia
          ),

          UNIQUE KEY
            uq_ubicacion_documental_carpeta (
              id_carpeta
            )
        )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);

    /*
     * OTROS se conserva físicamente en la BD.
     * Solo lo ocultaremos de esta navegación.
     * Antes comprobamos que no contenga unidades
     * ni proyectos para no esconder información.
     */
    const [clientesOtros] =
      await conexion.query(`
        SELECT
          id_cliente,
          nombre_cliente
        FROM clientes
        WHERE estado = 1
      `);

    const otros =
      clientesOtros.filter(
        (cliente) =>
          normalizar(
            cliente.nombre_cliente
          ) === "OTROS"
      );

    if (otros.length > 1) {
      throw new Error(
        "Existe más de un cliente activo llamado OTROS. No se modificó la estructura."
      );
    }

    if (otros.length === 1) {
      const idOtros =
        otros[0].id_cliente;

      const [conteos] =
        await conexion.query(`
          SELECT
            (
              SELECT COUNT(*)
              FROM unidades_clientes uc
              WHERE uc.id_cliente = ?
                AND uc.estado = 1
            ) AS unidades_activas,

            (
              SELECT COUNT(*)
              FROM proyecto_unidad pu
              INNER JOIN unidades_clientes uc
                ON uc.id_unidad = pu.id_unidad
              WHERE uc.id_cliente = ?
            ) AS proyectos
        `, [
          idOtros,
          idOtros
        ]);

      if (
        Number(
          conteos[0].unidades_activas
        ) > 0 ||
        Number(
          conteos[0].proyectos
        ) > 0
      ) {
        throw new Error(
          "El cliente OTROS contiene unidades o proyectos. " +
          "No se ocultó ni se cambió nada de esa estructura."
        );
      }
    }

    await conexion.beginTransaction();

    const [areas] =
      await conexion.query(`
        SELECT
          id_area
        FROM areas
        WHERE id_area = 2
          AND estado = 1
        FOR UPDATE
      `);

    if (areas.length !== 1) {
      throw new Error(
        "No se encontró activa el área 2 de Servicios y Proyectos."
      );
    }

    const nombreServicio =
      "Archivo documental Servicios y Proyectos";

    const [servicios] =
      await conexion.query(`
        SELECT
          id_servicio,
          estado
        FROM servicios_proyectos
        WHERE id_area = 2
          AND id_proyecto IS NULL
          AND nombre_servicio = ?
        FOR UPDATE
      `, [
        nombreServicio
      ]);

    if (servicios.length > 1) {
      throw new Error(
        "Existe más de un servicio documental de Servicios y Proyectos."
      );
    }

    let idServicio;

    if (servicios.length === 1) {
      if (
        Number(
          servicios[0].estado
        ) !== 1
      ) {
        throw new Error(
          "El servicio documental de Servicios y Proyectos existe pero está inactivo."
        );
      }

      idServicio =
        servicios[0].id_servicio;

    } else {
      const [creado] =
        await conexion.query(`
          INSERT INTO servicios_proyectos (
            id_area,
            id_proyecto,
            nombre_servicio,
            descripcion,
            estado
          )
          VALUES (
            2,
            NULL,
            ?,
            ?,
            1
          )
        `, [
          nombreServicio,
          "Estructura real para documentos de Servicios, clientes y unidades"
        ]);

      idServicio =
        creado.insertId;
    }

    const idRaiz =
      await obtenerOCrearCarpeta(
        conexion,
        {
          idServicio,
          nombre:
            "Servicios y Proyectos",
          descripcion:
            "Raíz documental de Servicios y Proyectos",
          idPadre:
            null
        }
      );

    await registrarUbicacion(
      conexion,
      "servicios",
      0,
      idRaiz
    );

    const [clientes] =
      await conexion.query(`
        SELECT
          id_cliente,
          nombre_cliente
        FROM clientes
        WHERE estado = 1
        ORDER BY id_cliente
        FOR UPDATE
      `);

    const clientesPreparados =
      new Map();

    for (const cliente of clientes) {
      if (
        normalizar(
          cliente.nombre_cliente
        ) === "OTROS"
      ) {
        continue;
      }

      const idCarpetaCliente =
        await obtenerOCrearCarpeta(
          conexion,
          {
            idServicio,
            nombre:
              cliente.nombre_cliente,
            descripcion:
              "Carpeta documental del cliente",
            idPadre:
              idRaiz
          }
        );

      await registrarUbicacion(
        conexion,
        "cliente",
        cliente.id_cliente,
        idCarpetaCliente
      );

      clientesPreparados.set(
        Number(cliente.id_cliente),
        idCarpetaCliente
      );
    }

    const [unidades] =
      await conexion.query(`
        SELECT
          uc.id_unidad,
          uc.id_cliente,
          uc.nombre_unidad
        FROM unidades_clientes uc
        INNER JOIN clientes cl
          ON cl.id_cliente =
             uc.id_cliente
        WHERE uc.estado = 1
          AND cl.estado = 1
        ORDER BY
          uc.id_cliente,
          uc.id_unidad
        FOR UPDATE
      `);

    let unidadesCreadas = 0;

    for (const unidad of unidades) {
      const idCarpetaCliente =
        clientesPreparados.get(
          Number(unidad.id_cliente)
        );

      /*
       * Corresponde al cliente OTROS:
       * no se crea una estructura que el
       * usuario pidió reemplazar.
       */
      if (!idCarpetaCliente) {
        continue;
      }

      const idCarpetaUnidad =
        await obtenerOCrearCarpeta(
          conexion,
          {
            idServicio,
            nombre:
              unidad.nombre_unidad,
            descripcion:
              "Carpeta documental de la unidad",
            idPadre:
              idCarpetaCliente
          }
        );

      await registrarUbicacion(
        conexion,
        "unidad",
        unidad.id_unidad,
        idCarpetaUnidad
      );

      unidadesCreadas++;
    }

    await conexion.commit();

    console.log(
      "ESTRUCTURA DE SERVICIOS Y PROYECTOS PREPARADA CORRECTAMENTE"
    );

    console.log(
      "Servicio:",
      idServicio
    );

    console.log(
      "Raíz:",
      idRaiz
    );

    console.log(
      "Clientes preparados:",
      clientesPreparados.size
    );

    console.log(
      "Unidades preparadas:",
      unidadesCreadas
    );

    console.log(
      "El cliente OTROS no fue eliminado de la base de datos."
    );

    console.log(
      "Los proyectos y sus carpetas existentes no fueron modificados."
    );

    console.log(
      "Google Drive no fue modificado por esta migración."
    );

  } catch (error) {
    try {
      await conexion.rollback();
    } catch {}

    console.error(
      "MIGRACIÓN CANCELADA:",
      error.message
    );

    process.exitCode = 1;

  } finally {
    await conexion.end();
  }
}

principal();
