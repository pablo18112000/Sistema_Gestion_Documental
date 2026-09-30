"use strict";
require("dotenv").config();
const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.MYSQLHOST, port: Number(process.env.MYSQLPORT || 3306),
  user: process.env.MYSQLUSER, password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE, waitForConnections: true,
  connectionLimit: 3, queueLimit: 30
});
const campos = `u.id_usuario, u.nombre, u.apellido, u.correo, u.estado,
  u.id_rol, u.id_area, u.es_programador, r.nombre_rol, a.nombre_area`;
const desde = `FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol
  LEFT JOIN areas a ON a.id_area=u.id_area`;
function fallo(status, message) { return Object.assign(new Error(message), {status}); }
function id(valor) {
  if (!/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor)>2147483647)
    throw fallo(400, "El identificador no es válido.");
  return Number(valor);
}
function proteger(actor, objetivo) {
  if (Number(objetivo.es_programador) === 1 && Number(actor.es_programador) !== 1)
    throw fallo(403, "Solo el programador puede modificar una cuenta protegida.");
}
async function auditar(c, actor, accion, objetivo, detalle={}) {
  await c.query(`INSERT INTO auditoria_accesos_coemsa
    (id_actor, accion, id_objetivo, detalle) VALUES (?,?,?,?)`,
    [actor, accion, objetivo, JSON.stringify(detalle)]);
}
async function cambiar(req, tarea) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    // Serializa modificaciones de cuentas y asignaciones entre instancias.
    const [control] = await c.query("SELECT id FROM control_accesos_coemsa WHERE id=1 FOR UPDATE");
    if (!control.length) throw fallo(503,"La preparación de cuentas está incompleta.");
    const [filas] = await c.query(`SELECT ${campos} ${desde} WHERE u.id_usuario=? FOR UPDATE`, [req.session?.id_usuario || 0]);
    const actor = filas[0];
    if (!actor || Number(actor.estado)!==1) throw fallo(401,"Inicia sesión nuevamente.");
    if (actor.nombre_rol!=="Administrador") throw fallo(403,"No tienes permiso para administrar cuentas.");
    const resultado = await tarea(c, actor);
    await c.commit();
    return resultado;
  } catch(e) {
    try { await c.rollback(); } catch { c.destroy(); }
    throw e;
  } finally { c.release(); }
}
async function objetivo(c, numero) {
  const [filas] = await c.query(`SELECT ${campos} ${desde} WHERE u.id_usuario=? FOR UPDATE`, [id(numero)]);
  if (!filas.length) throw fallo(404,"Usuario no encontrado.");
  return filas[0];
}
function error(res, e) {
  console.error("Gestión de cuentas:", e.code || e.status || "ERROR_INTERNO");
  if (e.status) return res.status(e.status).json({success:false,mensaje:e.message});
  if (e.code==="ER_DUP_ENTRY") return res.status(409).json({success:false,mensaje:"Ese registro ya existe."});
  if (e.code==="ER_NO_REFERENCED_ROW_2") return res.status(400).json({success:false,mensaje:"El usuario, área o proyecto no existe."});
  return res.status(500).json({success:false,mensaje:"No se pudo completar la operación. Revisa el resultado antes de repetirla."});
}
module.exports={pool,campos,desde,fallo,id,proteger,auditar,cambiar,objetivo,error};
