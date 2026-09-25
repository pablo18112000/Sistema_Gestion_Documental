const connection = require("../config/db");



// =====================================
// LOGIN
// =====================================

exports.login=(req,res)=>{


const {usuario,password}=req.body;


const sql=`

SELECT

usuarios.id_usuario,
usuarios.nombre,
usuarios.apellido,
usuarios.correo,
usuarios.estado,
usuarios.id_rol,
usuarios.id_area,

roles.nombre_rol,
areas.nombre_area


FROM usuarios


INNER JOIN roles

ON usuarios.id_rol=roles.id_rol


INNER JOIN areas

ON usuarios.id_area=areas.id_area


WHERE usuarios.correo=?

AND usuarios.password=?

AND usuarios.estado=1


`;



connection.query(

sql,

[usuario,password],

(error,resultado)=>{


if(error){

console.log(error);


return res.json({

success:false,

mensaje:"Error servidor"

});


}



if(resultado.length===0){


return res.json({

success:false,

mensaje:"Usuario o contraseña incorrectos"

});


}



res.json({

success:true,

usuario:resultado[0]

});


}


);


};








// =====================================
// LISTAR USUARIOS
// =====================================


exports.listarUsuarios=(req,res)=>{


const sql=`

SELECT


usuarios.id_usuario,
usuarios.nombre,
usuarios.apellido,
usuarios.correo,
usuarios.estado,
usuarios.id_rol,
usuarios.id_area,


roles.nombre_rol,

areas.nombre_area



FROM usuarios



INNER JOIN roles

ON usuarios.id_rol=roles.id_rol



INNER JOIN areas

ON usuarios.id_area=areas.id_area



`;



connection.query(

sql,

(error,resultado)=>{


if(error){

console.log(error);


return res.json({

success:false,

mensaje:"Error cargando usuarios"

});


}



res.json({

success:true,

usuarios:resultado

});


}


);


};








// =====================================
// CREAR USUARIO
// =====================================


exports.crearUsuario=(req,res)=>{


const {


nombre,
apellido,
correo,
password,
id_rol,
id_area


}=req.body;



const sql=`

INSERT INTO usuarios

(
nombre,
apellido,
correo,
password,
estado,
id_rol,
id_area
)

VALUES

(
?,
?,
?,
?,
1,
?,
?

)

`;



connection.query(

sql,

[
nombre,
apellido,
correo,
password,
id_rol,
id_area
],


(error)=>{


if(error){

console.log(error);


return res.json({

success:false,

mensaje:"Error creando usuario"

});


}



res.json({

success:true,

mensaje:"Usuario creado correctamente"

});


}


);



};









// =====================================
// EDITAR USUARIO
// =====================================


exports.editarUsuario=(req,res)=>{


const id=req.params.id;



const {

nombre,
apellido,
correo,
id_rol,
id_area


}=req.body;




const sql=`

UPDATE usuarios

SET

nombre=?,

apellido=?,

correo=?,

id_rol=?,

id_area=?


WHERE id_usuario=?


`;



connection.query(

sql,

[

nombre,
apellido,
correo,
id_rol,
id_area,
id

],


(error)=>{


if(error){

console.log(error);


return res.json({

success:false,

mensaje:"Error editando usuario"

});


}



res.json({

success:true,

mensaje:"Usuario actualizado correctamente"

});


}


);



};









// =====================================
// CAMBIAR ESTADO
// =====================================


exports.cambiarEstado=(req,res)=>{


const id=req.params.id;


const {estado}=req.body;



const sql=`

UPDATE usuarios

SET estado=?

WHERE id_usuario=?

`;



connection.query(

sql,

[estado,id],


(error)=>{


if(error){

return res.json({

success:false,

mensaje:"Error actualizando estado"

});


}



res.json({

success:true,

mensaje:"Estado actualizado correctamente"

});


}


);



};