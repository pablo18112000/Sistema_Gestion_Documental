const connection = require("../config/db");



// =====================================
// LISTAR DOCUMENTOS PENDIENTES
// =====================================

exports.pendientes = (req,res)=>{


const sql = `

SELECT

aprobaciones_documentos.id_aprobacion,

documentos.id_documento,

documentos.nombre_archivo,

documentos.fecha_subida,

aprobaciones_documentos.estado,

aprobaciones_documentos.comentario,


usuarios.nombre,

usuarios.apellido,

usuarios.correo,


CONCAT(
'http://localhost:3000/uploads/',
documentos.nombre_archivo
) AS ruta_nube



FROM aprobaciones_documentos



INNER JOIN documentos

ON aprobaciones_documentos.id_documento =
documentos.id_documento



INNER JOIN usuarios

ON documentos.id_usuario =
usuarios.id_usuario



WHERE aprobaciones_documentos.estado='Pendiente'


ORDER BY aprobaciones_documentos.id_aprobacion DESC


`;



connection.query(sql,(error,resultado)=>{


if(error){

console.log(error);

return res.json({

success:false,

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
// APROBAR DOCUMENTO
// =====================================

exports.aprobar=(req,res)=>{


const id=req.params.id;



connection.query(

`

SELECT id_documento

FROM aprobaciones_documentos

WHERE id_aprobacion=?

`,

[id],


(error,resultado)=>{


if(error){

return res.json({

success:false,

error:error

});

}



if(resultado.length===0){

return res.json({

success:false,

mensaje:"No existe aprobación"

});

}



const id_documento=resultado[0].id_documento;




// actualizar aprobación


connection.query(

`

UPDATE aprobaciones_documentos

SET

estado='Aprobado',

fecha_revision=NOW(),

comentario='Documento aprobado correctamente'


WHERE id_aprobacion=?

`,

[id],


(error)=>{


if(error){

return res.json({

success:false,

error:error

});

}



// actualizar documento


connection.query(

`

UPDATE documentos

SET

estado_documento='Aprobado',

fecha_aprobacion=NOW()


WHERE id_documento=?

`,

[id_documento],


(error)=>{


if(error){

return res.json({

success:false,

error:error

});

}



res.json({

success:true,

mensaje:"Documento aprobado correctamente"

});


}


);



}


);



}


);



};







// =====================================
// RECHAZAR DOCUMENTO
// =====================================

exports.rechazar=(req,res)=>{


const id=req.params.id;


const comentario=req.body.comentario;



connection.query(

`

SELECT id_documento

FROM aprobaciones_documentos

WHERE id_aprobacion=?

`,

[id],


(error,resultado)=>{


if(error){

return res.json({

success:false,

error:error

});

}



if(resultado.length===0){

return res.json({

success:false,

mensaje:"No existe aprobación"

});

}



const id_documento=resultado[0].id_documento;



// actualizar aprobación


connection.query(

`

UPDATE aprobaciones_documentos

SET

estado='Rechazado',

comentario=?,

fecha_revision=NOW()


WHERE id_aprobacion=?

`,

[comentario,id],


(error)=>{


if(error){

return res.json({

success:false,

error:error

});

}




// actualizar documento


connection.query(

`

UPDATE documentos

SET

estado_documento='Rechazado'


WHERE id_documento=?

`,

[id_documento],


(error)=>{


if(error){

return res.json({

success:false,

error:error

});

}



res.json({

success:true,

mensaje:"Documento rechazado correctamente"

});


}


);



}


);



}


);



};








// =====================================
// HISTORIAL
// =====================================

exports.historial=(req,res)=>{


const sql=`

SELECT


aprobaciones_documentos.id_aprobacion,


documentos.nombre_archivo,


documentos.fecha_subida,


aprobaciones_documentos.estado,


aprobaciones_documentos.comentario,


aprobaciones_documentos.fecha_revision,


usuarios.nombre,


usuarios.apellido,


usuarios.correo



FROM aprobaciones_documentos



INNER JOIN documentos

ON aprobaciones_documentos.id_documento =
documentos.id_documento



INNER JOIN usuarios

ON documentos.id_usuario =
usuarios.id_usuario



WHERE aprobaciones_documentos.estado <> 'Pendiente'


ORDER BY aprobaciones_documentos.fecha_revision DESC


`;



connection.query(sql,(error,resultado)=>{


if(error){

return res.json({

success:false,

error:error

});

}



res.json({

success:true,

documentos:resultado

});


});


};