const express=require("express");

const router=express.Router();


const usuarioController=require("../controllers/usuarioController");




// LOGIN

router.post(

"/login",

usuarioController.login

);




// LISTAR

router.get(

"/",

usuarioController.listarUsuarios

);




// CREAR

router.post(

"/",

usuarioController.crearUsuario

);




// CAMBIAR ESTADO

router.put(

"/estado/:id",

usuarioController.cambiarEstado

);




// EDITAR

router.put(

"/editar/:id",

usuarioController.editarUsuario

);





router.get(

"/test",

(req,res)=>{


res.json({

mensaje:"Ruta usuarios funcionando"

});


}

);



console.log("RUTAS USUARIOS CARGADAS");


module.exports=router;