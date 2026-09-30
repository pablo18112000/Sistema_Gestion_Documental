// =====================================
// GOOGLE DRIVE — CONEXIÓN MEDIANTE OAUTH
// =====================================

require("dotenv").config();

const { google } = require("googleapis");

// Credenciales configuradas en Railway.
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Se obtiene después de autorizar la cuenta COEMSA.
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

if (refreshToken) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
}

// Cliente de Google Drive.
const drive = google.drive({
  version: "v3",
  auth: oauth2Client
});

// Conserva la exportación utilizada por driveController.js.
module.exports = drive;

// Permite utilizar OAuth desde el módulo de autorización.
module.exports.oauth2Client = oauth2Client;