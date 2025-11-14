import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Health route para Railway
app.get("/", (req, res) => res.send("OK"));
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// ================================
// 🔧 Configuração do Banco de Dados
// ================================
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
      port: Number(dbUrl.port) || 3306,
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
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// ================================
// 🚀 Porta do servidor HTTP
// ================================
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

// ================================
// 👤 Registro de Usuário
// ================================
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
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ================================
// 🔐 Login
// ================================
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
    console.error(err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ================================
// ⚙️ Conclusões de Projetos (tabela: conclusoes)
// ================================
app.post("/api/conclusoes", async (req, res) => {
  try {
    const { ideia, video, imagem, descricao } = req.body;

    if (!ideia || !video || !descricao)
      return res.status(400).json({ success: false, error: "Campos obrigatórios faltando" });

    // Cria a tabela se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conclusoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ideia VARCHAR(255) NOT NULL,
        video VARCHAR(255),
        imagem TEXT,
        descricao TEXT,
        data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const [result] = await pool.query(
      "INSERT INTO conclusoes (ideia, video, imagem, descricao) VALUES (?, ?, ?, ?)",
      [ideia, video, imagem, descricao]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Erro ao salvar conclusão:", err);
    res.status(500).json({ success: false, error: "Erro interno ao salvar conclusão" });
  }
});

// 📤 Listar conclusões
app.get("/api/conclusoes", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM conclusoes ORDER BY data DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Erro ao buscar conclusões:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ================================
// 🌐 Rota final
// ================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
