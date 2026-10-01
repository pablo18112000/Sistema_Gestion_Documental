"use strict";

const express = require("express");

const controlador =
  require(
    "../controllers/carpetasServiciosProyectosController"
  );

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

router.use(
  verificarSesion,
  permitirRoles(
    "Administrador",
    "Supervisor",
    "Usuario"
  )
);

router.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store"
  );

  next();
});

router.post(
  "/:idPadre",
  controlador.crear
);

module.exports = router;
