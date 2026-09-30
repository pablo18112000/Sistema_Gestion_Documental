const express = require("express");

const router = express.Router();

const controlador = require("../controllers/aprobacionController");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

// Todas las consultas y revisiones requieren sesión
// de Administrador o Supervisor.
router.use(
  verificarSesion,
  permitirRoles("Administrador", "Supervisor")
);

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/pendientes", controlador.pendientes);

router.get("/historial", controlador.historial);

// Estas rutas reciben el ID DEL DOCUMENTO.
router.put(
  "/documentos/:idDocumento/aprobar",
  controlador.aprobarDocumento
);

router.put(
  "/documentos/:idDocumento/rechazar",
  controlador.rechazarDocumento
);

// El panel anterior enviaba el ID DE APROBACIÓN.
// No lo interpretamos como un ID de documento.
router.put(
  ["/aprobar/:id", "/rechazar/:id"],
  (req, res) => {
    res.status(409).json({
      success: false,
      mensaje:
        "Este panel necesita actualizarse. Utiliza la nueva pantalla de revisión."
    });
  }
);

module.exports = router;