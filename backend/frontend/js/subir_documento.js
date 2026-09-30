function subirDocumento(){


let archivo=

document.getElementById("archivo").files[0];



if(!archivo){

alert("Seleccione archivo");

return;

}



let formData=

new FormData();



formData.append(

"archivo",

archivo

);





fetch(

"/documentos/subir",

{

method:"POST",

body:formData

}

)



.then(res=>res.json())


.then(data=>{


document.getElementById("mensaje").innerHTML=

data.mensaje;


});


}