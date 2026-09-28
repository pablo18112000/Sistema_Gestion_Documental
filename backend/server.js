// =====================================
// SERVIDOR SISTEMA GESTIÓN DOCUMENTAL
// RAILWAY
// =====================================


require("dotenv").config();


const express = require("express");
const cors = require("cors");
const path = require("path");


// Conexión MySQL
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
// AHORA ESTA DENTRO DE BACKEND
// =====================================


app.use(
    express.static(
        path.join(__dirname,"frontend")
    )
);



// =====================================
// RUTAS API
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
// PÁGINA PRINCIPAL LOGIN
// =====================================


app.get("/",(req,res)=>{

    res.sendFile(

        path.join(
            __dirname,
            "frontend/login.html"
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
            "frontend/supervisor.html"
        )

    );

});




// =====================================
// HISTORIAL
// =====================================


app.get("/historial.html",(req,res)=>{

    res.sendFile(

        path.join(
            __dirname,
            "frontend/historial.html"
        )

    );

});




// =====================================
// RUTA DE PRUEBA DEL SERVIDOR
// =====================================


app.get("/api",(req,res)=>{

    res.json({

        sistema:"Gestión Documental",

        estado:"Servidor funcionando correctamente",

        fecha:new Date()

    });

});




// =====================================
// RUTAS NO EXISTENTES
// =====================================


app.use((req,res)=>{

    res.status(404).json({

        success:false,

        mensaje:"Ruta no encontrada"

    });

});




// =====================================
// PUERTO RAILWAY
// =====================================


const PORT = process.env.PORT || 3000;



app.listen(PORT,()=>{


    console.log(
        `Servidor Gestión Documental iniciado en puerto ${PORT}`
    );


});