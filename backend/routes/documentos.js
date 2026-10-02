"use strict";

const express =
  require("express");

const multer =
  require("multer");

const controlador =
  require(
    "../controllers/driveController"
  );

const organizacion =
  require(
    "../controllers/organizacionController"
  );

const {
  verificarSesion,
  permitirRoles
} = require(
  "../middlewares/auth"
);

const {
  TAMANO_MAXIMO,
  filtrarPDF,
  validarContenidoPDF
} = require(
  "../seguridad/seguridadPDF"
);

const router =
  express.Router();

// =====================================
// NO GUARDAR RESPUESTAS PRIVADAS
// =====================================

router.use(
  (req, res, next) => {

    res.set(
      "Cache-Control",
      "no-store"
    );

    next();
  }
);

// =====================================
// PROTEGER TODAS LAS RUTAS
// =====================================

router.use(
  verificarSesion,
  permitirRoles(
    "Administrador",
    "Supervisor",
    "Usuario"
  )
);

// =====================================
// CONFIGURACIÓN SEGURA DE MULTER
// =====================================

const recibirPDF =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        TAMANO_MAXIMO,

      files:
        1,

      fields:
        1,

      parts:
        2,

      fieldSize:
        12000
    },

    fileFilter:
      filtrarPDF

  }).single(
    "archivo"
  );

// =====================================
// CONTROL DE SUBIDAS SIMULTÁNEAS
// =====================================

let subidasActivas =
  0;

const MAX_SUBIDAS_SIMULTANEAS =
  3;

// =====================================
// RESPONDER ERRORES DE CARGA
// =====================================

function responderErrorCarga(
  res,
  error
) {

  if (
    error?.code ===
    "LIMIT_FILE_SIZE"
  ) {

    return res
      .status(413)
      .json({
        success: false,
        mensaje:
          "El PDF supera el límite de 10 MB."
      });
  }

  if (
    error?.status === 415
  ) {

    return res
      .status(415)
      .json({
        success: false,
        mensaje:
          error.message ||
          "El archivo enviado no es un PDF válido."
      });
  }

  if (
    error?.status === 413
  ) {

    return res
      .status(413)
      .json({
        success: false,
        mensaje:
          error.message ||
          "El archivo supera el tamaño permitido."
      });
  }

  if (
    error instanceof
    multer.MulterError
  ) {

    return res
      .status(400)
      .json({
        success: false,
        mensaje:
          "Envía un solo PDF y una descripción de hasta 2000 caracteres."
      });
  }

  return res
    .status(400)
    .json({
      success: false,
      mensaje:
        error?.message ||
        "No se pudo procesar el archivo enviado."
    });
}

// =====================================
// ORGANIZACIÓN DOCUMENTAL
// =====================================

router.get(
  "/organizacion",
  organizacion.consultar
);

router.get(
  "/buscar",
  organizacion.buscarGeneral
);

// =====================================
// CREAR EXPEDIENTE DE TRABAJADOR
// RECURSOS HUMANOS
// =====================================

router.post(
  "/personal/trabajadores",
  organizacion.crearTrabajador
);

// =====================================
// CREAR CARPETA DIRECTA
// ADMINISTRACIÓN / RRHH
// =====================================

router.post(
  "/administracion-rrhh/:idPadre/carpetas",
  organizacion
    .crearCarpetaAdministracionRRHH
);

// =====================================
// CREAR CARPETA DENTRO DE TRABAJADOR
// =====================================

router.post(
  "/personal/trabajadores/:idTrabajador/carpetas",
  organizacion
    .crearCarpetaTrabajador
);

// =====================================
// DOCUMENTOS
// =====================================

router.get(
  "/",
  controlador.listarDocumentos
);

router.get(
  "/destinos",
  controlador.destinos
);

router.get(
  "/:id/ver",
  controlador.verDocumento
);

// =====================================
// SUBIR PDF
// =====================================

router.post(
  "/subir/:idCarpeta",

  /*
   * Primero se comprueba que el usuario
   * tenga permiso sobre la carpeta.
   */
  controlador.validarDestino,

  (req, res) => {

    // =================================
    // EVITAR DEMASIADAS SUBIDAS
    // =================================

    if (
      subidasActivas >=
      MAX_SUBIDAS_SIMULTANEAS
    ) {

      return res
        .status(503)
        .json({
          success: false,
          mensaje:
            "Hay varias subidas en curso. Intenta en unos momentos."
        });
    }

    subidasActivas++;

    // =================================
    // RECIBIR PDF EN MEMORIA
    // =================================

    recibirPDF(
      req,
      res,
      async (error) => {

        try {

          // =============================
          // ERROR DE MULTER / FILTRO
          // =============================

          if (error) {

            return responderErrorCarga(
              res,
              error
            );
          }

          // =============================
          // VALIDAR CONTENIDO REAL
          // =============================

          let contenidoValido =
            false;

          validarContenidoPDF(
            req,
            res,
            () => {

              contenidoValido =
                true;
            }
          );

          /*
           * Si seguridadPDF respondió con
           * 400, 413 o 415, no se continúa
           * hacia Google Drive.
           */
          if (
            !contenidoValido
          ) {

            return;
          }

          // =============================
          // SUBIR A DRIVE Y REGISTRAR
          // =============================

          await controlador
            .subirArchivo(
              req,
              res
            );

        } catch (errorInterno) {

          console.error(
            "Error durante subida segura:",
            errorInterno?.code ||
            errorInterno?.status ||
            "ERROR_INTERNO"
          );

          if (
            !res.headersSent &&
            !res.destroyed
          ) {

            return res
              .status(500)
              .json({
                success: false,
                mensaje:
                  "No se pudo confirmar la subida. " +
                  "Revisa la lista antes de repetirla."
              });
          }

        } finally {

          // =============================
          // LIMPIAR BUFFER DE MEMORIA
          // =============================

          if (
            req.file
          ) {

            req.file.buffer =
              null;
          }

          subidasActivas =
            Math.max(
              0,
              subidasActivas - 1
            );
        }
      }
    );
  }
);

// =====================================
// RUTAS ANTIGUAS DESHABILITADAS
// =====================================

router.post(
  [
    "/subir",
    "/subir-drive"
  ],
  (req, res) => {

    return res
      .status(409)
      .json({
        success: false,
        mensaje:
          "Utiliza la nueva página subir_documento.html."
      });
  }
);

module.exports =
  router;