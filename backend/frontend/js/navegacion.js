"use strict";

(function () {

  const configuracion = {

    Administrador: {
      inicio: "/admin.html",

      opciones: [
        {
          nombre: "Usuarios",
          url: "/admin.html"
        },
        {
          nombre: "Subir PDF",
          url: "/subir_documento.html"
        },
        {
          nombre: "Archivo documental",
          url: "/documentos.html"
        },
        {
          nombre: "Búsqueda",
          url: "/buscar_documentos.html"
        },
        {
          nombre: "Crear proyecto",
          url: "/proyectos.html"
        },
        {
          nombre: "Asignar proyectos",
          url: "/asignaciones.html"
        }
      ]
    },


    Supervisor: {
      inicio: "/supervisor.html",

      opciones: [
        {
          nombre: "Revisiones",
          url: "/supervisor.html"
        },
        {
          nombre: "Subir PDF",
          url: "/subir_documento.html"
        },
        {
          nombre: "Archivo documental",
          url: "/documentos.html"
        },
        {
          nombre: "Búsqueda",
          url: "/buscar_documentos.html"
        },
        {
          nombre: "Crear proyecto",
          url: "/proyectos.html"
        }
      ]
    },


    Usuario: {
      inicio: "/usuario.html",

      opciones: [
        {
          nombre: "Inicio",
          url: "/usuario.html"
        },
        {
          nombre: "Subir PDF",
          url: "/subir_documento.html"
        },
        {
          nombre: "Archivo documental",
          url: "/documentos.html"
        },
        {
          nombre: "Búsqueda",
          url: "/buscar_documentos.html"
        },
        {
          nombre: "Proyectos",
          url: "/proyectos.html"
        }
      ]
    }

  };


  function rutaActual() {

    let ruta =
      window.location.pathname || "/";


    if (
      ruta.length > 1 &&
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


  function usuarioGuardado() {

    try {

      const texto =
        localStorage.getItem(
          "usuario"
        );


      if (!texto) {
        return null;
      }


      const usuario =
        JSON.parse(
          texto
        );


      if (
        !usuario ||
        !configuracion[
          usuario.nombre_rol
        ]
      ) {

        return null;
      }


      return usuario;


    } catch {

      return null;
    }
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
            method: "POST",
            credentials: "same-origin",
            cache: "no-store"
          }
        );


      const datos =
        await respuesta.json();


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


  function construirBarra(
    usuario
  ) {

    if (
      !usuario ||
      !usuario.nombre_rol
    ) {

      return;
    }


    const rol =
      usuario.nombre_rol;


    const perfil =
      configuracion[
        rol
      ];


    if (!perfil) {
      return;
    }


    const existente =
      document.getElementById(
        "coemsa-nav-global"
      );


    if (existente) {
      existente.remove();
    }


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

      // Crear proyecto corresponde únicamente
      // a Servicios y Proyectos.
      if (
        rol === "Supervisor" &&
        opcion.url === "/proyectos.html" &&
        Number(usuario.id_area) !== 2
      ) {
        continue;
      }

      menu.appendChild(
        crearEnlace(
          opcion,
          actual
        )
      );
    }


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
     * El script ahora está justo después de <body>.
     * Por eso la barra aparece antes que el resto
     * de la página.
     */

    document.body.prepend(
      barra
    );


    document.body.classList.add(
      "coemsa-nav-activa"
    );
  }


  /*
   * PRIMERA CARGA:
   * usar inmediatamente el usuario que ya estaba
   * validado en la página anterior.
   */

  const guardado =
    usuarioGuardado();


  if (guardado) {

    construirBarra(
      guardado
    );
  }


  /*
   * SEGUNDA COMPROBACIÓN:
   * al terminar de cargar la página validamos
   * contra el servidor.
   */

  async function validar() {

    if (
      typeof verificarSesion !==
      "function"
    ) {

      return;
    }


    const usuario =
      await verificarSesion();


    if (!usuario) {
      return;
    }


    const actualGuardado =
      usuarioGuardado();


    /*
     * Solo reconstruir si la cuenta cambió.
     * Así evitamos un segundo parpadeo.
     */

    if (
      !actualGuardado ||
      String(
        actualGuardado.id_usuario
      ) !==
        String(
          usuario.id_usuario
        ) ||
      actualGuardado.nombre_rol !==
        usuario.nombre_rol
    ) {

      construirBarra(
        usuario
      );

      return;
    }


    /*
     * Si es la misma cuenta pero por algún motivo
     * no existe la barra, la volvemos a crear.
     */

    if (
      !document.getElementById(
        "coemsa-nav-global"
      )
    ) {

      construirBarra(
        usuario
      );
    }
  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      validar,
      {
        once: true
      }
    );

  } else {

    validar();
  }

})();
