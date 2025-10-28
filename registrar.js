document.getElementById("form-registro").addEventListener("submit", async e => {
  e.preventDefault();

  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const fotoInput = document.getElementById("foto");

  // função auxiliar para enviar ao backend
  async function enviarRegistro(fotoBase64 = null) {
    try {
      const res = await fetch("/api/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, foto: fotoBase64 })
      });

      const data = await res.json();
      if (data.success) {
        alert("Registrado com sucesso!");
        window.location.href = "login.html";
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      console.error("Erro na requisição:", err);
      alert("Erro de conexão com o servidor!");
    }
  }

  // Se o usuário escolheu foto → converter para Base64
  if (fotoInput.files.length > 0) {
    const reader = new FileReader();
    reader.onload = () => {
      const fotoBase64 = reader.result; // já vem no formato data:image/png;base64,...
      enviarRegistro(fotoBase64);
    };
    reader.readAsDataURL(fotoInput.files[0]);
  } else {
    // sem foto
    enviarRegistro();
  }
});
