// =====================================
// SERVIDOR SISTEMA GESTIÓN DOCUMENTAL
// =====================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// Conexión MySQL
require("./config/db");


const app = express();


// =====================================
// CONFIGURACIONES
// =====================================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended:true
}));



// =====================================
// ARCHIVOS SUBIDOS
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
// RUTAS API
// =====================================


// Usuarios

app.use(
    "/usuarios",
    require("./routes/usuarios")
);


// Documentos

app.use(
    "/documentos",
    require("./routes/documentos")
);


// Aprobaciones

app.use(
    "/aprobaciones",
    require("./routes/aprobaciones")
);




// =====================================
// PAGINA PRINCIPAL
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
// PANELES
// =====================================


app.get("/supervisor.html",(req,res)=>{

    res.sendFile(
        path.join(
            __dirname,
            "../frontend/supervisor.html"
        )
    );

});



app.get("/historial.html",(req,res)=>{

    res.sendFile(
        path.join(
            __dirname,
            "../frontend/historial.html"
        )
    );

});




// =====================================
// ERROR 404
// =====================================

app.use((req,res)=>{

    res.status(404).json({

        success:false,

        mensaje:"Ruta no encontrada"

    });

});




// =====================================
// PUERTO LOCAL + RAILWAY
// =====================================


const PORT = process.env.PORT || 3000;


app.listen(PORT,()=>{

    console.log(
        `Servidor Gestión Documental iniciado en puerto ${PORT}`
    );

});