function subirDocumento(){


let archivo=document.getElementById("archivo").files[0];


if(!archivo){


alert("Seleccione un archivo");


return;


}



let datos=new FormData();



datos.append(
"archivo",
archivo
);



datos.append(
"id_proyecto",
document.getElementById("proyecto").value
);



datos.append(
"id_tipo",
document.getElementById("tipo").value
);





fetch(

"https://sistemagestiondocumental-production-885c.up.railway.app/documentos/subir",

{

method:"POST",

body:datos

}


)



.then(res=>res.json())


.then(data=>{


document.getElementById("mensaje").innerHTML=
data.mensaje;


})


.catch(error=>{


console.log(error);


});



}