const crypto = require("crypto");
const drive = require("../config/googleDrive");

const MIME_CARPETA = "application/vnd.google-apps.folder";
const opciones = { timeout: 30000, retry: false };

function fallo(mensaje) {
  const error = new Error(mensaje);
  error.status = 409;
  return error;
}

function validarId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    throw fallo("El identificador de una carpeta de Drive no es válido.");
  }

  return String(id);
}

async function consultarCarpeta(id) {
  const { data } = await drive.files.get({
    fileId: validarId(id),
    fields: "id,name,mimeType,trashed,parents,capabilities(canAddChildren)"
  }, opciones);

  if (
    data.trashed ||
    data.mimeType !== MIME_CARPETA ||
    data.capabilities?.canAddChildren !== true
  ) {
    throw fallo("Una carpeta de la organización no está disponible.");
  }

  return data;
}

async function obtenerNivel(padre, nombre, clave) {
  validarId(padre);

  if (!/^[a-z0-9-]+$/.test(clave)) {
    throw fallo("La clave de organización no es válida.");
  }

  const { data } = await drive.files.list({
    q:
      "trashed = false" +
      " and mimeType = '" + MIME_CARPETA + "'" +
      " and '" + padre + "' in parents" +
      " and appProperties has { key='coemsa_nivel' and value='" +
      clave + "' }",
    fields: "files(id),nextPageToken,incompleteSearch",
    pageSize: 2
  }, opciones);

  const carpetas = data.files || [];

  if (
    carpetas.length > 1 ||
    data.nextPageToken ||
    data.incompleteSearch
  ) {
    throw fallo("No se pudo identificar una carpeta de organización única.");
  }

  if (carpetas.length === 1) {
    const existente = await consultarCarpeta(carpetas[0].id);

    if (!existente.parents?.includes(padre)) {
      throw fallo("La carpeta de organización cambió de ubicación.");
    }

    return existente.id;
  }

  const creada = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: MIME_CARPETA,
      parents: [padre],
      appProperties: {
        coemsa_nivel: clave
      }
    },
    fields: "id"
  }, opciones);

  if (!creada.data.id) {
    throw fallo("Drive no confirmó la creación de una carpeta.");
  }

  console.log("Nivel de organización creado:", clave, creada.data.id);

  return creada.data.id;
}

exports.prepararPadre = async (conexion, carpeta, raiz) => {
  // Los proyectos aún sin clasificación conservan su ubicación.
  if (carpeta.id_proyecto == null) return raiz;

  const [filas] = await conexion.execute(`
    SELECT
      p.nombre_proyecto,
      c.id_cliente,
      c.nombre_cliente,
      c.estado AS cliente_activo,
      u.id_unidad,
      u.nombre_unidad,
      u.estado AS unidad_activa
    FROM proyecto_unidad pu
    INNER JOIN proyectos p
      ON p.id_proyecto = pu.id_proyecto
    INNER JOIN unidades_clientes u
      ON u.id_unidad = pu.id_unidad
    INNER JOIN clientes c
      ON c.id_cliente = u.id_cliente
    WHERE pu.id_proyecto = ?
  `, [carpeta.id_proyecto]);

  if (!filas.length) return raiz;

  const datos = filas[0];

  if (
    Number(datos.cliente_activo) !== 1 ||
    Number(datos.unidad_activa) !== 1
  ) {
    throw fallo("El cliente o la unidad del proyecto está inactivo.");
  }

  const principal = carpeta.cadena?.[0];

  if (!principal || principal.id_carpeta_padre !== null) {
    throw fallo("No se encontró la carpeta principal del proyecto.");
  }

  // Serializa la creación de niveles compartidos entre proyectos.
  // Se usa la misma conexión que mantiene la transacción de subida.
  const claveBloqueo = "coemsa-drive-" +
    crypto.createHash("sha256").update(raiz).digest("hex").slice(0, 32);

  const [bloqueo] = await conexion.execute(
    "SELECT GET_LOCK(?, 10) AS adquirido",
    [claveBloqueo]
  );

  if (Number(bloqueo[0].adquirido) !== 1) {
    const error = new Error(
      "La organización de Drive está ocupada. Intenta en unos momentos."
    );
    error.status = 503;
    throw error;
  }

  try {
    const servicios = await obtenerNivel(
      raiz,
      "Servicios y Proyectos",
      "servicios"
    );

    const cliente = await obtenerNivel(
      servicios,
      datos.nombre_cliente,
      "cliente-" + datos.id_cliente
    );

    const unidad = await obtenerNivel(
      cliente,
      datos.nombre_unidad,
      "unidad-" + datos.id_unidad
    );

    if (principal.id_drive) {
      const existente = await consultarCarpeta(principal.id_drive);
      const padres = existente.parents || [];

      // Solo permite trasladar desde la raíz conocida o reutilizar
      // una carpeta que ya se encuentra en la unidad correcta.
      if (
        padres.length !== 1 ||
        (padres[0] !== raiz && padres[0] !== unidad)
      ) {
        throw fallo(
          "La carpeta del proyecto está en una ubicación inesperada."
        );
      }

      const mover = padres[0] === raiz;
      const renombrar = existente.name !== datos.nombre_proyecto;

      if (mover || renombrar) {
        const solicitud = {
          fileId: existente.id,
          requestBody: {
            name: datos.nombre_proyecto
          },
          fields: "id,name,parents"
        };

        if (mover) {
          solicitud.addParents = unidad;
          solicitud.removeParents = raiz;
        }

        const { data: actualizada } = await drive.files.update(
          solicitud,
          opciones
        );

        if (!actualizada.parents?.includes(unidad)) {
          throw fallo("No se pudo confirmar la nueva ubicación del proyecto.");
        }

        console.log(
          "Carpeta de proyecto organizada:",
          carpeta.id_proyecto,
          existente.id
        );
      }
    }

    return unidad;
  } finally {
    const [liberacion] = await conexion.execute(
      "SELECT RELEASE_LOCK(?) AS liberado",
      [claveBloqueo]
    );

    if (Number(liberacion[0].liberado) !== 1) {
      throw fallo("No se pudo confirmar la liberación del bloqueo de Drive.");
    }
  }
};