const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../.env")
});

const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const secret = process.env.SESSION_SECRET;

if (!secret || secret.length < 64) {
  throw new Error(
    "Configura SESSION_SECRET con la clave generada anteriormente."
  );
}

const enProduccion =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_ID);

const duracion = 8 * 60 * 60 * 1000;

const almacen = new MySQLStore({
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,

  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: duracion,

  schema: {
    tableName: "sesiones_coemsa",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data"
    }
  }
});

almacen.onReady()
  .then(() => {
    console.log("Almacenamiento de sesiones MySQL preparado.");
  })
  .catch((error) => {
    console.error(
      "No se pudo preparar el almacenamiento de sesiones:",
      error.code || "ERROR_MYSQL"
    );
  });

module.exports = session({
  name: "coemsa.sid",
  secret,
  store: almacen,
  resave: false,
  saveUninitialized: false,
  rolling: true,

  cookie: {
    httpOnly: true,
    secure: enProduccion,
    sameSite: "lax",
    maxAge: duracion,
    path: "/"
  }
});