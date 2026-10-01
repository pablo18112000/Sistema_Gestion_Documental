"use strict";

(function () {

  const configuracion = {

    Administrador: {

      inicio:
        "/admin.html",

      opciones: [

        {
          nombre:
            "Usuarios",

          url:
            "/admin.html"
        },

        {
          nombre:
            "Subir PDF",

          url:
            "/subir_documento.html"
        },

        {
          nombre:
            "Archivo documental",

          url:
            "/documentos.html"
        },

        {
          nombre:
            "Búsqueda",

          url:
            "/buscar_documentos.html"
        },

        {
          nombre:
            "Proyectos",

          url:
            "/proyectos.html"
        },

        {
          nombre:
            "Asignar proyectos",

          url:
            "/asignaciones.html"
        }

      ]

    },


    Supervisor: {

      inicio:
        "/supervisor.html",

      opciones: [

        {
          nombre:
            "Revisiones",

          url:
            "/supervisor.html"
        },

        {
          nombre:
            "Subir PDF",

          url:
            "/subir_documento.html"
        },

        {
          nombre:
            "Archivo documental",

          url:
            "/documentos.html"
        },

        {
          nombre:
            "Búsqueda",

          url:
            "/buscar_documentos.html"
        },

        {
          nombre:
            "Proyectos",

          url:
            "/proyectos.html"
        }

      ]

    },


    Usuario: {

      inicio:
        "/usuario.html",

      opciones: [

        {
          nombre:
            "Inicio",

          url:
            "/usuario.html"
        },

        {
          nombre:
            "Subir PDF",

          url:
            "/subir_documento.html"
        },

        {
          nombre:
            "Archivo documental",

          url:
            "/documentos.html"
        },

        {
          nombre:
            "Búsqueda",

          url:
            "/buscar_documentos.html"
        },

        {
          nombre:
            "Proyectos",

          url:
            "/proyectos.html"
        }

      ]

    }

  };


  function rutaActual() {

    let ruta =
      window.location.pathname ||
      "/";

    if (
      ruta.endsWith("/")
    ) {

      ruta =
        ruta.slice(
          0,
          -1
        );

    }

    return ruta || "/";

  }


  function crearEnlace(
    opcion,
    actual
  ) {

    const enlace =
      document.createElement(
        "a"
      );

    enlace.href =
      opcion.url;

    enlace.textContent =
      opcion.nombre;


    if (
      actual ===
      opcion.url
    ) {

      enlace.classList.add(
        "activo"
      );

      enlace.setAttribute(
        "aria-current",
        "page"
      );

    }


    return enlace;

  }


  async function cerrar() {

    const boton =
      document.querySelector(
        ".coemsa-cerrar"
      );


    if (boton) {

      boton.disabled =
        true;

      boton.textContent =
        "Cerrando...";

    }


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


      let datos = null;


      try {

        datos =
          await respuesta.json();

      } catch {

        datos =
          null;

      }


      if (
        !respuesta.ok ||
        !datos ||
        datos.success !== true
      ) {

        throw new Error(
          "No se pudo cerrar la sesión."
        );

      }


      localStorage.removeItem(
        "usuario"
      );


      window.location.replace(
        "/login.html"
      );


    } catch (error) {

      if (boton) {

        boton.disabled =
          false;

        boton.textContent =
          "Cerrar sesión";

      }


      window.alert(
        error.message ||
        "No se pudo cerrar la sesión."
      );

    }

  }


  async function iniciar() {

    /*
      Si esta barra no puede comprobar la sesión,
      no toca la navegación antigua.
    */

    let respuesta;


    try {

      respuesta =
        await fetch(
          "/usuarios/sesion",
          {
            credentials:
              "same-origin",

            cache:
              "no-store"
          }
        );


    } catch {

      return;

    }


    if (
      respuesta.status ===
      401
    ) {

      return;

    }


    if (
      !respuesta.ok
    ) {

      return;

    }


    let datos;


    try {

      datos =
        await respuesta.json();

    } catch {

      return;

    }


    if (
      !datos ||
      datos.success !== true ||
      !datos.usuario
    ) {

      return;

    }


    const usuario =
      datos.usuario;


    const rol =
      usuario.nombre_rol;


    const perfil =
      configuracion[
        rol
      ];


    if (!perfil) {

      return;

    }


    /*
      Crear barra global
    */

    const barra =
      document.createElement(
        "nav"
      );


    barra.id =
      "coemsa-nav-global";


    barra.setAttribute(
      "aria-label",
      "Navegación principal de COEMSA"
    );


    const contenido =
      document.createElement(
        "div"
      );


    contenido.className =
      "coemsa-nav-contenido";


    /*
      Marca
    */

    const marca =
      document.createElement(
        "a"
      );


    marca.className =
      "coemsa-marca";


    marca.href =
      perfil.inicio;


    const icono =
      document.createElement(
        "span"
      );


    icono.className =
      "coemsa-marca-icono";


    icono.textContent =
      "📁";


    const nombreMarca =
      document.createElement(
        "span"
      );


    nombreMarca.textContent =
      "COEMSA";


    marca.append(
      icono,
      nombreMarca
    );


    /*
      Menú
    */

    const menu =
      document.createElement(
        "div"
      );


    menu.className =
      "coemsa-menu";


    const actual =
      rutaActual();


    for (
      const opcion
      of perfil.opciones
    ) {

      menu.appendChild(
        crearEnlace(
          opcion,
          actual
        )
      );

    }


    /*
      Cuenta
    */

    const cuenta =
      document.createElement(
        "div"
      );


    cuenta.className =
      "coemsa-cuenta";


    const usuarioTexto =
      document.createElement(
        "span"
      );


    usuarioTexto.className =
      "coemsa-usuario";


    const nombre =
      [
        usuario.nombre,
        usuario.apellido
      ]
        .filter(Boolean)
        .join(" ");


    usuarioTexto.textContent =
      nombre
        ? nombre +
          " · " +
          rol
        : rol;


    const cerrarBoton =
      document.createElement(
        "button"
      );


    cerrarBoton.type =
      "button";


    cerrarBoton.className =
      "coemsa-cerrar";


    cerrarBoton.textContent =
      "Cerrar sesión";


    cerrarBoton.addEventListener(
      "click",
      cerrar
    );


    cuenta.append(
      usuarioTexto,
      cerrarBoton
    );


    contenido.append(
      marca,
      menu,
      cuenta
    );


    barra.appendChild(
      contenido
    );


    /*
      Insertar una sola vez
    */

    if (
      !document.getElementById(
        "coemsa-nav-global"
      )
    ) {

      document.body.prepend(
        barra
      );

    }


    /*
      Solo ahora ocultamos los menús antiguos.
      Si algo falla antes, los accesos viejos siguen disponibles.
    */

    document.body.classList.add(
      "coemsa-nav-activa"
    );

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      iniciar,
      {
        once:
          true
      }
    );

  } else {

    iniciar();

  }

})();
