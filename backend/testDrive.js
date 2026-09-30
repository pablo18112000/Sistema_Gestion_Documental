const drive = require("./config/googleDrive");


async function probar(){


try{


const respuesta =
await drive.files.list({

pageSize:10,

fields:"files(id,name)"

});


console.log(
"Drive conectado correctamente"
);


console.log(
respuesta.data.files
);


}catch(error){


console.log(
"ERROR DRIVE"
);


console.log(error.message);


}



}


probar();