import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Health route for Railway
app.get("/", (req, res) => res.send("OK"));

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Permite upload de imagens em base64

// ============================
// 🔧 CONFIGURAÇÃO DO BANCO
// ============================

let pool;

if (process.env.DB_POST) {
  console.log("🌍 Usando variável DB_POST para conexão ao banco do Railway!");
  try {
    const dbUrl = new URL(process.env.DB_POST);
    pool = mysql.createPool({
      host: dbUrl.hostname,
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbUrl.pathname.replace("/", ""),
      port: Number(dbUrl.port) || 51980,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  } catch (err) {
    console.error("❌ Erro ao interpretar DB_POST:", err);
  }
} else {
  console.log("💻 Usando variáveis locais para conexão ao banco!");
  const DB_HOST = process.env.DB_HOST || "localhost";
  const DB_USER = process.env.DB_USER || "root";
  const DB_PASSWORD = process.env.DB_PASSWORD || "Automata";
  const DB_NAME = process.env.DB_NAME || "CyberMaker";

  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: 51980,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// ============================
// 🚀 CONFIGURAÇÃO DO SERVIDOR
// ============================

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

app.get("/api/ping", (req, res) => res.json({ ok: true }));

// ============================
// 👤 USUÁRIOS
// ============================

// Registrar
app.post("/api/registrar", async (req, res) => {
  try {
    const { nome, email, senha, foto } = req.body;
    if (!nome || !email || !senha)
      return res.status(400).json({ success: false, error: "Faltando campos" });

    const [rows] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0)
      return res.status(400).json({ success: false, error: "Email já cadastrado" });

    const hash = await bcrypt.hash(senha, 10);
    const fotoVal = foto || null;

    const [result] = await pool.query(
      "INSERT INTO usuarios (nome, email, senha, foto, pontos, online) VALUES (?, ?, ?, ?, 0, FALSE)",
      [nome, email, hash, fotoVal]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Erro ao registrar usuário:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha)
      return res.status(400).json({ success: false, error: "Faltando campos" });

    const [rows] = await pool.query(
      "SELECT id, nome, email, senha, foto, pontos FROM usuarios WHERE email = ?",
      [email]
    );

    if (rows.length === 0)
      return res.status(400).json({ success: false, error: "Usuário não encontrado" });

    const user = rows[0];
    const match = await bcrypt.compare(senha, user.senha);
    if (!match)
      return res.status(401).json({ success: false, error: "Senha incorreta" });

    delete user.senha;
    res.json({ success: true, usuario: user });
  } catch (err) {
    console.error("❌ Erro no login:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// Marcar online/offline
app.post("/api/usuarios/online", async (req, res) => {
  try {
    const { usuario_id } = req.body;
    if (!usuario_id)
      return res.status(400).json({ success: false, error: "ID ausente" });
    await pool.query("UPDATE usuarios SET online = TRUE WHERE id = ?", [usuario_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

app.post("/api/usuarios/offline", async (req, res) => {
  try {
    const { usuario_id } = req.body;
    if (!usuario_id)
      return res.status(400).json({ success: false, error: "ID ausente" });
    await pool.query("UPDATE usuarios SET online = FALSE WHERE id = ?", [usuario_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// Ranking
app.get("/api/ranking", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, pontos, online, foto FROM usuarios ORDER BY pontos DESC LIMIT 100"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ============================
// 💡 IDEIAS (DIÁRIO / ARENA)
// ============================

app.get("/api/ideias", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM ideias ORDER BY id DESC LIMIT 200");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

app.get("/api/ideias/:usuario_id", async (req, res) => {
  try {
    const usuario_id = req.params.usuario_id;
    const [rows] = await pool.query(
      "SELECT * FROM ideias WHERE usuario_id = ? ORDER BY id DESC",
      [usuario_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

app.post("/api/ideias", async (req, res) => {
  try {
    const { usuario_id, titulo, texto } = req.body;
    if (!usuario_id || !titulo)
      return res.status(400).json({ success: false, error: "Faltando campos" });

    const [result] = await pool.query(
      "INSERT INTO ideias (usuario_id, titulo, texto, created_at) VALUES (?, ?, ?, NOW())",
      [usuario_id, titulo, texto || ""]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Erro ao criar ideia:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ============================
// ⚔️ CONCLUSÕES (ARENA)
// ============================

// Criar uma nova conclusão
app.post("/api/conclusoes", async (req, res) => {
  try {
    const { ideia_id, video, imagens, descricao } = req.body;

    if (!ideia_id || !video || !descricao)
      return res.status(400).json({ success: false, error: "Campos obrigatórios faltando" });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conclusoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ideia_id INT NOT NULL,
        video VARCHAR(255),
        imagens TEXT,
        descricao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ideia_id) REFERENCES ideias(id)
      )
    `);

    const [result] = await pool.query(
      "INSERT INTO conclusoes (ideia_id, video, imagens, descricao, created_at) VALUES (?, ?, ?, ?, NOW())",
      [ideia_id, video, JSON.stringify(imagens || []), descricao]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Erro ao inserir conclusão:", err);
    res.status(500).json({ success: false, error: "Erro interno do servidor" });
  }
});

// Listar todas as conclusões
app.get("/api/conclusoes", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, i.titulo AS titulo_ideia, u.nome AS autor
      FROM conclusoes c
      JOIN ideias i ON c.ideia_id = i.id
      JOIN usuarios u ON i.usuario_id = u.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ Erro ao buscar conclusões:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// Listar conclusões de uma ideia
app.get("/api/conclusoes/:ideia_id", async (req, res) => {
  try {
    const { ideia_id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM conclusoes WHERE ideia_id = ? ORDER BY created_at DESC",
      [ideia_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Erro ao buscar conclusões da ideia:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ============================
// 🏁 Fallback
// ============================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
