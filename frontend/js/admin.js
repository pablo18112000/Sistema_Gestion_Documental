let usuarioSeleccionado = 0;



document.addEventListener(

"DOMContentLoaded",

()=>{

cargarUsuarios();

}

);






function cargarUsuarios(){



fetch(

"http://localhost:3000/usuarios"

)



.then(res=>res.json())


.then(data=>{



let tabla=document.getElementById("listaUsuarios");


tabla.innerHTML="";



data.usuarios.forEach(usuario=>{



tabla.innerHTML += `


<tr>


<td>

${usuario.nombre}

</td>


<td>

${usuario.apellido}

</td>


<td>

${usuario.correo}

</td>


<td>

${usuario.nombre_rol}

</td>


<td>

${usuario.nombre_area}

</td>


<td>

${usuario.estado==1?"Activo":"Inactivo"}

</td>


<td>



<button onclick="abrirEditar(${usuario.id_usuario},
'${usuario.nombre}',
'${usuario.apellido}',
'${usuario.correo}',
${usuario.id_rol},
${usuario.id_area})">

✏ Editar

</button>




<button onclick="cambiarEstado(${usuario.id_usuario},${usuario.estado})">


${usuario.estado==1?"🔒 Desactivar":"🔓 Activar"}


</button>



</td>


</tr>



`;



});


});


}









function abrirFormulario(){


let formulario=document.getElementById("formularioUsuario");


if(formulario.style.display==="none"){

formulario.style.display="block";

}else{

formulario.style.display="none";

}


}









function crearUsuario(){



let datos={


nombre:
document.getElementById("nombre").value,


apellido:
document.getElementById("apellido").value,


correo:
document.getElementById("correo").value,


password:
document.getElementById("password").value,


id_rol:
document.getElementById("rol").value,


id_area:
document.getElementById("area").value



};




fetch(

"http://localhost:3000/usuarios",

{


method:"POST",


headers:{

"Content-Type":"application/json"

},


body:JSON.stringify(datos)



}


)



.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


cargarUsuarios();


});


}









function abrirEditar(

id,
nombre,
apellido,
correo,
rol,
area

){



usuarioSeleccionado=id;



document.getElementById("editarUsuario").style.display="block";



document.getElementById("editNombre").value=nombre;


document.getElementById("editApellido").value=apellido;


document.getElementById("editCorreo").value=correo;


document.getElementById("editRol").value=rol;


document.getElementById("editArea").value=area;



}









function guardarEdicion(){



let datos={


nombre:
document.getElementById("editNombre").value,


apellido:
document.getElementById("editApellido").value,


correo:
document.getElementById("editCorreo").value,


id_rol:
document.getElementById("editRol").value,


id_area:
document.getElementById("editArea").value



};





fetch(

"http://localhost:3000/usuarios/editar/"+usuarioSeleccionado,

{


method:"PUT",


headers:{

"Content-Type":"application/json"

},


body:JSON.stringify(datos)



}


)



.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


document.getElementById("editarUsuario").style.display="none";


cargarUsuarios();


});


}









function cambiarEstado(id,estado){



fetch(

"http://localhost:3000/usuarios/estado/"+id,

{


method:"PUT",


headers:{

"Content-Type":"application/json"

},


body:JSON.stringify({

estado:estado==1?0:1

})


}


)



.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


cargarUsuarios();


});


}