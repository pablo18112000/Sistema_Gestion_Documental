const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");

try {
  const archivo = path.join(
    __dirname,
    "controllers/subcarpetasDrive.js"
  );

  const modulo = path.join(
    __dirname,
    "controllers/jerarquiaDrive.js"
  );

  new vm.Script(fs.readFileSync(modulo, "utf8"), {
    filename: "jerarquiaDrive.js"
  });

  const original = fs.readFileSync(archivo, "utf8");

  let contenido = original
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ");

  if (contenido.includes('require("./jerarquiaDrive")')) {
    throw new Error("La integración ya fue aplicada.");
  }

  const buscar = "let padreDrive = raiz;";

  const posicion = contenido.indexOf(buscar);

  if (
    posicion < 0 ||
    contenido.indexOf(buscar, posicion + buscar.length) >= 0
  ) {
    throw new Error(
      "El archivo no coincide con la versión esperada. No se modificó."
    );
  }

  contenido = contenido.replace(
    buscar,
    `let padreDrive = await jerarquia.prepararPadre(
    conexion,
    carpeta,
    raiz
  );`
  );

  contenido =
    'const jerarquia = require("./jerarquiaDrive");\n' +
    contenido;

  new vm.Script(contenido, {
    filename: "subcarpetasDrive.js"
  });

  const respaldo = fs.mkdtempSync(
    path.join(os.homedir(), "coemsa-respaldo-jerarquia-")
  );

  fs.writeFileSync(
    path.join(respaldo, "subcarpetasDrive.js"),
    original,
    "utf8"
  );

  try {
    fs.writeFileSync(archivo, contenido, "utf8");
  } catch (error) {
    fs.writeFileSync(archivo, original, "utf8");
    throw error;
  }

  console.log("Integración completada.");
  console.log("Sintaxis JavaScript comprobada.");
  console.log("Respaldo:", respaldo);
  console.log("Este script no movió archivos en Drive.");
} catch (error) {
  console.error("No se completó la integración:", error.message);
  process.exitCode = 1;
}