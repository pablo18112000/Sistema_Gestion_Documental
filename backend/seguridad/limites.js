"use strict";

const {
  rateLimit
} = require("express-rate-limit");

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,

  /*
   * Máximo 10 intentos fallidos por IP
   * durante una ventana de 15 minutos.
   *
   * Los accesos correctos no se conservan
   * dentro del contador.
   */
  limit: 10,

  skipSuccessfulRequests: true,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler(req, res) {
    res.set(
      "Cache-Control",
      "no-store"
    );

    return res.status(429).json({
      success: false,
      mensaje:
        "Demasiados intentos de inicio de sesión. " +
        "Espera unos minutos antes de intentarlo nuevamente."
    });
  }
});

module.exports = {
  limiteLogin
};