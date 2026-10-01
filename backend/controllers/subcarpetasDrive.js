const jerarquia = require("./jerarquiaDrive");
const drive = require("../config/googleDrive");

function fallo(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function idValido(valor) {
  return /^\d+$/.test(String(valor)) &&
    Number.isSafeInteger(Number(valor)) &&
    Number(valor) > 0 &&
    Number(valor) <= 2147483647;
}

// Recorre únicamente carpetas del mismo servicio.
// Evita ciclos y relaciones entre proyectos diferentes.
async function cadena(conexion, carpeta, bloquear) {
  const resultado = [];
  const visitadas = new Set();
  let id = carpeta.id_carpeta;

  while (id !== null) {
    if (resultado.length >= 10 || visitadas.has(String(id))) {
      throw fallo(409, "La estructura de carpetas no es válida.");
    }

    visitadas.add(String(id));

    const [filas] = await conexion.query(`
      SELECT
        id_carpeta,
        id_servicio,
        nombre_carpeta,
        id_carpeta_padre,
        id_drive
      FROM carpetas_documentos
      WHERE id_carpeta = ?
      ${bloquear ? "FOR UPDATE" : ""}
    `, [id]);

    const actual = filas[0];

    if (
      !actual ||
      Number(actual.id_servicio) !== Number(carpeta.id_servicio)
    ) {
      throw fallo(
        409,
        "La carpeta y sus padres deben pertenecer al mismo servicio."
      );
    }

    resultado.unshift(actual);
    id = actual.id_carpeta_padre;
  }

  return resultado;
}

exports.comprobar = async (
  conexion,
  idCarpeta,
  usuario,
  bloquear
) => {
  if (!idValido(idCarpeta)) {
    throw fallo(400, "Selecciona una carpeta válida.");
  }

  const [filas] = await conexion.query(`
    SELECT
      c.id_carpeta,
      c.id_servicio,
      c.nombre_carpeta,
      c.id_carpeta_padre,
      c.id_drive,
      s.id_proyecto,
      s.id_area
    FROM carpetas_documentos c
    INNER JOIN servicios_proyectos s
      ON s.id_servicio = c.id_servicio
    INNER JOIN areas a
      ON a.id_area = s.id_area
    WHERE c.id_carpeta = ?
      AND s.estado = 1
      AND a.estado = 1
    ${bloquear ? "FOR UPDATE" : ""}
  `, [Number(idCarpeta)]);

  const carpeta = filas[0];

  if (!carpeta) {
    throw fallo(404, "La carpeta no está disponible.");
  }

  if (usuario.nombre_rol !== "Administrador") {
    if (carpeta.id_proyecto !== null) {
      const [asignaciones] = await conexion.query(`
        SELECT id_usuario
        FROM usuario_proyectos
        WHERE id_usuario = ?
          AND id_proyecto = ?
        ${bloquear ? "FOR UPDATE" : ""}
      `, [usuario.id_usuario, carpeta.id_proyecto]);

      if (!asignaciones.length) {
        throw fallo(403, "No tienes permiso para subir a este proyecto.");
      }
    } else if (
      Number(carpeta.id_area) !== Number(usuario.id_area)
    ) {
      throw fallo(403, "Solo puedes subir documentos a tu área.");
    }
  }

  carpeta.cadena = await cadena(conexion, carpeta, bloquear);
  return carpeta;
};

exports.listarDestinos = async (conexion, usuario) => {
  const [filas] = await conexion.query(`
    SELECT
      c.id_carpeta,
      c.id_servicio,
      c.nombre_carpeta,
      c.id_carpeta_padre,
      s.id_proyecto,
      s.id_area,
      p.nombre_proyecto,
      a.nombre_area,
      cl.nombre_cliente,
      uc.nombre_unidad
    FROM carpetas_documentos c
    INNER JOIN servicios_proyectos s
      ON s.id_servicio = c.id_servicio
    INNER JOIN areas a
      ON a.id_area = s.id_area
    LEFT JOIN proyectos p
      ON p.id_proyecto = s.id_proyecto
    LEFT JOIN proyecto_unidad pu
      ON pu.id_proyecto = p.id_proyecto
    LEFT JOIN unidades_clientes uc
      ON uc.id_unidad = pu.id_unidad
    LEFT JOIN clientes cl
      ON cl.id_cliente = uc.id_cliente
    WHERE s.estado = 1
      AND a.estado = 1
      AND (
        ? = 1
        OR (
          s.id_proyecto IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM usuario_proyectos up
            WHERE up.id_usuario = ?
              AND up.id_proyecto = s.id_proyecto
          )
        )
        OR (
          s.id_proyecto IS NULL
          AND s.id_area = ?
        )
      )
    ORDER BY c.id_carpeta
    LIMIT 10001
  `, [
    usuario.nombre_rol === "Administrador" ? 1 : 0,
    usuario.id_usuario,
    usuario.id_area
  ]);

  if (filas.length > 10000) {
    throw fallo(409, "Hay demasiadas carpetas para este selector.");
  }

  const mapa = new Map(
    filas.map((fila) => [String(fila.id_carpeta), fila])
  );

  const destinos = [];

  for (const fila of filas) {
    const nombres = [];
    const visitadas = new Set();
    let actual = fila;
    let valida = true;

    while (actual) {
      if (
        visitadas.size >= 10 ||
        visitadas.has(String(actual.id_carpeta)) ||
        Number(actual.id_servicio) !== Number(fila.id_servicio)
      ) {
        valida = false;
        break;
      }

      visitadas.add(String(actual.id_carpeta));
      nombres.unshift(actual.nombre_carpeta);

      if (actual.id_carpeta_padre === null) break;

      actual = mapa.get(String(actual.id_carpeta_padre));

      if (!actual) {
        valida = false;
        break;
      }
    }

    if (!valida) continue;

    let prefijo;

    if (fila.id_proyecto !== null) {
      prefijo = [
        "Servicios y Proyectos",
        fila.nombre_cliente || "Cliente por clasificar",
        fila.nombre_unidad || "Unidad por clasificar",
        fila.nombre_proyecto || "Proyecto"
      ];

      if (
        nombres[0] &&
        nombres[0].trim().toLowerCase() ===
          String(fila.nombre_proyecto || "").trim().toLowerCase()
      ) {
        nombres.shift();
      }
    } else {
      const area = [1, 3].includes(Number(fila.id_area))
        ? "Administración y Recursos Humanos"
        : Number(fila.id_area) === 4
          ? "Logística"
          : fila.nombre_area;

      prefijo = [area || "Área"];
    }

    destinos.push({
      id_carpeta: fila.id_carpeta,
      nombre_carpeta: fila.nombre_carpeta,
      id_proyecto: fila.id_proyecto,
      nombre_proyecto: fila.nombre_proyecto,
      id_area: fila.id_area,
      nombre_area: fila.nombre_area,
      ruta_completa: [...prefijo, ...nombres].join(" / ")
    });
  }

  return destinos.sort((a, b) =>
    a.ruta_completa.localeCompare(b.ruta_completa, "es")
  );
};

async function verificarCarpeta(idDrive, padreEsperado) {
  const { data } = await drive.files.get({
    fileId: idDrive,
    fields: "id,mimeType,trashed,parents,capabilities(canAddChildren)"
  }, {
    timeout: 20000,
    retry: false
  });

  if (
    data.trashed ||
    data.mimeType !== "application/vnd.google-apps.folder" ||
    data.capabilities?.canAddChildren !== true
  ) {
    throw fallo(409, "Una carpeta de Drive no permite agregar archivos.");
  }

  if (padreEsperado && !data.parents?.includes(padreEsperado)) {
    throw fallo(409, "La ubicación de la carpeta en Drive no coincide.");
  }

  return data.id;
}

exports.asegurarEnDrive = async (conexion, carpeta) => {
  const raiz = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

  if (
    !raiz ||
    !/^[a-zA-Z0-9_-]+$/.test(raiz) ||
    !process.env.GOOGLE_REFRESH_TOKEN?.trim()
  ) {
    throw fallo(503, "La conexión con Drive no está configurada.");
  }

  const niveles = carpeta.cadena;

  if (!Array.isArray(niveles) || !niveles.length) {
    throw fallo(409, "No se validó la estructura de la carpeta.");
  }

  await verificarCarpeta(raiz, null);

  let padreDrive = await jerarquia.prepararPadre(
    conexion,
    carpeta,
    raiz
  );

  const omitirNiveles =
    Number.isSafeInteger(
      Number(
        carpeta.omitir_niveles_drive
      )
    )
      ? Number(
          carpeta.omitir_niveles_drive
        )
      : 0;

  if (
    omitirNiveles < 0 ||
    omitirNiveles >
      niveles.length
  ) {
    throw fallo(
      409,
      "La ubicación de Drive no coincide con la jerarquía documental."
    );
  }

  for (
    const nivel
    of niveles.slice(
      omitirNiveles
    )
  ) {
    let idDrive = nivel.id_drive;

    if (idDrive) {
      await verificarCarpeta(idDrive, padreDrive);
    } else {
      // Recupera una carpeta creada anteriormente si falló
      // el registro posterior en MySQL.
      const respuesta = await drive.files.list({
        q:
          "trashed = false" +
          " and mimeType = 'application/vnd.google-apps.folder'" +
          " and '" + padreDrive + "' in parents" +
          " and appProperties has { key='coemsa_carpeta' and value='" +
          String(nivel.id_carpeta) + "' }",
        fields: "files(id),nextPageToken,incompleteSearch",
        pageSize: 2
      }, {
        timeout: 20000,
        retry: false
      });

      const encontradas = respuesta.data.files || [];

      if (
        encontradas.length > 1 ||
        respuesta.data.nextPageToken ||
        respuesta.data.incompleteSearch
      ) {
        throw fallo(
          409,
          "No se pudo identificar una carpeta única en Drive."
        );
      }

      if (encontradas.length === 1) {
        idDrive = encontradas[0].id;
        await verificarCarpeta(idDrive, padreDrive);
      } else {
        const creada = await drive.files.create({
          requestBody: {
            name: nivel.nombre_carpeta,
            mimeType: "application/vnd.google-apps.folder",
            parents: [padreDrive],
            appProperties: {
              coemsa_carpeta: String(nivel.id_carpeta)
            }
          },
          fields: "id"
        }, {
          timeout: 30000,
          retry: false
        });

        idDrive = creada.data.id;

        if (!idDrive) {
          throw fallo(503, "Drive no confirmó la carpeta.");
        }

        console.log(
          "Carpeta Drive creada:",
          nivel.id_carpeta,
          idDrive
        );
      }

      await conexion.execute(`
        UPDATE carpetas_documentos
        SET id_drive = ?
        WHERE id_carpeta = ?
      `, [idDrive, nivel.id_carpeta]);
    }

    padreDrive = idDrive;
  }

  return padreDrive;
};