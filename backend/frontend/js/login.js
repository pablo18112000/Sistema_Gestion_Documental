let loginEnCurso = false;

async function login() {
  if (loginEnCurso) return;

  const campoCorreo = document.getElementById("correo");
  const campoPassword = document.getElementById("password");
  const mensaje = document.getElementById("mensaje");

  const correo = campoCorreo.value.trim();
  const password = campoPassword.value;

  mensaje.textContent = "";

  if (!correo || !password) {
    mensaje.textContent = "Ingresa tu correo y contraseña.";
    return;
  }

  loginEnCurso = true;
  mensaje.textContent = "Iniciando sesión...";

  try {
    // Usa el mismo servidor desde el que abriste la página:
    // localhost durante las pruebas y Railway al publicar.
    const respuesta = await fetch("/usuarios/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        usuario: correo,
        password
      })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.success) {
      localStorage.removeItem("usuario");
      mensaje.textContent =
        datos.mensaje || "No se pudo iniciar sesión.";
      return;
    }

    const paginas = {
      Administrador: "/admin.html",
      Supervisor: "/supervisor.html",
      Usuario: "/usuario.html"
    };

    const destino = paginas[datos.usuario?.nombre_rol];

    if (!destino) {
      mensaje.textContent =
        "Tu rol no tiene una página configurada.";
      return;
    }

    // Compatibilidad con las pantallas existentes.
    // Este dato NO autoriza operaciones en el servidor.
    localStorage.setItem(
      "usuario",
      JSON.stringify(datos.usuario)
    );

    campoPassword.value = "";
    window.location.assign(destino);
  } catch {
    mensaje.textContent =
      "No se pudo comunicar con el servidor. Inténtalo nuevamente.";
  } finally {
    loginEnCurso = false;
  }
}

// Permitir iniciar sesión con Enter desde cualquiera de los campos.
["correo", "password"].forEach((id) => {
  document.getElementById(id)?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      login();
    }
  });
});