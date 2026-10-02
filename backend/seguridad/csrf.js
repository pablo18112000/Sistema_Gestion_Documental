"use strict";

const crypto = require("crypto");

const METODOS_SEGUROS =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS"
  ]);

const RUTAS_EXENTAS =
  new Set([
    "/usuarios/login"
  ]);


/*
 * Genera un token criptográficamente aleatorio.
 *
 * Se guarda únicamente dentro de la sesión
 * del usuario.
 */
function generarTokenCSRF() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}


/*
 * Obtiene el token CSRF de la sesión.
 *
 * Si todavía no existe, crea uno nuevo.
 */
function obtenerTokenCSRF(req) {

  if (!req.session) {
    return null;
  }


  const actual =
    req.session.csrfToken;


  if (
    typeof actual === "string" &&
    /^[a-f0-9]{64}$/i.test(actual)
  ) {

    return actual;
  }


  const nuevo =
    generarTokenCSRF();


  req.session.csrfToken =
    nuevo;


  return nuevo;
}


/*
 * Comparación resistente a diferencias
 * de tiempo.
 */
function tokensIguales(
  esperado,
  recibido
) {

  if (
    typeof esperado !== "string" ||
    typeof recibido !== "string"
  ) {

    return false;
  }


  const bufferEsperado =
    Buffer.from(
      esperado,
      "utf8"
    );

  const bufferRecibido =
    Buffer.from(
      recibido,
      "utf8"
    );


  if (
    bufferEsperado.length !==
    bufferRecibido.length
  ) {

    return false;
  }


  return crypto.timingSafeEqual(
    bufferEsperado,
    bufferRecibido
  );
}


/*
 * Middleware de protección CSRF.
 *
 * GET, HEAD y OPTIONS no modifican datos
 * y por eso no necesitan token.
 *
 * El login queda excluido porque todavía
 * no existe una sesión autenticada desde
 * la cual obtener el token.
 */
function protegerCSRF(
  req,
  res,
  next
) {

  if (
    METODOS_SEGUROS.has(
      req.method
    )
  ) {

    return next();
  }


  if (
    RUTAS_EXENTAS.has(
      req.path
    )
  ) {

    return next();
  }


  if (
    !req.session ||
    !req.session.id_usuario
  ) {

    return res.status(401).json({
      success: false,
      mensaje:
        "Tu sesión no está activa. Inicia sesión nuevamente."
    });
  }


  const esperado =
    req.session.csrfToken;


  const recibido =
    req.get(
      "X-CSRF-Token"
    );


  if (
    !tokensIguales(
      esperado,
      recibido
    )
  ) {

    res.set(
      "Cache-Control",
      "no-store"
    );


    return res.status(403).json({
      success: false,
      mensaje:
        "La solicitud de seguridad no es válida. Actualiza la página e inténtalo nuevamente."
    });
  }


  return next();
}


module.exports = {
  obtenerTokenCSRF,
  protegerCSRF
};