// =====================================
// CONTROL DE SESIÓN Y ROLES
// =====================================


function verificarSesion(rolPermitido){



    let usuario = localStorage.getItem("usuario");



    // No existe sesión

    if(!usuario){


        window.location.href = "login.html";


        return;


    }




    usuario = JSON.parse(usuario);





    // Validar rol


    if(usuario.nombre_rol !== rolPermitido){



        alert(
            "No tienes permisos para ingresar a este módulo"
        );



        window.location.href = "login.html";


        return;


    }



}