"use strict";

const express = require("express");

const usuarioController =
  require("../controllers/usuarioController");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const {
  limiteLogin
} = require("../seguridad/limites");

const router = express.Router();

// =====================================
// LOGIN
// No requiere una sesión previa.
// Protegido contra intentos repetidos.
// =====================================

router.post(
  "/login",
  limiteLogin,
  usuarioController.login
);

// =====================================
// CERRAR SESIÓN
// =====================================

router.post(
  "/logout",
  (req, res) => {

    if (!req.session) {

      res.clearCookie(
        "coemsa.sid",
        {
          path: "/"
        }
      );

      return res.json({
        success: true,
        mensaje: "Sesión cerrada."
      });
    }

    req.session.destroy(
      (error) => {

        if (error) {

          console.error(
            "No se pudo cerrar la sesión."
          );

          return res.status(500).json({
            success: false,
            mensaje:
              "No se pudo cerrar la sesión. Inténtalo nuevamente."
          });
        }

        res.clearCookie(
          "coemsa.sid",
          {
            path: "/"
          }
        );

        return res.json({
          success: true,
          mensaje: "Sesión cerrada."
        });
      }
    );
  }
);

// =====================================
// CONSULTAR EL USUARIO AUTENTICADO
// =====================================

router.get(
  "/sesion",
  verificarSesion,
  (req, res) => {

    return res.json({
      success: true,
      usuario: req.usuario
    });
  }
);

// =====================================
// DESDE AQUÍ: SOLO ADMINISTRADORES
// =====================================

router.use(
  verificarSesion,
  permitirRoles(
    "Administrador"
  )
);

// =====================================
// LISTAR USUARIOS
// =====================================

router.get(
  "/",
  usuarioController.listarUsuarios
);

// =====================================
// CREAR USUARIO
// =====================================

router.post(
  "/",
  usuarioController.crearUsuario
);

// =====================================
// EDITAR USUARIO
// =====================================

router.put(
  "/editar/:id",
  usuarioController.editarUsuario
);

// =====================================
// ACTIVAR / DESACTIVAR USUARIO
// =====================================

router.put(
  "/estado/:id",
  usuarioController.cambiarEstado
);

// =====================================
// PRUEBA DE RUTA PROTEGIDA
// =====================================

router.get(
  "/test",
  (req, res) => {

    return res.json({
      success: true,
      mensaje:
        "Rutas de usuarios protegidas."
    });
  }
);

module.exports = router;