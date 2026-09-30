const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

const raiz = __dirname;

function leer(relativa) {
  return fs.readFileSync(path.join(raiz, relativa), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ");
}

function sustituirBloque(texto, inicio, fin, nuevo) {
  const desde = texto.indexOf(inicio);
  const hasta = texto.indexOf(fin, desde + inicio.length);

  if (desde < 0 || hasta < 0) {
    throw new Error(
      "No se encontró el bloque esperado: " + inicio
    );
  }

  return texto.slice(0, desde) + nuevo + "\n\n" + texto.slice(hasta);
}

function reemplazarUnaVez(texto, original, nuevo) {
  const posicion = texto.indexOf(original);

  if (
    posicion < 0 ||
    texto.indexOf(original, posicion + original.length) >= 0
  ) {
    throw new Error(
      "No se encontró una coincidencia única para actualizar el formulario."
    );
  }

  return texto.slice(0, posicion) +
    nuevo +
    texto.slice(posicion + original.length);
}

try {
  const modulo = leer("controllers/subcarpetasDrive.js");
  new vm.Script(modulo, { filename: "subcarpetasDrive.js" });

  let controlador = leer("controllers/driveController.js");
  let formulario = leer("frontend/subir_documento.html");

  if (controlador.includes('require("./subcarpetasDrive")')) {
    throw new Error(
      "El controlador ya fue actualizado. No vuelvas a ejecutar este script."
    );
  }

  controlador = sustituirBloque(
    controlador,
    "exports.destinos = async",
    "async function comprobarDestino(",
    `exports.destinos = async (req, res) => {
  try {
    const carpetas = await subcarpetas.listarDestinos(pool, req.usuario);
    return res.json({ success: true, carpetas });
  } catch (error) {
    return responderError(res, error);
  }
};`
  );

  controlador = sustituirBloque(
    controlador,
    "async function comprobarDestino(",
    "exports.validarDestino =",
    `async function comprobarDestino(conexion, idCarpeta, usuario, bloquear) {
  return subcarpetas.comprobar(
    conexion,
    idCarpeta,
    usuario,
    bloquear
  );
}`
  );

  controlador = sustituirBloque(
    controlador,
    "async function obtenerCarpetaDrive(",
    "exports.subirArchivo =",
    `async function obtenerCarpetaDrive(conexion, carpeta) {
  return subcarpetas.asegurarEnDrive(conexion, carpeta);
}`
  );

  controlador =
    'const subcarpetas = require("./subcarpetasDrive");\n' +
    controlador;

  formulario = reemplazarUnaVez(
    formulario,
    'ubicacion + " — " + carpeta.nombre_carpeta,',
    'carpeta.ruta_completa || (ubicacion + " — " + carpeta.nombre_carpeta),'
  );

  new vm.Script(controlador, { filename: "driveController.js" });

  const scripts = [
    ...formulario.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)
  ];

  for (const script of scripts) {
    if (script[1].trim()) {
      new vm.Script(script[1], {
        filename: "subir_documento.html"
      });
    }
  }

  const cambios = [
    ["controllers/driveController.js", controlador],
    ["frontend/subir_documento.html", formulario]
  ];

  const respaldo = fs.mkdtempSync(
    path.join(os.homedir(), "coemsa-respaldo-subcarpetas-")
  );

  for (const [relativa] of cambios) {
    const destino = path.join(respaldo, relativa);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(raiz, relativa), destino);
  }

  try {
    for (const [relativa, contenido] of cambios) {
      fs.writeFileSync(path.join(raiz, relativa), contenido, "utf8");
    }
  } catch (error) {
    for (const [relativa] of cambios) {
      fs.copyFileSync(
        path.join(respaldo, relativa),
        path.join(raiz, relativa)
      );
    }

    throw error;
  }

  console.log("Actualización completada.");
  console.log("Sintaxis JavaScript comprobada.");
  console.log("Respaldo guardado en:", respaldo);
  console.log("Todavía debes publicar los cambios en Railway.");
} catch (error) {
  console.error("No se completó la actualización:", error.message);
  process.exitCode = 1;
}