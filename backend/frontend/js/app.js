// ==========================
// VALIDAR SESIÓN
// ==========================


let usuario = localStorage.getItem("usuario");



if(!usuario){

    window.location.href="login.html";

}



usuario = JSON.parse(usuario);







// ==========================
// MOSTRAR USUARIO
// ==========================


document.getElementById("bienvenida").innerHTML =

"Bienvenido: " + usuario.nombre + " " + usuario.apellido;









// ==========================
// MENU SEGÚN ROL
// ==========================


let menu = document.getElementById("menu");





if(usuario.id_rol == 1){


    // ADMINISTRADOR


    menu.innerHTML = `


    <button>
    📁 Proyectos
    </button>


    <button>
    📄 Documentos
    </button>


    <button onclick="abrirDocumento()">
    ⬆️ Subir documento
    </button>


    <button>
    👥 Usuarios
    </button>


    <button>
    ✅ Aprobaciones
    </button>


    <button>
    🔔 Notificaciones
    </button>


    `;



}




else if(usuario.id_rol == 2){



    // SUPERVISOR


    menu.innerHTML = `


    <button>
    📄 Documentos
    </button>


    <button onclick="abrirDocumento()">
    ⬆️ Subir documento
    </button>


    <button>
    ✅ Aprobaciones
    </button>


    <button>
    🔔 Notificaciones
    </button>


    `;



}





else{


    // USUARIO


    menu.innerHTML = `


    <button>
    📄 Documentos
    </button>


    `;



}









// ==========================
// CERRAR SESIÓN
// ==========================


function cerrarSesion(){


localStorage.removeItem("usuario");


window.location.href="login.html";


}









// ==========================
// LISTAR DOCUMENTOS
// ==========================


const tabla = document.getElementById("tablaDocumentos");


let listaDocumentos = [];





fetch("http://localhost:3000/documentos")


.then(res=>res.json())


.then(documentos=>{


listaDocumentos = documentos;


document.getElementById("cantidadDocumentos").innerHTML =
documentos.length;



mostrarDocumentos(documentos);



});








function mostrarDocumentos(documentos){


tabla.innerHTML="";



documentos.forEach(doc=>{



tabla.innerHTML += `


<tr>


<td>
${doc.id_documento}
</td>


<td>
${doc.nombre_archivo}
</td>


<td>
${doc.tipo_archivo}
</td>


<td>
${doc.estado_documento}
</td>


<td>
${doc.nombre_proyecto ?? "-"}
</td>



<td>

<a href="http://localhost:3000/${doc.ruta_nube}" target="_blank">

📥 Descargar

</a>


</td>


</tr>


`;



});


}









// ==========================
// FILTRO
// ==========================


function filtrarProyecto(){


let proyecto =

document.getElementById("filtroProyecto").value;



if(proyecto=="todos"){


mostrarDocumentos(listaDocumentos);


return;


}




let resultado = listaDocumentos.filter(doc=>


doc.id_proyecto == proyecto


);



mostrarDocumentos(resultado);



}









// ==========================
// MOSTRAR FORMULARIO
// ==========================


function abrirDocumento(){


document.getElementById("formDocumento").style.display="block";


}









// ==========================
// GUARDAR DOCUMENTO
// ==========================


function guardarDocumento(){


let archivo =
document.getElementById("archivo").files[0];



let proyecto =
document.getElementById("proyecto").value;



let tipo =
document.getElementById("tipoArchivo").value;



let descripcion =
document.getElementById("descripcion").value;





let datos = new FormData();



datos.append("archivo",archivo);


datos.append("id_proyecto",proyecto);


datos.append("tipo_archivo",tipo);


datos.append("descripcion",descripcion);


datos.append("id_usuario",usuario.id_usuario);






fetch("http://localhost:3000/documentos",{


method:"POST",

body:datos


})



.then(res=>res.json())


.then(data=>{


if(data.success){


alert("Documento registrado");


location.reload();


}


});



}