const connection = require("../config/db");


// =====================================
// LISTAR DOCUMENTOS
// =====================================

exports.listarDocumentos = (req, res) => {


const sql = `

SELECT

documentos.id_documento,
documentos.nombre_archivo,
documentos.ruta_nube,
documentos.tipo_archivo,
documentos.descripcion,
documentos.fecha_subida,
documentos.estado_documento,


usuarios.nombre,
usuarios.apellido,
usuarios.correo,


carpetas_documentos.nombre_carpeta


FROM documentos


LEFT JOIN usuarios

ON documentos.id_usuario = usuarios.id_usuario



LEFT JOIN carpetas_documentos

ON documentos.id_carpeta = carpetas_documentos.id_carpeta



ORDER BY documentos.id_documento DESC


`;



connection.query(sql,(error,resultado)=>{


if(error){

console.log(error);


return res.status(500).json({

success:false,

mensaje:"Error al listar documentos",

error:error

});

}



res.json({

success:true,

documentos:resultado

});


});


};





// =====================================
// LISTAR CARPETAS
// =====================================


exports.listarCarpetas = (req,res)=>{


const sql = `

SELECT

id_carpeta,

nombre_carpeta


FROM carpetas_documentos


ORDER BY id_carpeta ASC


`;



connection.query(sql,(error,resultado)=>{


if(error){

console.log(error);


return res.status(500).json({

success:false,

mensaje:"Error al listar carpetas",

error:error

});

}



res.json({

success:true,

carpetas:resultado

});


});


};






// =====================================
// LISTAR TIPOS DE ARCHIVO
// =====================================


exports.listarTipos = (req,res)=>{


const sql = `

SELECT

id_tipo,

extension,

descripcion


FROM tipos_archivo


ORDER BY id_tipo ASC


`;



connection.query(sql,(error,resultado)=>{


if(error){

console.log(error);


return res.status(500).json({

success:false,

mensaje:"Error al listar tipos",

error:error

});

}



res.json({

success:true,

tipos:resultado

});


});


};





// =====================================
// SUBIR DOCUMENTO
// =====================================


exports.subirDocumento = (req,res)=>{


const {

id_carpeta,

id_tipo,

descripcion,

id_usuario


}=req.body;



if(!req.file){

return res.json({

success:false,

mensaje:"Debe seleccionar un archivo"

});

}



const archivo = req.file;



const sql = `


INSERT INTO documentos

(

id_carpeta,

id_tipo,

id_usuario,

nombre_archivo,

tipo_archivo,

ruta_nube,

descripcion,

estado_documento

)


VALUES

(?,?,?,?,?,?,?,'Pendiente')


`;




connection.query(

sql,

[

id_carpeta,

id_tipo,

id_usuario,

archivo.originalname,

archivo.mimetype,

archivo.path,

descripcion


],


(error,resultado)=>{


if(error){

console.log(error);


return res.status(500).json({

success:false,

mensaje:"Error al subir documento",

error:error

});


}



res.json({

success:true,

mensaje:"Documento subido correctamente",

id_documento:resultado.insertId


});


}



);


};
