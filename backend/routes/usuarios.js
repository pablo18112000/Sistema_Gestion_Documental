const express = require("express");

const usuarioController = require("../controllers/usuarioController");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();

// =====================================
// LOGIN
// No requiere una sesión previa.
// =====================================

router.post("/login", usuarioController.login);

// =====================================
// CERRAR SESIÓN
// =====================================

router.post("/logout", (req, res) => {
  if (!req.session) {
    res.clearCookie("coemsa.sid", { path: "/" });

    return res.json({
      success: true,
      mensaje: "Sesión cerrada."
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("No se pudo cerrar la sesión.");

      return res.status(500).json({
        success: false,
        mensaje: "No se pudo cerrar la sesión. Inténtalo nuevamente."
      });
    }

    res.clearCookie("coemsa.sid", { path: "/" });

    return res.json({
      success: true,
      mensaje: "Sesión cerrada."
    });
  });
});

// =====================================
// CONSULTAR EL USUARIO AUTENTICADO
// =====================================

router.get("/sesion", verificarSesion, (req, res) => {
  res.json({
    success: true,
    usuario: req.usuario
  });
});

// =====================================
// DESDE AQUÍ: SOLO ADMINISTRADORES
// =====================================

router.use(
  verificarSesion,
  permitirRoles("Administrador")
);

router.get("/", usuarioController.listarUsuarios);

router.post("/", usuarioController.crearUsuario);

router.put("/editar/:id", usuarioController.editarUsuario);

router.put("/estado/:id", usuarioController.cambiarEstado);

router.get("/test", (req, res) => {
  res.json({
    success: true,
    mensaje: "Rutas de usuarios protegidas."
  });
});

module.exports = router;