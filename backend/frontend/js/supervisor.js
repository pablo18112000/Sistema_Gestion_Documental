const tabla = document.getElementById("listaDocumentos");



function cargarDocumentos(){


fetch("http://localhost:3000/aprobaciones/pendientes")


.then(res=>res.json())


.then(data=>{


tabla.innerHTML="";



if(data.documentos.length===0){


tabla.innerHTML=`

<tr>

<td colspan="7">

No existen documentos pendientes

</td>

</tr>

`;


return;

}




data.documentos.forEach(doc=>{


tabla.innerHTML += `


<tr>


<td>


${doc.nombre_archivo}


<br><br>


<a href="${doc.ruta_nube}" target="_blank">


<button class="ver">

👁 Ver documento

</button>


</a>


</td>



<td>

${doc.nombre}

${doc.apellido}

</td>



<td>

${doc.correo}

</td>



<td>

Proyecto

</td>



<td>

${new Date(doc.fecha_subida).toLocaleDateString()}

</td>



<td>

${doc.estado}

</td>



<td>


<button

class="aprobar"

onclick="aprobar(${doc.id_aprobacion})">

✔ Aprobar

</button>



<button

class="rechazar"

onclick="rechazar(${doc.id_aprobacion})">

✖ Rechazar

</button>


</td>



</tr>


`;


});


});


}







function aprobar(id){


fetch(

`http://localhost:3000/aprobaciones/aprobar/${id}`,

{

method:"PUT"

}

)


.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


cargarDocumentos();


});


}








function rechazar(id){


let comentario = prompt(

"Ingrese el motivo del rechazo:"

);



if(!comentario){

alert(
"Debe ingresar un motivo"
);

return;

}




fetch(

`http://localhost:3000/aprobaciones/rechazar/${id}`,

{

method:"PUT",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

comentario:comentario

})

}

)


.then(res=>res.json())


.then(data=>{


alert(data.mensaje);


cargarDocumentos();


});


}






cargarDocumentos();