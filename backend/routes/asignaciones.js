"use strict";
const express=require("express");
const g=require("../config/gestionUsuarios");
const {verificarSesion,permitirRoles}=require("../middlewares/auth");
const router=express.Router();
router.use(verificarSesion,permitirRoles("Administrador"));
router.use((req,res,next)=>{res.set("Cache-Control","no-store");next();});
router.get("/proyectos",async(req,res)=>{
  try {
    const [proyectos]=await g.pool.query("SELECT id_proyecto,nombre_proyecto,descripcion FROM proyectos ORDER BY nombre_proyecto");
    return res.json({success:true,proyectos});
  } catch(e){return g.error(res,e);}
});
router.get("/usuarios/:id",async(req,res)=>{
  try {
    const numero=g.id(req.params.id);
    const [u]=await g.pool.query("SELECT id_usuario FROM usuarios WHERE id_usuario=?",[numero]);
    if (!u.length) throw g.fallo(404,"Usuario no encontrado.");
    const [proyectos]=await g.pool.query(`SELECT p.id_proyecto,p.nombre_proyecto,up.fecha_asignacion
      FROM usuario_proyectos up JOIN proyectos p ON p.id_proyecto=up.id_proyecto WHERE up.id_usuario=? ORDER BY p.nombre_proyecto`,[numero]);
    return res.json({success:true,proyectos});
  }catch(e){return g.error(res,e);}
});
router.post("/",async(req,res)=>{
  try {
    const usuario=g.id(req.body?.id_usuario),proyecto=g.id(req.body?.id_proyecto);
    const creado=await g.cambiar(req,async(c,actor)=>{
      const u=await g.objetivo(c,usuario);g.proteger(actor,u);
      if (Number(u.estado)!==1) throw g.fallo(400,"Activa al usuario antes de asignarle un proyecto.");
      const [p]=await c.query("SELECT id_proyecto FROM proyectos WHERE id_proyecto=?",[proyecto]);
      if (!p.length) throw g.fallo(404,"Proyecto no encontrado.");
      const [actual]=await c.query("SELECT id_usuario FROM usuario_proyectos WHERE id_usuario=? AND id_proyecto=?",[usuario,proyecto]);
      if (actual.length) return false;
      await c.query("INSERT INTO usuario_proyectos(id_usuario,id_proyecto) VALUES(?,?)",[usuario,proyecto]);
      await g.auditar(c,actor.id_usuario,"ASIGNAR_PROYECTO",usuario,{id_proyecto:proyecto});
      return true;
    });
    return res.status(creado?201:200).json({success:true,mensaje:creado?"Proyecto asignado correctamente.":"El usuario ya estaba asignado a ese proyecto."});
  }catch(e){return g.error(res,e);}
});
router.delete("/:idUsuario/:idProyecto",async(req,res)=>{
  try {
    const usuario=g.id(req.params.idUsuario),proyecto=g.id(req.params.idProyecto);
    const eliminado=await g.cambiar(req,async(c,actor)=>{
      const u=await g.objetivo(c,usuario);g.proteger(actor,u);
      const [r]=await c.query("DELETE FROM usuario_proyectos WHERE id_usuario=? AND id_proyecto=?",[usuario,proyecto]);
      if(r.affectedRows)await g.auditar(c,actor.id_usuario,"RETIRAR_PROYECTO",usuario,{id_proyecto:proyecto});
      return r.affectedRows>0;
    });
    return res.json({success:true,mensaje:eliminado?"Asignación retirada correctamente.":"El usuario no tenía esa asignación."});
  }catch(e){return g.error(res,e);}
});
module.exports=router;
