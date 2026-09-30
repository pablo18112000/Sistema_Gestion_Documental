const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

async function probar() {
  const variables = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_FOLDER_ID"
  ];

  console.log("\nCONFIGURACIÓN OAUTH");
  console.log("Solo se muestra si cada variable existe.\n");

  const faltantes = [];

  for (const nombre of variables) {
    const configurada = Boolean(
      process.env[nombre]?.trim()
    );

    console.log(
      nombre + ": " + (configurada ? "CONFIGURADA" : "FALTA")
    );

    if (!configurada) {
      faltantes.push(nombre);
    }
  }

  if (faltantes.length > 0) {
    console.log("\nNo se realizó la conexión.");

    if (faltantes.includes("GOOGLE_REFRESH_TOKEN")) {
      console.log(
        "Falta autorizar la cuenta COEMSA y configurar su refresh token."
      );
    }

    console.log(
      "No compartas los valores de las variables; solo este resultado."
    );

    process.exitCode = 1;
    return;
  }

  const drive = require("./config/googleDrive");

  console.log("\nCOMPROBANDO CUENTA AUTORIZADA…");

  const cuenta = await drive.about.get(
    {
      fields: "user(emailAddress,displayName)"
    },
    {
      timeout: 20000
    }
  );

  console.log(
    "Cuenta autorizada:",
    cuenta.data.user?.emailAddress || "No disponible"
  );

  console.log("\nCOMPROBANDO CARPETA…");

  const respuesta = await drive.files.get(
    {
      fileId: process.env.GOOGLE_DRIVE_FOLDER_ID.trim(),
      fields: "name,mimeType,trashed,capabilities(canAddChildren)",
      supportsAllDrives: true
    },
    {
      timeout: 20000
    }
  );

  const carpeta = respuesta.data;

  if (carpeta.trashed) {
    console.log("La carpeta configurada está en la papelera.");
    process.exitCode = 1;
    return;
  }

  if (carpeta.mimeType !== "application/vnd.google-apps.folder") {
    console.log("El ID configurado no corresponde a una carpeta.");
    process.exitCode = 1;
    return;
  }

  console.log("Carpeta:", carpeta.name);

  const puedeAgregar =
    carpeta.capabilities?.canAddChildren === true;

  console.log(
    "Permiso para agregar archivos:",
    puedeAgregar ? "SÍ" : "NO"
  );

  if (!puedeAgregar) {
    console.log(
      "\nLa cuenta puede consultar la carpeta, pero no agregar archivos."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nCONEXIÓN OAUTH Y ACCESO A LA CARPETA CORRECTOS.");
  console.log("No se subió ni modificó ningún archivo.");
  console.log("La prueba de subida se realizará después.");
}

probar().catch((error) => {
  const datos = error.response?.data;
  const detalle = datos?.error;

  const codigoOAuth =
    typeof detalle === "string" ? detalle : "";

  const razonAPI =
    typeof detalle === "object"
      ? detalle?.errors?.[0]?.reason
      : "";

  function codigoSeguro(valor) {
    const texto = String(valor || "");

    return /^[a-zA-Z0-9_.-]{1,80}$/.test(texto)
      ? texto
      : "NO_DISPONIBLE";
  }

  console.error("\nNO SE PUDO COMPLETAR LA PRUEBA.");

  console.error(
    "Estado HTTP:",
    Number(error.response?.status) || "No disponible"
  );

  console.error(
    "Código:",
    codigoSeguro(codigoOAuth || error.code)
  );

  if (razonAPI) {
    console.error("Motivo:", codigoSeguro(razonAPI));
  }

  if (codigoOAuth === "invalid_grant") {
    console.error(
      "La autorización no es válida o dejó de estar vigente. " +
      "Será necesario volver a autorizar la cuenta."
    );
  }

  if (codigoOAuth === "invalid_client") {
    console.error(
      "Hay que revisar el ID y el secreto del cliente OAuth."
    );
  }

  console.error(
    "No compartas claves, tokens ni el contenido de tu archivo .env."
  );

  process.exitCode = 1;
});