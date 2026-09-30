const fs = require("fs");
const drive = require("./config/googleDrive");


async function subir(){

try{


const respuesta = await drive.files.create({

requestBody:{

name:"prueba_drive.pdf",

parents:[
process.env.GOOGLE_DRIVE_FOLDER_ID
]

},


media:{

mimeType:"application/pdf",

body:fs.createReadStream("./prueba_drive.pdf")

},


fields:"id,name"


});


console.log("ARCHIVO SUBIDO:");

console.log(respuesta.data);



}catch(error){

console.log("ERROR:");

console.log(error.message);


}


}


subir();