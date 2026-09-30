const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const http = require("http");
const crypto = require("crypto");
const readline = require("readline");
const { google } = require("googleapis");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const PUERTO = 3001;
const REDIRECT_URI = "http://localhost:3001/oauth2callback";

function preguntar(texto) {
  const interfaz = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    interfaz.question(texto, (respuesta) => {
      interfaz.close();
      resolve(respuesta.trim());
    });
  });
}

function codigoSeguro(error) {
  const detalle = error.response?.data?.error;
  const valor =
    typeof detalle === "string"
      ? detalle
      : error.code || "ERROR_AUTORIZACION";

  return /^[a-zA-Z0-9_.-]{1,80}$/.test(String(valor))
    ? String(valor)
    : "ERROR_AUTORIZACION";
}

async function iniciar() {
  for (const nombre of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ]) {
    if (!process.env[nombre]?.trim()) {
      console.error("Falta configurar:", nombre);
      process.exitCode = 1;
      return;
    }
  }

  const correoEsperado = (
    await preguntar(
      "Escribe el correo de Google que tiene el Drive de COEMSA: "
    )
  ).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoEsperado)) {
    console.error("El correo no tiene un formato válido.");
    process.exitCode = 1;
    return;
  }

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  const estado = crypto.randomBytes(32).toString("hex");
  const verificador = crypto.randomBytes(32).toString("base64url");

  const desafio = crypto
    .createHash("sha256")
    .update(verificador)
    .digest("base64url");

  const urlGoogle = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    login_hint: correoEsperado,
    state: estado,
    code_challenge: desafio,
    code_challenge_method: "S256"
  });

  let procesando = false;
  let temporizador;

  const servidor = http.createServer((req, res) => {
    atender(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        });
      }

      res.end("No se pudo completar la autorización.");
      console.error("ERROR_LOCAL_AUTORIZACION");
      cerrar();
    });
  });

  function cerrar() {
    clearTimeout(temporizador);
    servidor.close();
  }

  async function atender(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    const url = new URL(req.url, "http://localhost:3001");

    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Método no permitido.");
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(302, { Location: urlGoogle });
      res.end();
      return;
    }

    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Página no encontrada.");
      return;
    }

    if (url.searchParams.get("state") !== estado) {
      res.writeHead(400);
      res.end(
        "La solicitud no corresponde a esta autorización. " +
        "Abre nuevamente http://localhost:3001"
      );
      return;
    }

    if (procesando) {
      res.writeHead(409);
      res.end("La autorización ya está siendo procesada.");
      return;
    }

    if (url.searchParams.has("error")) {
      res.writeHead(400);
      res.end("No se concedió la autorización. Revisa la terminal.");
      console.error("Google no concedió la autorización.");
      cerrar();
      return;
    }

    const codigo = url.searchParams.get("code");

    if (!codigo) {
      res.writeHead(400);
      res.end("No se recibió el código de autorización.");
      return;
    }

    procesando = true;

    try {
      const { tokens } = await oauth.getToken({
        code: codigo,
        codeVerifier: verificador,
        redirect_uri: REDIRECT_URI
      });

      oauth.setCredentials(tokens);

      const drive = google.drive({
        version: "v3",
        auth: oauth
      });

      const cuenta = await drive.about.get(
        {
          fields: "user(emailAddress)"
        },
        {
          timeout: 20000
        }
      );

      const correoAutorizado = String(
        cuenta.data.user?.emailAddress || ""
      ).toLowerCase();

      if (correoAutorizado !== correoEsperado) {
        res.writeHead(400);
        res.end(
          "Elegiste otra cuenta de Google. " +
          "Ejecuta nuevamente el programa con la cuenta de COEMSA."
        );

        console.error(
          "La cuenta elegida no coincide con el correo indicado. " +
          "No se guardó el token."
        );
        return;
      }

      if (!tokens.refresh_token) {
        res.writeHead(400);
        res.end("Google no entregó el refresh token. Revisa la terminal.");

        console.error(
          "NO_REFRESH_TOKEN: Google no entregó un token de renovación."
        );
        return;
      }

      // Guarda el token fuera del proyecto para no subirlo a GitHub.
      const carpetaPrivada = path.join(
        os.homedir(),
        ".coemsa-oauth"
      );

      await fs.mkdir(carpetaPrivada, {
        recursive: true,
        mode: 0o700
      });

      const nombreArchivo =
        "drive-token-" +
        Date.now() +
        "-" +
        crypto.randomBytes(4).toString("hex") +
        ".json";

      const archivoToken = path.join(
        carpetaPrivada,
        nombreArchivo
      );

      await fs.writeFile(
        archivoToken,
        JSON.stringify(
          {
            cuenta: correoAutorizado,
            refresh_token: tokens.refresh_token
          },
          null,
          2
        ),
        {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx"
        }
      );

      console.log("\nAUTORIZACIÓN COMPLETADA.");
      console.log("Cuenta:", correoAutorizado);
      console.log("Token guardado en:");
      console.log(archivoToken);
      console.log("\nNo compartas el contenido de ese archivo.");

      res.writeHead(200);
      res.end(
        "Autorización completada. " +
        "Puedes cerrar esta pestaña y volver a la terminal. " +
        "El token se guardó en un archivo privado."
      );
    } catch (error) {
      console.error(
        "\nNo se pudo completar la autorización. Código:",
        codigoSeguro(error)
      );

      res.writeHead(500);
      res.end(
        "No se pudo completar la autorización. " +
        "Revisa el código de error en la terminal."
      );
    } finally {
      cerrar();
    }
  }

  servidor.on("error", (error) => {
    clearTimeout(temporizador);

    console.error(
      "No se pudo iniciar la autorización:",
      codigoSeguro(error)
    );

    if (error.code === "EADDRINUSE") {
      console.error(
        "El puerto 3001 está ocupado. Cierra el otro programa que lo usa."
      );
    }

    process.exitCode = 1;
  });

  servidor.listen(PUERTO, "127.0.0.1", () => {
    console.log("\nAbre esta dirección en tu navegador:");
    console.log("http://localhost:3001");
    console.log("\nSelecciona la cuenta:", correoEsperado);
    console.log("Tienes 10 minutos para completar la autorización.");

    temporizador = setTimeout(() => {
      console.log(
        "\nTerminó el tiempo de autorización. " +
        "Ejecuta nuevamente el programa si es necesario."
      );

      cerrar();
    }, 10 * 60 * 1000);
  });
}

iniciar().catch((error) => {
  console.error("No se pudo iniciar:", codigoSeguro(error));
  process.exitCode = 1;
});