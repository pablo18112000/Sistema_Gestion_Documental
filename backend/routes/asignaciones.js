const express = require("express");
const connection = require("../config/db");

const {
  verificarSesion,
  permitirRoles
} = require("../middlewares/auth");

const router = express.Router();
const db = connection.promise();

// Todo este módulo es exclusivo del administrador.
router.use(
  verificarSesion,
  permitirRoles("Administrador")
);

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function idValido(valor) {
  return (
    (typeof valor === "string" || typeof valor === "number") &&
    Number.isInteger(Number(valor)) &&
    Number(valor) > 0 &&
    Number(valor) <= 2147483647
  );
}

function responderError(res, error) {
  console.error(
    "Error en asignaciones:",
    error.code || "ERROR_INTERNO"
  );

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      mensaje: "El usuario o el proyecto no existen."
    });
  }

  return res.status(500).json({
    success: false,
    mensaje: "No se pudo completar la operación."
  });
}

// =====================================
// LISTAR TODOS LOS PROYECTOS
// =====================================

router.get("/proyectos", async (req, res) => {
  try {
    const [proyectos] = await db.query(`
      SELECT id_proyecto, nombre_proyecto, descripcion
      FROM proyectos
      ORDER BY nombre_proyecto
    `);

    return res.json({
      success: true,
      proyectos
    });
  } catch (error) {
    return responderError(res, error);
  }
});

// =====================================
// PROYECTOS ASIGNADOS A UN USUARIO
// =====================================

router.get("/usuarios/:id", async (req, res) => {
  if (!idValido(req.params.id)) {
    return res.status(400).json({
      success: false,
      mensaje: "El identificador del usuario no es válido."
    });
  }

  try {
    const idUsuario = Number(req.params.id);

    const [usuarios] = await db.query(
      "SELECT id_usuario FROM usuarios WHERE id_usuario = ?",
      [idUsuario]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        success: false,
        mensaje: "Usuario no encontrado."
      });
    }

    const [proyectos] = await db.query(`
      SELECT
        p.id_proyecto,
        p.nombre_proyecto,
        up.fecha_asignacion
      FROM usuario_proyectos up
      INNER JOIN proyectos p
        ON p.id_proyecto = up.id_proyecto
      WHERE up.id_usuario = ?
      ORDER BY p.nombre_proyecto
    `, [idUsuario]);

    return res.json({
      success: true,
      proyectos
    });
  } catch (error) {
    return responderError(res, error);
  }
});

// =====================================
// ASIGNAR UN PROYECTO
// =====================================

router.post("/", async (req, res) => {
  const { id_usuario, id_proyecto } = req.body || {};

  if (!idValido(id_usuario) || !idValido(id_proyecto)) {
    return res.status(400).json({
      success: false,
      mensaje: "Selecciona un usuario y un proyecto válidos."
    });
  }

  try {
    await db.query(`
      INSERT INTO usuario_proyectos (id_usuario, id_proyecto)
      VALUES (?, ?)
    `, [Number(id_usuario), Number(id_proyecto)]);

    return res.status(201).json({
      success: true,
      mensaje: "Proyecto asignado correctamente."
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.json({
        success: true,
        mensaje: "El usuario ya estaba asignado a ese proyecto."
      });
    }

    return responderError(res, error);
  }
});

// =====================================
// RETIRAR UNA ASIGNACIÓN
// No elimina el usuario, proyecto ni documentos.
// =====================================

router.delete("/:idUsuario/:idProyecto", async (req, res) => {
  const { idUsuario, idProyecto } = req.params;

  if (!idValido(idUsuario) || !idValido(idProyecto)) {
    return res.status(400).json({
      success: false,
      mensaje: "Los identificadores no son válidos."
    });
  }

  try {
    const [resultado] = await db.query(`
      DELETE FROM usuario_proyectos
      WHERE id_usuario = ?
        AND id_proyecto = ?
    `, [Number(idUsuario), Number(idProyecto)]);

    return res.json({
      success: true,
      mensaje: resultado.affectedRows > 0
        ? "Asignación retirada correctamente."
        : "El usuario no tenía esa asignación."
    });
  } catch (error) {
    return responderError(res, error);
  }
});

module.exports = router;