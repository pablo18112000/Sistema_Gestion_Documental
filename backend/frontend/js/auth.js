// =====================================
// SESIÓN COMPARTIDA DEL FRONTEND
// =====================================

let promesaSesionCoemsa = null;
let avisoSesionCoemsaMostrado = false;


async function obtenerSesionCoemsa() {

  if (promesaSesionCoemsa) {
    return promesaSesionCoemsa;
  }


  promesaSesionCoemsa =
    (async () => {

      const respuesta =
        await fetch(
          "/usuarios/sesion",
          {
            credentials:
              "same-origin",

            cache:
              "no-store"
          }
        );


      if (
        respuesta.status ===
        401
      ) {

        localStorage.removeItem(
          "usuario"
        );

        window.location.replace(
          "/login.html"
        );

        return null;
      }


      if (!respuesta.ok) {
        throw new Error(
          "No se pudo verificar la sesión."
        );
      }


      const datos =
        await respuesta.json();


      if (
        !datos.success ||
        !datos.usuario
      ) {

        throw new Error(
          "Respuesta de sesión inválida."
        );
      }


      localStorage.setItem(
        "usuario",
        JSON.stringify(
          datos.usuario
        )
      );


      return datos.usuario;

    })();


  try {

    return await promesaSesionCoemsa;

  } catch (error) {

    // Permite reintentar si hubo un corte de conexión.
    promesaSesionCoemsa =
      null;

    throw error;
  }
}


async function verificarSesion(
  rolPermitido
) {

  try {

    const usuario =
      await obtenerSesionCoemsa();


    if (!usuario) {
      return null;
    }


    if (
      rolPermitido &&
      usuario.nombre_rol !==
        rolPermitido
    ) {

      alert(
        "No tienes permiso para ingresar a este módulo."
      );

      window.location.replace(
        "/login.html"
      );

      return null;
    }


    avisoSesionCoemsaMostrado =
      false;


    return usuario;


  } catch {

    if (
      !avisoSesionCoemsaMostrado
    ) {

      avisoSesionCoemsaMostrado =
        true;

      alert(
        "No se pudo comprobar la sesión. Revisa la conexión e inténtalo nuevamente."
      );
    }


    return null;
  }
}


// =====================================
// CERRAR SESIÓN
// =====================================

async function cerrarSesion() {

  try {

    const respuesta =
      await fetch(
        "/usuarios/logout",
        {
          method:
            "POST",

          credentials:
            "same-origin",

          cache:
            "no-store"
        }
      );


    const datos =
      await respuesta.json();


    if (
      !respuesta.ok ||
      !datos.success
    ) {

      throw new Error(
        "No se pudo cerrar la sesión."
      );
    }


    promesaSesionCoemsa =
      null;


    localStorage.removeItem(
      "usuario"
    );


    window.location.replace(
      "/login.html"
    );


  } catch {

    alert(
      "No se pudo cerrar la sesión. Inténtalo nuevamente."
    );
  }
}
