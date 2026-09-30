const connection = require("../config/db");

// Comprobar la sesión y consultar los permisos actuales en MySQL.
function verificarSesion(req, res, next) {
  const idUsuario = req.session?.id_usuario;

  if (!idUsuario) {
    return res.status(401).json({
      success: false,
      mensaje: "Debes iniciar sesión."
    });
  }

  const sql = `
    SELECT
      u.id_usuario,
      u.nombre,
      u.apellido,
      u.correo,
      u.estado,
      u.id_rol,
      u.id_area,
      r.nombre_rol,
      a.nombre_area
    FROM usuarios u
    INNER JOIN roles r ON u.id_rol = r.id_rol
    LEFT JOIN areas a ON u.id_area = a.id_area
    WHERE u.id_usuario = ?
      AND u.estado = 1
    LIMIT 1
  `;

  connection.query(sql, [idUsuario], (error, filas) => {
    if (error) {
      console.error(
        "Error verificando sesión:",
        error.code || "ERROR_MYSQL"
      );

      return res.status(503).json({
        success: false,
        mensaje: "No se pudo verificar tu sesión. Inténtalo nuevamente."
      });
    }

    if (filas.length === 0) {
      return req.session.destroy((errorSesion) => {
        if (errorSesion) {
          console.error("No se pudo eliminar una sesión inválida.");
        }

        res.clearCookie("coemsa.sid", { path: "/" });

        return res.status(401).json({
          success: false,
          mensaje: "Tu cuenta no está disponible. Inicia sesión nuevamente."
        });
      });
    }

    // Estos datos provienen de MySQL, no del navegador.
    req.usuario = filas[0];
    next();
  });
}

function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        mensaje: "Debes iniciar sesión."
      });
    }

    if (!rolesPermitidos.includes(req.usuario.nombre_rol)) {
      return res.status(403).json({
        success: false,
        mensaje: "No tienes permiso para realizar esta operación."
      });
    }

    next();
  };
}

module.exports = {
  verificarSesion,
  permitirRoles
};