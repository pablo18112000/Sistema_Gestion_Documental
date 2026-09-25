const db = require("../config/db");

const Documento = {

    obtenerTodos: (resultado) => {

        db.query(
            "SELECT * FROM documentos",
            (error, datos) => {

                if(error){
                    resultado(error,null);
                    return;
                }

                resultado(null,datos);

            }
        );

    }

};

module.exports = Documento;