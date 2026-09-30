const express = require("express");

const controlador = require("../controllers/driveController");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.use(
  verificarSesion,
  permitirRoles("Administrador", "Supervisor", "Usuario")
);

// El controlador verifica los permisos del documento:
// Usuario: su área o proyectos asignados.
// Supervisor y Administrador: todos los documentos.
router.get("/:id/ver", controlador.verDocumento);

module.exports = router;