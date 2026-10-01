"use strict";

const express = require("express");

const controlador =
  require(
    "../controllers/carpetasAdministracionRRHHController"
  );

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

/*
 * Todas estas operaciones requieren
 * una sesión válida.
 */
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

/*
 * Crear una subcarpeta dentro de
 * Administración o Recursos Humanos.
 *
 * El controlador se encarga de comprobar:
 * - que NO sea un proyecto;
 * - que pertenezca al área 1 o 3;
 * - que realmente descienda de
 *   Recursos Humanos o Administración;
 * - permisos del usuario;
 * - nombres duplicados.
 */
router.post(
  "/:idPadre",
  controlador.crear
);

module.exports = router;