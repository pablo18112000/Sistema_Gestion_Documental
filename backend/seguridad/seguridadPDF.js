"use strict";

const path =
  require("path");

const TAMANO_MAXIMO =
  10 * 1024 * 1024;

/*
 * =====================================
 * CREAR ERROR CONTROLADO
 * =====================================
 */

function fallo(
  status,
  mensaje
) {

  const error =
    new Error(
      mensaje
    );

  error.status =
    status;

  return error;
}

/*
 * =====================================
 * VALIDAR NOMBRE DEL ARCHIVO
 * =====================================
 */

function validarNombre(
  nombreOriginal
) {

  if (
    typeof nombreOriginal !==
      "string" ||
    !nombreOriginal.trim()
  ) {

    throw fallo(
      415,
      "El archivo no tiene un nombre válido."
    );
  }

  const nombre =
    path.basename(
      nombreOriginal.trim()
    );

  if (
    nombre !==
    nombreOriginal.trim()
  ) {

    throw fallo(
      415,
      "El nombre del archivo no es válido."
    );
  }

  if (
    /[\u0000-\u001f\u007f]/.test(
      nombre
    )
  ) {

    throw fallo(
      415,
      "El nombre del archivo contiene caracteres no permitidos."
    );
  }

  if (
    [...nombre].length >
    200
  ) {

    throw fallo(
      415,
      "El nombre del archivo es demasiado largo."
    );
  }

  if (
    path.extname(
      nombre
    ).toLowerCase() !==
    ".pdf"
  ) {

    throw fallo(
      415,
      "Solo se permiten archivos con extensión PDF."
    );
  }

  return nombre;
}

/*
 * =====================================
 * FILTRO PREVIO PARA MULTER
 * =====================================
 *
 * MIME no demuestra que el archivo sea
 * realmente PDF, pero permite rechazar
 * entradas claramente incorrectas antes
 * de procesarlas.
 */

function filtrarPDF(
  req,
  file,
  callback
) {

  try {

    validarNombre(
      file.originalname
    );

    if (
      file.mimetype !==
      "application/pdf"
    ) {

      return callback(
        fallo(
          415,
          "El tipo de archivo enviado no corresponde a un PDF."
        )
      );
    }

    return callback(
      null,
      true
    );

  } catch (error) {

    return callback(
      error
    );
  }
}

/*
 * =====================================
 * VALIDAR CONTENIDO REAL
 * =====================================
 */

function validarContenidoPDF(
  req,
  res,
  next
) {

  try {

    if (
      !req.file
    ) {

      throw fallo(
        400,
        "Selecciona un archivo PDF."
      );
    }

    const {
      buffer,
      size,
      originalname,
      mimetype
    } =
      req.file;

    validarNombre(
      originalname
    );

    if (
      mimetype !==
      "application/pdf"
    ) {

      throw fallo(
        415,
        "El tipo de archivo enviado no corresponde a un PDF."
      );
    }

    if (
      !Buffer.isBuffer(
        buffer
      ) ||
      buffer.length === 0
    ) {

      throw fallo(
        415,
        "El archivo PDF está vacío o no pudo ser leído."
      );
    }

    if (
      buffer.length >
        TAMANO_MAXIMO ||
      Number(size) >
        TAMANO_MAXIMO
    ) {

      throw fallo(
        413,
        "El PDF supera el límite de 10 MB."
      );
    }

    /*
     * Un PDF válido debe comenzar con
     * la firma:
     *
     * %PDF-
     */

    const firma =
      buffer
        .subarray(
          0,
          5
        )
        .toString(
          "ascii"
        );

    if (
      firma !==
      "%PDF-"
    ) {

      throw fallo(
        415,
        "El contenido del archivo no corresponde a un PDF válido."
      );
    }

    /*
     * Comprobación adicional del final.
     *
     * %%EOF debe aparecer cerca del final
     * de un PDF completo.
     *
     * Se revisan los últimos 2048 bytes
     * para permitir espacios o saltos de
     * línea posteriores.
     */

    const inicioFinal =
      Math.max(
        0,
        buffer.length -
          2048
      );

    const final =
      buffer
        .subarray(
          inicioFinal
        )
        .toString(
          "latin1"
        );

    if (
      !final.includes(
        "%%EOF"
      )
    ) {

      throw fallo(
        415,
        "El PDF parece estar incompleto o dañado."
      );
    }

    next();

  } catch (error) {

    if (
      req.file &&
      Buffer.isBuffer(
        req.file.buffer
      )
    ) {

      req.file.buffer =
        null;
    }

    return res
      .status(
        Number(
          error.status
        ) || 400
      )
      .json({
        success: false,
        mensaje:
          error.message ||
          "No se pudo validar el PDF."
      });
  }
}

module.exports = {
  TAMANO_MAXIMO,
  filtrarPDF,
  validarContenidoPDF
};