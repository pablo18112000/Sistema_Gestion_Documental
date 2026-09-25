const express = require("express");

const router = express.Router();


const controller = require("../controllers/aprobacionController");



console.log("RUTAS APROBACIONES CARGADAS");


// =====================================
// LISTAR DOCUMENTOS PENDIENTES
// =====================================

router.get(
    "/pendientes",
    controller.pendientes
);



// =====================================
// HISTORIAL DE REVISIONES
// =====================================

router.get(
    "/historial",
    controller.historial
);



// =====================================
// APROBAR DOCUMENTO
// =====================================

router.put(
    "/aprobar/:id",
    controller.aprobar
);



// =====================================
// RECHAZAR DOCUMENTO
// =====================================

router.put(
    "/rechazar/:id",
    controller.rechazar
);



module.exports = router;