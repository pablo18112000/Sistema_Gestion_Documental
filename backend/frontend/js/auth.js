"use strict";

// =====================================
// SESIÓN COMPARTIDA DEL FRONTEND
// =====================================

let promesaSesionCoemsa = null;
let avisoSesionCoemsaMostrado = false;
let tokenCSRFCoemsa = null;


// Conservamos la función fetch original.
// Las consultas de sesión usan esta función
// para evitar llamadas recursivas.
const fetchOriginalCoemsa =
  window.fetch.bind(window);


// =====================================
// UTILIDADES CSRF
// =====================================

function metodoSolicitudCoemsa(
  entrada,
  opciones
) {

  const metodo =
    opciones?.method ||
    (
      entrada instanceof Request
        ? entrada.method
        : "GET"
    );


  return String(
    metodo
  ).toUpperCase();
}


function urlSolicitudCoemsa(
  entrada
) {

  try {

    const valor =
      entrada instanceof Request
        ? entrada.url
        : entrada;


    return new URL(
      String(valor),
      window.location.href
    );

  } catch {

    return null;
  }
}


function necesitaCSRFCoemsa(
  entrada,
  opciones
) {

  const metodo =
    metodoSolicitudCoemsa(
      entrada,
      opciones
    );


  if (
    ![
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ].includes(metodo)
  ) {

    return false;
  }


  const url =
    urlSolicitudCoemsa(
      entrada
    );


  if (
    !url ||
    url.origin !==
      window.location.origin
  ) {

    return false;
  }


  // El login todavía no dispone
  // de una sesión autenticada.
  if (
    url.pathname ===
      "/usuarios/login"
  ) {

    return false;
  }


  return true;
}


// =====================================
// FETCH PROTEGIDO GLOBAL
// =====================================

window.fetch =
  async function (
    entrada,
    opciones = {}
  ) {

    if (
      necesitaCSRFCoemsa(
        entrada,
        opciones
      )
    ) {

      /*
       * Si alguna operación intenta ejecutarse
       * antes de haber obtenido el token,
       * primero comprobamos la sesión.
       */
      if (!tokenCSRFCoemsa) {

        try {

          await obtenerSesionCoemsa();

        } catch {

          // La petición seguirá su curso.
          // El servidor decidirá si la sesión
          // sigue siendo válida.
        }
      }


      if (tokenCSRFCoemsa) {

        const headers =
          new Headers(
            entrada instanceof Request
              ? entrada.headers
              : undefined
          );


        if (opciones.headers) {

          const adicionales =
            new Headers(
              opciones.headers
            );


          adicionales.forEach(
            (valor, nombre) => {

              headers.set(
                nombre,
                valor
              );
            }
          );
        }


        headers.set(
          "X-CSRF-Token",
          tokenCSRFCoemsa
        );


        opciones = {
          ...opciones,
          headers
        };
      }
    }


    return fetchOriginalCoemsa(
      entrada,
      opciones
    );
  };


// =====================================
// OBTENER SESIÓN
// =====================================

async function obtenerSesionCoemsa() {

  if (promesaSesionCoemsa) {
    return promesaSesionCoemsa;
  }


  promesaSesionCoemsa =
    (async () => {

      const respuesta =
        await fetchOriginalCoemsa(
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

        tokenCSRFCoemsa =
          null;


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


      if (
        typeof datos.csrfToken !==
          "string" ||
        !/^[a-f0-9]{64}$/i.test(
          datos.csrfToken
        )
      ) {

        throw new Error(
          "La protección de la sesión no es válida."
        );
      }


      tokenCSRFCoemsa =
        datos.csrfToken;


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

    promesaSesionCoemsa =
      null;


    tokenCSRFCoemsa =
      null;


    throw error;
  }
}


// =====================================
// VERIFICAR SESIÓN Y ROL
// =====================================

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


    if (
      respuesta.status ===
        401
    ) {

      promesaSesionCoemsa =
        null;


      tokenCSRFCoemsa =
        null;


      localStorage.removeItem(
        "usuario"
      );


      window.location.replace(
        "/login.html"
      );


      return;
    }


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


    tokenCSRFCoemsa =
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