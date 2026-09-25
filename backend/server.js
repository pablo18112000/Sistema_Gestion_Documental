// =====================================
// SERVIDOR SISTEMA GESTIÓN DOCUMENTAL
// =====================================


require("dotenv").config();


const express = require("express");
const cors = require("cors");
const path = require("path");


// Importar conexión MySQL
require("./config/db");



const app = express();



// =====================================
// CONFIGURACIONES GENERALES
// =====================================


app.use(cors());


app.use(express.json());


app.use(express.urlencoded({
    extended:true
}));




// =====================================
// ARCHIVOS SUBIDOS
// PDF - WORD - EXCEL - IMÁGENES
// =====================================


app.use(
    "/uploads",
    express.static(
        path.join(__dirname,"uploads")
    )
);




// =====================================
// SERVIR FRONTEND
// =====================================


app.use(
    express.static(
        path.join(__dirname,"../frontend")
    )
);





// =====================================
// RUTAS DEL SISTEMA
// =====================================


// USUARIOS

app.use(
    "/usuarios",
    require("./routes/usuarios")
);




// DOCUMENTOS

app.use(
    "/documentos",
    require("./routes/documentos")
);




// APROBACIONES

app.use(
    "/aprobaciones",
    require("./routes/aprobaciones")
);






// =====================================
// RUTA PRINCIPAL
// =====================================


app.get("/",(req,res)=>{


    res.sendFile(

        path.join(
            __dirname,
            "../frontend/login.html"
        )

    );


});






// =====================================
// PANEL SUPERVISOR
// =====================================


app.get("/supervisor.html",(req,res)=>{


    res.sendFile(

        path.join(
            __dirname,
            "../frontend/supervisor.html"
        )

    );


});






// =====================================
// HISTORIAL SUPERVISOR
// =====================================


app.get("/historial.html",(req,res)=>{


    res.sendFile(

        path.join(
            __dirname,
            "../frontend/historial.html"
        )

    );


});







// =====================================
// CONTROL DE RUTAS NO EXISTENTES
// =====================================


app.use((req,res)=>{


    res.status(404).json({

        success:false,

        mensaje:"Ruta no encontrada"

    });


});






// =====================================
// PUERTO PARA LOCAL Y RAILWAY
// =====================================


const PORT = process.env.PORT || 3000;



app.listen(PORT,()=>{


    console.log(
        `Servidor Gestión Documental iniciado en puerto ${PORT}`
    );


});