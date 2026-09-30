// =====================================
// COMPROBAR SESIÓN Y ROL EN EL SERVIDOR
// =====================================

async function verificarSesion(rolPermitido) {
  try {
    const respuesta = await fetch("/usuarios/sesion", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (respuesta.status === 401) {
      localStorage.removeItem("usuario");
      window.location.replace("/login.html");
      return null;
    }

    if (!respuesta.ok) {
      throw new Error("No se pudo verificar la sesión.");
    }

    const datos = await respuesta.json();

    if (!datos.success || !datos.usuario) {
      throw new Error("Respuesta de sesión inválida.");
    }

    const usuario = datos.usuario;

    if (
      rolPermitido &&
      usuario.nombre_rol !== rolPermitido
    ) {
      alert("No tienes permiso para ingresar a este módulo.");
      window.location.replace("/login.html");
      return null;
    }

    // Compatibilidad con las pantallas existentes.
    // Los permisos reales los comprueba el backend.
    localStorage.setItem(
      "usuario",
      JSON.stringify(usuario)
    );

    return usuario;
  } catch {
    alert(
      "No se pudo comprobar la sesión. Revisa la conexión e inténtalo nuevamente."
    );

    return null;
  }
}

// =====================================
// CERRAR SESIÓN EN EL SERVIDOR
// =====================================

async function cerrarSesion() {
  try {
    const respuesta = await fetch("/usuarios/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.success) {
      throw new Error("No se pudo cerrar la sesión.");
    }

    localStorage.removeItem("usuario");
    window.location.replace("/login.html");
  } catch {
    alert(
      "No se pudo cerrar la sesión. Inténtalo nuevamente."
    );
  }
}