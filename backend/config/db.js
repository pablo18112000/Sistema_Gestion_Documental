require("dotenv").config();

const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: Number(process.env.MYSQLPORT)
});

connection.connect((err) => {
    if (err) {
        console.log("Error conectando MySQL:", err.message);
        return;
    }

    console.log("MySQL conectado correctamente");
});

module.exports = connection;