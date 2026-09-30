const db=require("../config/db");


const {

subirArchivo,

listarArchivos

}

=require("../config/googleDrive");





exports.subirDocumento=async(req,res)=>{


try{


if(!req.file){

return res.json({

success:false,

mensaje:"Seleccione archivo"

});

}



const archivo =
await subirArchivo(

req.file.originalname,

req.file.buffer,

req.file.mimetype

);




let datos={


nombre:req.file.originalname,


tipo:req.file.mimetype,


ruta:archivo.webViewLink


};




db.query(

`

INSERT INTO documentos

(nombre_archivo,tipo_archivo,ruta_nube)

VALUES (?,?,?)

`

,

[

datos.nombre,

datos.tipo,

datos.ruta

]


);





res.json({

success:true,

mensaje:"Documento guardado correctamente",

archivo

});



}

catch(error){


console.log(error);


res.status(500).json({

success:false,

mensaje:"Error subiendo documento"

});


}



};







exports.listarDocumentos=async(req,res)=>{


try{


const archivos =
await listarArchivos();


res.json({

success:true,

documentos:archivos

});


}

catch(error){


console.log(error);


res.status(500).json({

success:false

});


}



};