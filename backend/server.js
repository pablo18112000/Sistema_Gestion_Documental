const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});

const express = require("express");

require("./config/db");

const sessionMiddleware = require("./config/session");

const rutasUsuarios = require("./routes/usuarios");
const rutasDocumentos = require("./routes/documentos");
const rutasAprobaciones = require("./routes/aprobaciones");
const rutasAsignaciones = require("./routes/asignaciones");
const rutasProyectos = require("./routes/proyectos");
const rutasArchivos = require("./routes/archivos");

const app = express();

const produccion =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_ID);

const carpetaFrontend = path.join(__dirname, "frontend");

// =====================================
// CONFIGURACIÓN
// =====================================

app.disable("x-powered-by");

if (produccion) {
  app.set("trust proxy", 1);
}

app.use(express.json({
  limit: "1mb"
}));

app.use(express.urlencoded({
  extended: false,
  limit: "1mb"
}));

app.use(sessionMiddleware);

// =====================================
// ESTADO DEL SERVIDOR
// =====================================

app.get("/api", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    success: true,
    mensaje: "Servidor Gestión Documental COEMSA activo."
  });
});

// =====================================
// EVITAR CACHÉ DE DATOS PRIVADOS
// =====================================

app.use(
  [
    "/usuarios",
    "/documentos",
    "/aprobaciones",
    "/asignaciones",
    "/proyectos",
    "/archivos"
  ],
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  }
);

// =====================================
// RUTAS
// =====================================

app.use("/usuarios", rutasUsuarios);
app.use("/documentos", rutasDocumentos);
app.use("/aprobaciones", rutasAprobaciones);
app.use("/asignaciones", rutasAsignaciones);
app.use("/proyectos", rutasProyectos);
app.use("/archivos", rutasArchivos);

// =====================================
// BLOQUEAR ACCESO DIRECTO A UPLOADS
// =====================================

app.use("/uploads", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.status(403).json({
    success: false,
    mensaje:
      "El acceso directo está deshabilitado. " +
      "Utiliza el visor de documentos con tu sesión."
  });
});

// =====================================
// PÁGINAS WEB
// =====================================

app.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");

  res.sendFile(
    path.join(carpetaFrontend, "login.html")
  );
});

app.use(express.static(carpetaFrontend, {
  index: false,
  dotfiles: "deny"
}));

// =====================================
// RUTA NO ENCONTRADA
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    mensaje: "La ruta solicitada no existe."
  });
});

// =====================================
// MANEJO DE ERRORES
// =====================================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(
    "Error del servidor:",
    error.code || error.type || error.name || "ERROR_INTERNO"
  );

  let estado = 500;
  let mensaje = "Ocurrió un error en el servidor.";

  if (error.type === "entity.parse.failed") {
    estado = 400;
    mensaje = "El contenido enviado no tiene un formato JSON válido.";
  } else if (
    error.type === "entity.too.large" ||
    error.code === "LIMIT_FILE_SIZE"
  ) {
    estado = 413;
    mensaje = "El contenido enviado supera el tamaño permitido.";
  } else if (error.name === "MulterError") {
    estado = 400;
    mensaje = "No se pudo procesar el archivo enviado.";
  } else if (
    error.status === 404 ||
    error.statusCode === 404
  ) {
    estado = 404;
    mensaje = "El recurso solicitado no existe.";
  }

  res.status(estado).json({
    success: false,
    mensaje
  });
});

// =====================================
// INICIAR SERVIDOR
// =====================================

const puerto = Number(process.env.PORT || 3000);

if (
  !Number.isInteger(puerto) ||
  puerto < 1 ||
  puerto > 65535
) {
  console.error("La variable PORT no contiene un puerto válido.");
  process.exit(1);
}

const servidor = app.listen(puerto, "0.0.0.0", () => {
  console.log("RUTAS USUARIOS CARGADAS");
  console.log("RUTAS DOCUMENTOS CARGADAS");
  console.log("RUTAS APROBACIONES CARGADAS");
  console.log("RUTAS ASIGNACIONES CARGADAS");
  console.log("RUTAS PROYECTOS CARGADAS");
  console.log("RUTAS ARCHIVOS CARGADAS");
  console.log("Servidor Gestión Documental iniciado");
  console.log("Puerto:", puerto);
});

servidor.on("error", (error) => {
  console.error(
    "No se pudo iniciar el servidor:",
    error.code || "ERROR_INTERNO"
  );

  process.exit(1);
});