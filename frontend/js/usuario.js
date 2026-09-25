document.addEventListener(

"DOMContentLoaded",

()=>{


cargarMisDocumentos();


});






// =====================================
// SUBIR DOCUMENTO
// =====================================


document
.getElementById("formDocumento")
.addEventListener(

"submit",

function(e){


e.preventDefault();



let formulario =
document.getElementById("formDocumento");



let datos =
new FormData(formulario);




fetch(

"http://localhost:3000/documentos/subir",

{

method:"POST",

body:datos

}

)


.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


formulario.reset();


cargarMisDocumentos();


});



}

);







// =====================================
// MIS DOCUMENTOS
// =====================================


function cargarMisDocumentos(){



fetch(

"http://localhost:3000/documentos/mis-documentos/1"

)


.then(res=>res.json())


.then(data=>{


const contenedor =
document.getElementById("misDocumentos");



if(data.documentos.length===0){


contenedor.innerHTML=

"<p>No hay documentos enviados</p>";


return;


}



contenedor.innerHTML="";



data.documentos.forEach(doc=>{


let estado = doc.estado || "Pendiente";



let color="orange";



if(estado==="Aprobado"){

color="green";

}


if(estado==="Rechazado"){

color="red";

}




contenedor.innerHTML += `


<div class="card">


<h3>
📄 ${doc.nombre_archivo}
</h3>



<p>
📌 Estado:

<b style="color:${color}">
${estado}
</b>

</p>



<p>
💬 ${doc.comentario || ""}
</p>




<a href="http://localhost:3000/uploads/${doc.nombre_archivo}"

target="_blank">


<button>

👁 Ver PDF

</button>


</a>



</div>



`;



});


});


}