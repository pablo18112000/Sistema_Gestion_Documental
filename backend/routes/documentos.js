const express = require("express");
const multer = require("multer");

const controlador = require("../controllers/driveController");
const organizacion = require("../controllers/organizacionController");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(
  verificarSesion,
  permitirRoles("Administrador", "Supervisor", "Usuario")
);

const recibirPDF = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 2,
    fieldSize: 12000
  },
  fileFilter(req, file, callback) {
    if (!file.originalname.toLowerCase().endsWith(".pdf")) {
      const error = new Error("Selecciona un archivo PDF.");
      error.status = 415;
      return callback(error);
    }

    callback(null, true);
  }
}).single("archivo");

let subidasActivas = 0;

// Nueva consulta de organización.
router.get("/organizacion", organizacion.consultar);

// Operaciones existentes.
router.get("/", controlador.listarDocumentos);
router.get("/destinos", controlador.destinos);
router.get("/:id/ver", controlador.verDocumento);

router.post(
  "/subir/:idCarpeta",
  controlador.validarDestino,
  (req, res) => {
    if (subidasActivas >= 3) {
      return res.status(503).json({
        success: false,
        mensaje: "Hay varias subidas en curso. Intenta en unos momentos."
      });
    }

    subidasActivas++;

    recibirPDF(req, res, async (error) => {
      try {
        if (error) {
          const excedeTamano = error.code === "LIMIT_FILE_SIZE";

          return res.status(excedeTamano ? 413 : 400).json({
            success: false,
            mensaje: excedeTamano
              ? "El PDF supera el límite de 10 MB."
              : "Envía un solo PDF y una descripción de hasta 2000 caracteres."
          });
        }

        await controlador.subirArchivo(req, res);
      } catch {
        if (!res.headersSent && !res.destroyed) {
          res.status(500).json({
            success: false,
            mensaje:
              "No se pudo confirmar la subida. Revisa la lista antes de repetirla."
          });
        }
      } finally {
        if (req.file) req.file.buffer = null;
        subidasActivas--;
      }
    });
  }
);

router.post(["/subir", "/subir-drive"], (req, res) => {
  res.status(409).json({
    success: false,
    mensaje: "Utiliza la nueva página subir_documento.html."
  });
});

module.exports = router;