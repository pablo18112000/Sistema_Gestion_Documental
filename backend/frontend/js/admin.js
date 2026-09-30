"use strict";
let usuarioSeleccionado=0;
let cuentaActual=null;
let usuariosDisponibles=new Map();
let guardandoUsuario=false;
const elemento=id=>document.getElementById(id);
function protegido(u){return Number(u.es_programador)===1;}
function editable(u){return cuentaActual && (!protegido(u)||protegido(cuentaActual));}
async function peticion(url,opciones={}){
  const r=await fetch(url,{...opciones,credentials:"same-origin",cache:"no-store"});
  if(r.status===401){localStorage.removeItem("usuario");location.replace("/login.html");throw new Error("Inicia sesión nuevamente.");}
  let d;try{d=await r.json();}catch{throw new Error("El servidor no respondió correctamente.");}
  if(!r.ok||d.success!==true)throw new Error(d.mensaje||"No se pudo completar la operación.");
  return d;
}
async function cargarUsuarios(){
  const d=await peticion("/usuarios");
  if(!Array.isArray(d.usuarios))throw new Error("La lista de usuarios no es válida.");
  usuariosDisponibles=new Map(d.usuarios.map(u=>[Number(u.id_usuario),u]));
  const tabla=elemento("listaUsuarios");tabla.replaceChildren();
  for(const u of d.usuarios){
    const fila=document.createElement("tr");
    for(const valor of [u.nombre,u.apellido,u.correo,protegido(u)?"Programador (protegido)":u.nombre_rol,u.nombre_area]){
      const celda=document.createElement("td");celda.textContent=valor||"—";fila.append(celda);
    }
    const estado=document.createElement("td"),etiqueta=document.createElement("span");
    etiqueta.className=Number(u.estado)===1?"estado-activo":"estado-inactivo";
    etiqueta.textContent=Number(u.estado)===1?"Activo":"Inactivo";estado.append(etiqueta);fila.append(estado);
    const acciones=document.createElement("td");
    if(editable(u)){
      const editar=document.createElement("button");editar.type="button";editar.className="btn-editar";editar.textContent="Editar";
      editar.addEventListener("click",()=>abrirEditar(u.id_usuario));acciones.append(editar);
      if(!protegido(u)&&Number(u.id_usuario)!==Number(cuentaActual.id_usuario)){
        const cambiar=document.createElement("button");cambiar.type="button";cambiar.className="btn-desactivar";
        cambiar.textContent=Number(u.estado)===1?"Desactivar":"Activar";
        cambiar.addEventListener("click",()=>cambiarEstado(u.id_usuario,u.estado));acciones.append(cambiar);
      }
    }else{acciones.textContent="Cuenta protegida";}
    fila.append(acciones);tabla.append(fila);
  }
}
function abrirFormulario(){
  if(!cuentaActual)return;
  elemento("editarUsuario").style.display="none";
  const f=elemento("formularioUsuario");f.style.display=f.style.display==="none"?"block":"none";
}
function leerDatos(prefijo=""){
  return prefijo?{
    nombre:elemento("editNombre").value.trim(),apellido:elemento("editApellido").value.trim(),correo:elemento("editCorreo").value.trim(),
    id_rol:elemento("editRol").value,id_area:elemento("editArea").value
  }:{nombre:elemento("nombre").value.trim(),apellido:elemento("apellido").value.trim(),correo:elemento("correo").value.trim(),
    password:elemento("password").value,id_rol:elemento("rol").value,id_area:elemento("area").value};
}
async function guardar(url,method,datos,alCompletar){
  if(guardandoUsuario||!cuentaActual)return;
  guardandoUsuario=true;
  try{
    const r=await peticion(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(datos)});
    alCompletar?.();alert(r.mensaje);
    try{await cargarUsuarios();}catch{alert("El cambio se guardó, pero no se pudo refrescar la lista. Recarga la página.");}
  }catch(e){alert(e.message);}finally{guardandoUsuario=false;}
}
async function crearUsuario(){
  const d=leerDatos();
  if(!d.nombre||!d.apellido||!elemento("correo").checkValidity()||!d.correo){alert("Completa nombre, apellido y correo válido.");return;}
  if([...d.password].length<12||new TextEncoder().encode(d.password).length>72){alert("Usa una contraseña de al menos 12 caracteres; máximo 72 bytes UTF-8.");return;}
  await guardar("/usuarios","POST",d,()=>{
    for(const campo of ["nombre","apellido","correo","password"])elemento(campo).value="";
    elemento("formularioUsuario").style.display="none";
  });
}
function abrirEditar(id){
  const u=usuariosDisponibles.get(Number(id));if(!u||!editable(u))return;
  usuarioSeleccionado=Number(id);
  elemento("formularioUsuario").style.display="none";elemento("editarUsuario").style.display="block";
  elemento("editNombre").value=u.nombre||"";elemento("editApellido").value=u.apellido||"";elemento("editCorreo").value=u.correo||"";
  elemento("editRol").value=u.id_rol;elemento("editArea").value=u.id_area;
  elemento("editRol").disabled=protegido(u)||Number(u.id_usuario)===Number(cuentaActual.id_usuario);
}
async function guardarEdicion(){
  if(!usuarioSeleccionado)return;
  await guardar("/usuarios/editar/"+usuarioSeleccionado,"PUT",leerDatos("edit"),()=>{elemento("editarUsuario").style.display="none";usuarioSeleccionado=0;});
}
async function cambiarEstado(id,estado){
  const u=usuariosDisponibles.get(Number(id));if(!u||!editable(u)||protegido(u)||Number(id)===Number(cuentaActual.id_usuario))return;
  if(!confirm((Number(estado)===1?"¿Desactivar a ":"¿Activar a ")+u.nombre+"?"))return;
  await guardar("/usuarios/estado/"+id,"PUT",{estado:Number(estado)===1?0:1});
}
document.addEventListener("DOMContentLoaded",async()=>{
  try{
    cuentaActual=await verificarSesion("Administrador");if(!cuentaActual)return;
    const titulo=document.querySelector("header h2");
    if(titulo&&protegido(cuentaActual))titulo.textContent="Panel del programador";
    const campo=elemento("password");campo.minLength=12;campo.placeholder="Contraseña: mínimo 12 caracteres";
    await cargarUsuarios();
  }catch(e){alert(e.message);}
});
