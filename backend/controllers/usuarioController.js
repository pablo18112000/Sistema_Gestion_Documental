"use strict";
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const g = require("../config/gestionUsuarios");
const texto = v => typeof v === "string" ? v.trim() : "";
function datosUsuario(body={}) {
  if (Object.hasOwn(body,"es_programador")) throw g.fallo(403,"La protección del programador no se cambia desde este formulario.");
  const d={nombre:texto(body.nombre),apellido:texto(body.apellido),correo:texto(body.correo),id_rol:g.id(body.id_rol),id_area:g.id(body.id_area)};
  if (!d.nombre || !d.apellido || [...d.nombre].length>100 || [...d.apellido].length>100 || d.correo.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo))
    throw g.fallo(400,"Completa nombres, apellidos y un correo válido.");
  return d;
}
async function validarCatalogos(c,d) {
  const [r]=await c.query("SELECT nombre_rol FROM roles WHERE id_rol=?",[d.id_rol]);
  if (!r.length || !["Administrador","Supervisor","Usuario"].includes(r[0].nombre_rol)) throw g.fallo(400,"Selecciona uno de los tres roles del sistema.");
  const [a]=await c.query("SELECT id_area FROM areas WHERE id_area=? AND estado=1",[d.id_area]);
  if (!a.length) throw g.fallo(400,"Selecciona un área activa.");
  return r[0].nombre_rol;
}
exports.login=async(req,res)=>{
  try {
    const correo=texto(req.body?.usuario), password=req.body?.password;
    if (!correo || correo.length>150 || typeof password!=="string" || !password.length || password.length>4096) throw g.fallo(400,"Ingresa tu correo y contraseña.");
    if (!req.session) throw g.fallo(503,"La configuración de sesiones no está disponible.");
    const [filas]=await g.pool.query(`SELECT ${g.campos}, u.password, u.password_hash ${g.desde} WHERE u.correo=? AND u.estado=1 LIMIT 1`,[correo]);
    const u=filas[0];
    let coincide=false;
    if (u?.password_hash) {
      coincide=Buffer.byteLength(password,"utf8")<=72 && await bcrypt.compare(password,u.password_hash);
    } else if (u) {
      const digest=v=>crypto.createHash("sha256").update(String(v)).digest();
      coincide=crypto.timingSafeEqual(digest(password),digest(u.password));
    }
    if (!coincide) throw g.fallo(401,"Usuario o contraseña incorrectos.");
    // Migración gradual: no interpreta el formato de contraseñas antiguas.
    // Las antiguas de más de 72 bytes se mantienen sin truncar.
    if (!u.password_hash && Buffer.byteLength(password,"utf8")<=72) {
      const hash=await bcrypt.hash(password,12);
      await g.pool.query("UPDATE usuarios SET password_hash=?, password='' WHERE id_usuario=? AND password_hash IS NULL AND BINARY password=BINARY ?",[hash,u.id_usuario,password]);
    }
    delete u.password; delete u.password_hash;
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.id_usuario=u.id_usuario;
    await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
    res.set("Cache-Control","no-store");
    return res.json({success:true,usuario:u});
  } catch(e) { return g.error(res,e); }
};
exports.listarUsuarios=async(req,res)=>{
  try {
    const [usuarios]=await g.pool.query(`SELECT ${g.campos} ${g.desde} ORDER BY u.nombre,u.apellido`);
    res.set("Cache-Control","no-store");
    return res.json({success:true,usuarios});
  } catch(e) {return g.error(res,e);}
};
exports.crearUsuario=async(req,res)=>{
  try {
    const d=datosUsuario(req.body),p=req.body?.password;
    if (typeof p!=="string" || [...p].length<12 || Buffer.byteLength(p,"utf8")>72) throw g.fallo(400,"Usa una contraseña de al menos 12 caracteres y hasta 72 bytes UTF-8.");
    const hash=await bcrypt.hash(p,12);
    const numero=await g.cambiar(req,async(c,actor)=>{
      await validarCatalogos(c,d);
      const [r]=await c.query(`INSERT INTO usuarios(nombre,apellido,correo,password,password_hash,estado,id_rol,id_area,es_programador)
        VALUES(?,?,?,'',?,1,?,?,0)`,[d.nombre,d.apellido,d.correo,hash,d.id_rol,d.id_area]);
      await g.auditar(c,actor.id_usuario,"CREAR_USUARIO",r.insertId,{id_rol:d.id_rol,id_area:d.id_area});
      return r.insertId;
    });
    return res.status(201).json({success:true,mensaje:"Usuario creado correctamente.",id_usuario:numero});
  } catch(e) {return g.error(res,e);}
};
exports.editarUsuario=async(req,res)=>{
  try {
    const numero=g.id(req.params.id),d=datosUsuario(req.body);
    await g.cambiar(req,async(c,actor)=>{
      const u=await g.objetivo(c,numero); g.proteger(actor,u);
      const rol=await validarCatalogos(c,d);
      if ((Number(u.es_programador)===1 || numero===Number(actor.id_usuario)) && rol!=="Administrador")
        throw g.fallo(409,"Tu cuenta y las cuentas protegidas deben conservar el rol Administrador.");
      await c.query("UPDATE usuarios SET nombre=?,apellido=?,correo=?,id_rol=?,id_area=? WHERE id_usuario=?",[d.nombre,d.apellido,d.correo,d.id_rol,d.id_area,numero]);
      await g.auditar(c,actor.id_usuario,"EDITAR_USUARIO",numero,{antes:{id_rol:u.id_rol,id_area:u.id_area},despues:{id_rol:d.id_rol,id_area:d.id_area}});
    });
    return res.json({success:true,mensaje:"Usuario actualizado correctamente."});
  } catch(e) {return g.error(res,e);}
};
exports.cambiarEstado=async(req,res)=>{
  try {
    const numero=g.id(req.params.id),valor=req.body?.estado;
    if (![0,1,"0","1"].includes(valor)) throw g.fallo(400,"Indica un estado válido.");
    const estado=Number(valor);
    await g.cambiar(req,async(c,actor)=>{
      const u=await g.objetivo(c,numero); g.proteger(actor,u);
      if (estado===0 && (numero===Number(actor.id_usuario) || Number(u.es_programador)===1)) throw g.fallo(409,"No puedes desactivar tu cuenta ni una cuenta protegida del programador.");
      await c.query("UPDATE usuarios SET estado=? WHERE id_usuario=?",[estado,numero]);
      await g.auditar(c,actor.id_usuario,"CAMBIAR_ESTADO",numero,{antes:u.estado,despues:estado});
    });
    return res.json({success:true,mensaje:"Estado actualizado correctamente."});
  } catch(e) {return g.error(res,e);}
};
