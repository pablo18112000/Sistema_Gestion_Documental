function login(){


let correo =
document.getElementById("correo").value;


let password =
document.getElementById("password").value;



fetch(

"http://localhost:3000/usuarios/login",

{

method:"POST",

headers:{

"Content-Type":"application/json"

},


body:JSON.stringify({

usuario:correo,

password:password

})


}


)


.then(res=>res.json())


.then(data=>{



if(!data.success){


document.getElementById("mensaje").innerHTML =
"❌ "+data.mensaje;


return;


}




let rol =
data.usuario.nombre_rol;



// guardar sesión

localStorage.setItem(

"usuario",

JSON.stringify(data.usuario)

);





if(rol==="Supervisor"){


window.location.href="supervisor.html";


}


else if(rol==="Administrador"){


window.location.href="admin.html";


}


else if(rol==="Usuario"){


window.location.href="usuario.html";


}


else{


alert("Rol sin configuración");


}




})


.catch(error=>{


console.log(error);


});


}