"use strict";

(() => {

  let creando = false;

  function normalizarModulo(valor) {
    return String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function obtenerCuentaActual() {
    try {
      if (
        typeof cuentaActual !== "undefined" &&
        cuentaActual
      ) {
        return cuentaActual;
      }
    } catch {}

    try {
      const guardado =
        localStorage.getItem("usuario");

      if (guardado) {
        return JSON.parse(guardado);
      }
    } catch {}

    return null;
  }

  function obtenerActual() {
    if (
      typeof pasos === "undefined" ||
      !Array.isArray(pasos)
    ) {
      return null;
    }

    return (
      pasos[
        pasos.length - 1
      ] ||
      null
    );
  }

  function obtenerDestino() {
    const actual =
      obtenerActual();

    if (
      !actual ||
      typeof obtenerDestinoVista !==
        "function"
    ) {
      return {
        actual,
        carpeta: null
      };
    }

    return {
      actual,
      carpeta:
        obtenerDestinoVista(
          actual
        )
    };
  }

  function perteneceServiciosProyectos(
    actual,
    carpeta
  ) {
    if (
      !actual ||
      !carpeta
    ) {
      return false;
    }

    const tiposPermitidos = [
      "seccion",
      "cliente",
      "unidad",
      "proyecto",
      "carpeta"
    ];

    if (
      !tiposPermitidos.includes(
        actual.tipo
      )
    ) {
      return false;
    }

    if (
      actual.tipo ===
        "seccion" &&
      actual.id !==
        "servicios"
    ) {
      return false;
    }

    /*
     * Todo proyecto se presenta dentro de
     * Servicios y Proyectos, incluso si un
     * registro histórico conserva otra área.
     */
    if (
      carpeta.id_proyecto !==
      null
    ) {
      return true;
    }

    if (
      Number(
        carpeta.id_area
      ) !== 2
    ) {
      return false;
    }

    try {
      return Boolean(
        serviciosDocumentales &&
        serviciosDocumentales.id_servicio !=
          null &&
        Number(
          carpeta.id_servicio
        ) ===
        Number(
          serviciosDocumentales.id_servicio
        )
      );
    } catch {
      return false;
    }
  }

  function tienePermiso(
    carpeta
  ) {
    const usuario =
      obtenerCuentaActual();

    if (
      !usuario ||
      !carpeta
    ) {
      return false;
    }

    if (
      usuario.nombre_rol ===
      "Administrador"
    ) {
      return true;
    }

    if (
      usuario.nombre_rol !==
        "Supervisor" ||
      Number(
        usuario.id_area
      ) !== 2
    ) {
      return false;
    }

    if (
      carpeta.id_proyecto ===
      null
    ) {
      return true;
    }

    try {
      const raizProyecto =
        carpetas.find(
          (item) =>
            String(
              item.id_proyecto
            ) ===
              String(
                carpeta.id_proyecto
              ) &&
            item.id_carpeta_padre ===
              null
        );

      return Boolean(
        raizProyecto &&
        raizProyecto.puede_subir ===
          true
      );
    } catch {
      return false;
    }
  }

  function yaExisteCrearCarpeta() {
    const contenedor =
      document.getElementById(
        "carpetas"
      );

    if (!contenedor) {
      return true;
    }

    const tarjetas =
      contenedor.querySelectorAll(
        ".carpeta"
      );

    for (
      const tarjeta
      of tarjetas
    ) {
      const titulo =
        tarjeta.querySelector(
          ".nombre"
        );

      if (!titulo) {
        continue;
      }

      const texto =
        normalizarModulo(
          titulo.textContent
        )
          .replace(
            /^\+\s*/,
            ""
          );

      if (
        texto ===
        "crear carpeta"
      ) {
        return true;
      }
    }

    return false;
  }

  function inyectarEstilos() {
    if (
      document.getElementById(
        "estilos-carpetas-servicios-proyectos"
      )
    ) {
      return;
    }

    const estilo =
      document.createElement(
        "style"
      );

    estilo.id =
      "estilos-carpetas-servicios-proyectos";

    estilo.textContent = `
      .coemsa-crear-carpeta-servicios {
        background: #ffffff;
        border: 1px dashed #7f9db5;
        cursor: default;
      }

      .coemsa-crear-carpeta-servicios:hover {
        background: #ffffff;
      }

      .coemsa-crear-carpeta-servicios input {
        display: block;
        width: 100%;
        margin-top: 14px;
        padding: 11px 12px;
        border: 1px solid #b9cbd9;
        border-radius: 8px;
        background: #ffffff;
        color: #173454;
        font: inherit;
      }

      .coemsa-crear-carpeta-servicios button {
        display: block;
        width: 100%;
        margin-top: 12px;
        padding: 11px 14px;
        border: 0;
        border-radius: 8px;
        background: #245b83;
        color: white;
        font: inherit;
        font-weight: bold;
        cursor: pointer;
      }

      .coemsa-crear-carpeta-servicios button:hover {
        background: #194565;
      }

      .coemsa-crear-carpeta-servicios button:disabled,
      .coemsa-crear-carpeta-servicios input:disabled {
        opacity: .6;
        cursor: not-allowed;
      }

      .coemsa-crear-carpeta-servicios-mensaje {
        display: block;
        min-height: 20px;
        margin-top: 10px;
        color: #526577;
        font-size: 13px;
        line-height: 1.4;
      }
    `;

    document.head.appendChild(
      estilo
    );
  }

  async function crearSubcarpeta(
    carpetaPadre,
    campo,
    boton,
    mensaje
  ) {
    if (creando) {
      return;
    }

    const nombre =
      String(
        campo.value || ""
      )
        .trim()
        .replace(
          /\s+/g,
          " "
        );

    if (
      !nombre ||
      [...nombre].length > 100 ||
      /[\\/\u0000-\u001f]/.test(
        nombre
      ) ||
      nombre === "." ||
      nombre === ".."
    ) {
      mensaje.textContent =
        "Escribe un nombre válido de hasta 100 caracteres.";

      campo.focus();
      return;
    }

    if (
      normalizarModulo(
        nombre
      ) === "otros"
    ) {
      mensaje.textContent =
        "Escribe un nombre específico en lugar de Otros.";

      campo.focus();
      return;
    }

    creando = true;

    campo.disabled = true;
    boton.disabled = true;

    mensaje.textContent =
      "Creando carpeta...";

    const rutaAnterior =
      typeof pasos !== "undefined"
        ? pasos.map(
            (paso) => ({
              ...paso
            })
          )
        : [];

    try {
      const respuesta =
        await fetch(
          "/carpetas-servicios-proyectos/" +
          encodeURIComponent(
            carpetaPadre.id_carpeta
          ),
          {
            method:
              "POST",

            credentials:
              "same-origin",

            cache:
              "no-store",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                nombre_carpeta:
                  nombre
              })
          }
        );

      if (
        respuesta.status ===
        401
      ) {
        window.location.replace(
          "/login.html"
        );

        return;
      }

      let datos;

      try {
        datos =
          await respuesta.json();
      } catch {
        throw new Error(
          "El servidor no devolvió una respuesta válida."
        );
      }

      if (
        !respuesta.ok ||
        datos.success !== true
      ) {
        throw new Error(
          datos.mensaje ||
          "No se pudo crear la carpeta."
        );
      }

      if (
        typeof cargar ===
        "function"
      ) {
        await cargar();
      }

      if (
        typeof pasos !==
        "undefined"
      ) {
        pasos =
          rutaAnterior;
      }

      if (
        typeof dibujar ===
        "function"
      ) {
        dibujar();
      }

      const mensajeGeneral =
        document.getElementById(
          "mensaje"
        );

      if (mensajeGeneral) {
        mensajeGeneral.textContent =
          "Carpeta \"" +
          nombre +
          "\" creada correctamente.";
      }

    } catch (error) {
      mensaje.textContent =
        error.message ||
        "No se pudo crear la carpeta.";

      campo.disabled =
        false;

      boton.disabled =
        false;

      campo.focus();

    } finally {
      creando = false;
    }
  }

  function construirTarjeta(
    actual,
    carpeta
  ) {
    const contenedor =
      document.getElementById(
        "carpetas"
      );

    if (!contenedor) {
      return;
    }

    const tarjeta =
      document.createElement(
        "div"
      );

    tarjeta.className =
      "carpeta coemsa-crear-carpeta-servicios";

    tarjeta.dataset.crearCarpeta =
      "servicios-proyectos";

    const icono =
      document.createElement(
        "span"
      );

    icono.className =
      "icono";

    icono.textContent =
      "➕";

    icono.setAttribute(
      "aria-hidden",
      "true"
    );

    const titulo =
      document.createElement(
        "span"
      );

    titulo.className =
      "nombre";

    titulo.textContent =
      "Crear carpeta";

    const detalle =
      document.createElement(
        "span"
      );

    detalle.className =
      "detalle";

    detalle.textContent =
      "Crear una carpeta dentro de " +
      (
        actual?.nombre ||
        carpeta.nombre_carpeta
      );

    const formulario =
      document.createElement(
        "form"
      );

    formulario.autocomplete =
      "off";

    const campo =
      document.createElement(
        "input"
      );

    campo.type =
      "text";

    campo.maxLength =
      100;

    campo.placeholder =
      "Nombre de la carpeta";

    campo.setAttribute(
      "aria-label",
      "Nombre de la nueva carpeta"
    );

    const boton =
      document.createElement(
        "button"
      );

    boton.type =
      "submit";

    boton.textContent =
      "Crear carpeta";

    const mensaje =
      document.createElement(
        "span"
      );

    mensaje.className =
      "coemsa-crear-carpeta-servicios-mensaje";

    mensaje.setAttribute(
      "role",
      "status"
    );

    mensaje.setAttribute(
      "aria-live",
      "polite"
    );

    formulario.append(
      campo,
      boton,
      mensaje
    );

    formulario.addEventListener(
      "submit",
      async (evento) => {
        evento.preventDefault();

        await crearSubcarpeta(
          carpeta,
          campo,
          boton,
          mensaje
        );
      }
    );

    tarjeta.append(
      icono,
      titulo,
      detalle,
      formulario
    );

    contenedor.appendChild(
      tarjeta
    );
  }

  function agregarCrearCarpeta() {
    const {
      actual,
      carpeta
    } = obtenerDestino();

    if (
      !perteneceServiciosProyectos(
        actual,
        carpeta
      )
    ) {
      return;
    }

    if (
      !tienePermiso(
        carpeta
      )
    ) {
      return;
    }

    if (
      yaExisteCrearCarpeta()
    ) {
      return;
    }

    construirTarjeta(
      actual,
      carpeta
    );
  }

  function activar() {
    inyectarEstilos();

    if (
      typeof dibujar !==
      "function"
    ) {
      console.error(
        "No se encontró la función dibujar de documentos.html."
      );

      return;
    }

    const dibujarOriginal =
      dibujar;

    dibujar =
      function (...argumentos) {
        const resultado =
          dibujarOriginal.apply(
            this,
            argumentos
          );

        queueMicrotask(
          agregarCrearCarpeta
        );

        return resultado;
      };

    queueMicrotask(
      agregarCrearCarpeta
    );
  }

  activar();

})();
