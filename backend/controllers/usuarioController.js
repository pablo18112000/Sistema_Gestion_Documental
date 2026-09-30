const connection = require("../config/db");

// =====================================
// FUNCIONES AUXILIARES
// =====================================

const consultaUsuarios = `
  SELECT
    usuarios.id_usuario,
    usuarios.nombre,
    usuarios.apellido,
    usuarios.correo,
    usuarios.estado,
    usuarios.id_rol,
    usuarios.id_area,
    roles.nombre_rol,
    areas.nombre_area
  FROM usuarios
  INNER JOIN roles
    ON usuarios.id_rol = roles.id_rol
  INNER JOIN areas
    ON usuarios.id_area = areas.id_area
`;

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function idValido(valor) {
  return (
    (typeof valor === "string" || typeof valor === "number") &&
    Number.isSafeInteger(Number(valor)) &&
    Number(valor) > 0
  );
}

function responderError(res, error, mensaje) {
  // No imprimir consultas, contraseñas ni datos personales.
  console.error("Error de usuarios:", error.code || "ERROR_INTERNO");

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      mensaje: "Ya existe un registro con esos datos."
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      mensaje: "El rol o el área seleccionados no existen."
    });
  }

  return res.status(500).json({
    success: false,
    mensaje
  });
}

// =====================================
// INICIAR SESIÓN
// =====================================

exports.login = (req, res) => {
  const correo = texto(req.body?.usuario);
  const password = req.body?.password;

  if (
    !correo ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "Ingresa tu correo y contraseña."
    });
  }

  if (!req.session) {
    return res.status(500).json({
      success: false,
      mensaje: "La configuración de sesiones no está disponible."
    });
  }

  // Compatibilidad temporal con las contraseñas actuales.
  // Se sustituirá por bcrypt durante la migración.
  const sql = `
    ${consultaUsuarios}
    WHERE usuarios.correo = ?
      AND usuarios.password = ?
      AND usuarios.estado = 1
    LIMIT 1
  `;

  connection.query(sql, [correo, password], (error, resultado) => {
    if (error) {
      return responderError(
        res,
        error,
        "No se pudo comprobar el usuario."
      );
    }

    if (resultado.length === 0) {
      return res.status(401).json({
        success: false,
        mensaje: "Usuario o contraseña incorrectos."
      });
    }

    const usuario = resultado[0];

    // Generar un nuevo identificador al iniciar sesión.
    req.session.regenerate((errorSesion) => {
      if (errorSesion) {
        return responderError(
          res,
          errorSesion,
          "No se pudo iniciar la sesión."
        );
      }

      // La sesión guarda el identificador del usuario.
      req.session.id_usuario = usuario.id_usuario;

      // Esperar a que MySQL guarde la sesión.
      req.session.save((errorGuardado) => {
        if (errorGuardado) {
          return responderError(
            res,
            errorGuardado,
            "No se pudo guardar la sesión."
          );
        }

        return res.json({
          success: true,
          usuario
        });
      });
    });
  });
};

// =====================================
// LISTAR USUARIOS
// =====================================

exports.listarUsuarios = (req, res) => {
  const sql = `
    ${consultaUsuarios}
    ORDER BY usuarios.nombre, usuarios.apellido
  `;

  connection.query(sql, (error, resultado) => {
    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron cargar los usuarios."
      );
    }

    return res.json({
      success: true,
      usuarios: resultado
    });
  });
};

// =====================================
// CREAR USUARIO
// =====================================

exports.crearUsuario = (req, res) => {
  const datos = req.body || {};

  const nombre = texto(datos.nombre);
  const apellido = texto(datos.apellido);
  const correo = texto(datos.correo);
  const password = datos.password;

  if (
    !nombre ||
    !apellido ||
    !correo ||
    typeof password !== "string" ||
    password.length === 0 ||
    !idValido(datos.id_rol) ||
    !idValido(datos.id_area)
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "Completa los datos del usuario, rol y área."
    });
  }

  // Conserva temporalmente el formato actual de contraseñas.
  // Pendiente: migrar la columna y utilizar bcrypt.
  const sql = `
    INSERT INTO usuarios (
      nombre,
      apellido,
      correo,
      password,
      estado,
      id_rol,
      id_area
    )
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `;

  const valores = [
    nombre,
    apellido,
    correo,
    password,
    Number(datos.id_rol),
    Number(datos.id_area)
  ];

  connection.query(sql, valores, (error, resultado) => {
    if (error) {
      return responderError(
        res,
        error,
        "No se pudo crear el usuario."
      );
    }

    return res.status(201).json({
      success: true,
      mensaje: "Usuario creado correctamente.",
      id_usuario: resultado.insertId
    });
  });
};

// =====================================
// EDITAR USUARIO
// =====================================

exports.editarUsuario = (req, res) => {
  const datos = req.body || {};

  const nombre = texto(datos.nombre);
  const apellido = texto(datos.apellido);
  const correo = texto(datos.correo);

  if (
    !idValido(req.params.id) ||
    !nombre ||
    !apellido ||
    !correo ||
    !idValido(datos.id_rol) ||
    !idValido(datos.id_area)
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "Verifica los datos del usuario, rol y área."
    });
  }

  const sql = `
    UPDATE usuarios
    SET
      nombre = ?,
      apellido = ?,
      correo = ?,
      id_rol = ?,
      id_area = ?
    WHERE id_usuario = ?
  `;

  const valores = [
    nombre,
    apellido,
    correo,
    Number(datos.id_rol),
    Number(datos.id_area),
    Number(req.params.id)
  ];

  connection.query(sql, valores, (error, resultado) => {
    if (error) {
      return responderError(
        res,
        error,
        "No se pudo actualizar el usuario."
      );
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        mensaje: "Usuario no encontrado."
      });
    }

    return res.json({
      success: true,
      mensaje: "Usuario actualizado correctamente."
    });
  });
};

// =====================================
// ACTIVAR O DESACTIVAR USUARIO
// =====================================

exports.cambiarEstado = (req, res) => {
  const estadoRecibido = req.body?.estado;

  if (
    !idValido(req.params.id) ||
    ![0, 1, "0", "1"].includes(estadoRecibido)
  ) {
    return res.status(400).json({
      success: false,
      mensaje: "Indica un usuario válido y un estado 0 o 1."
    });
  }

  const sql = `
    UPDATE usuarios
    SET estado = ?
    WHERE id_usuario = ?
  `;

  const valores = [
    Number(estadoRecibido),
    Number(req.params.id)
  ];

  connection.query(sql, valores, (error, resultado) => {
    if (error) {
      return responderError(
        res,
        error,
        "No se pudo cambiar el estado."
      );
    }

    if (resultado.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        mensaje: "Usuario no encontrado."
      });
    }

    return res.json({
      success: true,
      mensaje: "Estado actualizado correctamente."
    });
  });
};