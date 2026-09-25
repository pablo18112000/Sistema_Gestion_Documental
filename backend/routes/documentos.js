const express = require("express");

const router = express.Router();


const documentoController = require("../controllers/documentoController");



// ==============================
// LISTAR DOCUMENTOS
// ==============================

router.get(
"/",
documentoController.listarDocumentos
);



// ==============================
// LISTAR CARPETAS
// ==============================

router.get(
"/carpetas",
documentoController.listarCarpetas
);



// ==============================
// LISTAR TIPOS
// ==============================

router.get(
"/tipos",
documentoController.listarTipos
);



console.log("RUTAS DOCUMENTOS CARGADAS");


module.exports = router;