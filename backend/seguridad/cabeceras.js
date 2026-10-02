"use strict";

const helmet = require("helmet");

/*
 * Primera capa de cabeceras de seguridad.
 *
 * CSP queda temporalmente desactivada porque
 * el frontend actual todavía utiliza scripts
 * y estilos inline.
 *
 * Se habilitará en una fase posterior cuando
 * esos recursos estén preparados.
 */
const cabecerasSeguras = helmet({
  contentSecurityPolicy: false
});

module.exports = cabecerasSeguras;