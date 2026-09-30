const fs = require("fs/promises");
const path = require("path");

const marca = 'id="accesos-documentales-coemsa"';

function reemplazarFrase(texto, anterior, nueva) {
  const patron = anterior
    .trim()
    .split(/\s+/)
    .map((palabra) =>
      palabra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("\\s+");

  return texto.replace(new RegExp(patron, "g"), nueva);
}

async function actualizar() {
  const nombres = [
    "admin.html",
    "usuario.html",
    "supervisor.html",
    "documentos.html"
  ];

  const preparados = [];

  // Primero prepara y valida todos los cambios.
  for (const nombre of nombres) {
    const archivo = path.join(__dirname, "frontend", nombre);
    const original = await fs.readFile(archivo, "utf8");
    let contenido = original;

    if (!/<body\b[^>]*>/i.test(contenido)) {
      throw new Error("No se encontró <body> en " + nombre);
    }

    if (!contenido.includes(marca)) {
      const enlaceAsignaciones = nombre === "admin.html"
        ? '<a href="/asignaciones.html">Asignar proyectos</a>'
        : "";

      const accesos = `
<nav
  id="accesos-documentales-coemsa"
  aria-label="Accesos de documentos"
  style="display:flex;flex-wrap:wrap;gap:18px;padding:16px 24px;background:#eaf1f7;"
>
  <a href="/subir_documento.html">Subir PDF</a>
  <a href="/documentos.html">Ver documentos</a>
  <a href="/proyectos.html">Proyectos</a>
  ${enlaceAsignaciones}
</nav>
<style>
  #accesos-documentales-coemsa a {
    color: #17324d;
    font-weight: bold;
  }

  #accesos-documentales-coemsa a:focus-visible {
    outline: 3px solid #e6a700;
    outline-offset: 3px;
  }
</style>
`;

      contenido = contenido.replace(
        /<body\b[^>]*>/i,
        (etiqueta) => etiqueta + "\n" + accesos
      );
    }

    if (nombre === "usuario.html") {
      contenido = contenido.replace(
        /<button\b[^>]*>\s*Pendiente de habilitar\s*<\/button>/gi,
        '<a class="boton" href="/subir_documento.html">Subir PDF</a>'
      );

      contenido = reemplazarFrase(
        contenido,
        "Esta función estará disponible cuando terminemos de conectar el almacenamiento de COEMSA.",
        "Sube un PDF de hasta 10 MB a una carpeta autorizada de tu área o de tus proyectos."
      );

      if (contenido.includes("Pendiente de habilitar")) {
        throw new Error(
          "El botón de usuario.html tiene un formato diferente. No se aplicaron cambios."
        );
      }
    }

    contenido = reemplazarFrase(
      contenido,
      "La subida y descarga de archivos todavía no están habilitadas.",
      "Puedes subir PDF de hasta 10 MB desde el acceso Subir PDF."
    );

    contenido = reemplazarFrase(
      contenido,
      "La subida y descarga de archivos todavía están pendientes de habilitar.",
      "Puedes subir PDF de hasta 10 MB a las carpetas donde tienes permiso."
    );

    contenido = reemplazarFrase(
      contenido,
      "La subida a Drive todavía está pendiente de habilitar.",
      "La subida de PDF a Drive está disponible desde el acceso Subir PDF."
    );

    preparados.push({ archivo, original, contenido, nombre });
  }

  // Guarda una copia local antes de modificar cada página.
  for (const elemento of preparados) {
    if (elemento.original === elemento.contenido) {
      console.log("Ya estaba actualizado:", elemento.nombre);
      continue;
    }

    const respaldo = elemento.archivo + ".antes-accesos.bak";

    try {
      await fs.writeFile(respaldo, elemento.original, {
        encoding: "utf8",
        flag: "wx"
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    await fs.writeFile(
      elemento.archivo,
      elemento.contenido,
      "utf8"
    );

    console.log("Actualizado:", elemento.nombre);
  }

  console.log("\nPaneles actualizados. No se realizó commit ni push.");
}

actualizar().catch((error) => {
  console.error("No se pudo completar:", error.message);
  process.exitCode = 1;
});