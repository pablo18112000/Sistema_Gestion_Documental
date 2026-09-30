const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const { google } = require("googleapis");

async function iniciar() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Faltan las credenciales OAuth en backend/.env.");
  }

  if (
    GOOGLE_REDIRECT_URI !==
    "http://localhost:3000/oauth2callback"
  ) {
    throw new Error(
      "En backend/.env usa http://localhost:3000/oauth2callback"
    );
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  const estado = crypto.randomBytes(32).toString("hex");
  const { codeVerifier, codeChallenge } =
    await auth.generateCodeVerifierAsync();

  const enlace = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: estado,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    login_hint: "coemsaingenieros@gmail.com"
  });

  let procesando = false;

  const servidor = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const url = new URL(req.url, "http://localhost:3000");

    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      return res.end("Ruta no encontrada.");
    }

    if (url.searchParams.get("state") !== estado) {
      res.writeHead(400);
      return res.end("Solicitud inválida. Vuelve a iniciar el proceso.");
    }

    if (procesando) {
      res.writeHead(409);
      return res.end("La autorización ya está en proceso.");
    }

    procesando = true;

    try {
      const codigo = url.searchParams.get("code");

      if (url.searchParams.has("error") || !codigo) {
        throw new Error("Autorización cancelada o incompleta.");
      }

      const { tokens } = await auth.getToken({
        code: codigo,
        codeVerifier
      });

      if (!tokens.refresh_token) {
        throw new Error("Google no entregó el permiso de renovación.");
      }

      auth.setCredentials(tokens);

      const drive = google.drive({ version: "v3", auth });
      const { data } = await drive.about.get({
        fields: "user(emailAddress)"
      });

      if (
        data.user?.emailAddress?.toLowerCase() !==
        "coemsaingenieros@gmail.com"
      ) {
        throw new Error("Debes autorizar la cuenta de COEMSA.");
      }

      const carpeta = path.join(__dirname, "credentials");
      fs.mkdirSync(carpeta, { recursive: true });

      fs.writeFileSync(
        path.join(carpeta, "token.json"),
        JSON.stringify(
          { refresh_token: tokens.refresh_token },
          null,
          2
        ),
        { mode: 0o600 }
      );

      res.end(
        "Cuenta COEMSA autorizada. Puedes cerrar esta pestaña."
      );

      console.log(
        "LISTO: permiso guardado en backend/credentials/token.json"
      );
      console.log("No compartas ni subas ese archivo a GitHub.");
    } catch (error) {
      res.writeHead(400);
      res.end("No se completó la autorización. Revisa la terminal.");

      // No imprimir respuestas completas que puedan contener tokens.
      console.error(
        "No se completó el proceso. Comprueba la cuenta COEMSA, " +
        "las credenciales, la URI y que Google Drive API esté habilitada."
      );
    } finally {
      clearTimeout(limite);
      servidor.close();
    }
  });

  servidor.on("error", (error) => {
    clearTimeout(limite);
    console.error(
      error.code === "EADDRINUSE"
        ? "El puerto 3000 está ocupado. Detén tu servidor local con Ctrl+C."
        : "No se pudo iniciar el servidor de autorización."
    );
  });

  const limite = setTimeout(() => {
    console.log("Tiempo agotado. Ejecuta el archivo nuevamente.");
    servidor.close();
  }, 10 * 60 * 1000);

  servidor.listen(3000, "localhost", () => {
    console.log("Abre este enlace en tu navegador:");
    console.log(enlace);
  });
}

iniciar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});