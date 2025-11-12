import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Pasta de uploads
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer (usar memória para editar / salvar)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexão com banco
let pool;
if (process.env.DB_POST) {
  const dbUrl = new URL(process.env.DB_POST);
  pool = mysql.createPool({
    host: dbUrl.hostname,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.replace("/", ""),
    port: Number(dbUrl.port) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
  });
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "Automata",
    database: process.env.DB_NAME || "CyberMaker",
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

// Servir arquivos estáticos
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadDir));


// ===============================
// ✅ Registro (com foto de perfil)
// ===============================
app.post("https://cybermakersite-production.up.railway.app/api/registrar", upload.single("foto"), async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha)
      return res.status(400).json({ success: false, error: "Faltando campos" });

    const [rows] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0)
      return res.status(400).json({ success: false, error: "Email já cadastrado" });

    const hash = await bcrypt.hash(senha, 10);

    let fotoPath = null;
    if (req.file) {
      const nomeArquivo = `user_${Date.now()}.jpg`;
      const destino = path.join(uploadDir, nomeArquivo);

      await sharp(req.file.buffer)
        .resize(256, 256, { fit: "cover" })
        .jpeg({ quality: 70 })
        .toFile(destino);

      fotoPath = `/uploads/${nomeArquivo}`;
    }

    await pool.query(
      "INSERT INTO usuarios (nome, email, senha, foto, pontos, online) VALUES (?, ?, ?, ?, 0, FALSE)",
      [nome, email, hash, fotoPath]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no registro:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});


// ===============================
// ✅ Login
// ===============================
app.post("https://cybermakersite-production.up.railway.app/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    const [rows] = await pool.query(
      "SELECT id, nome, email, senha, foto, pontos FROM usuarios WHERE email = ?",
      [email]
    );

    if (rows.length === 0)
      return res.status(400).json({ success: false, error: "Usuário não encontrado" });

    const user = rows[0];
    const ok = await bcrypt.compare(senha, user.senha);

    if (!ok)
      return res.status(401).json({ success: false, error: "Senha incorreta" });

    delete user.senha;
    res.json({ success: true, usuario: user });

  } catch (err) {
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});


// ===============================
// ✅ Salvar IDEIA com IMAGEM
// ===============================
app.post("https://cybermakersite-production.up.railway.app/api/ideias", upload.single("imagem"), async (req, res) => {
  try {
    const { usuario_id, titulo, categoria, descricao } = req.body;

    let imagemPath = null;
    if (req.file) {
      const nomeArquivo = `ideia_${Date.now()}.jpg`;
      const destino = path.join(uploadDir, nomeArquivo);

      await sharp(req.file.buffer)
        .resize(600, 600, { fit: "cover" })
        .jpeg({ quality: 70 })
        .toFile(destino);

      imagemPath = `/uploads/${nomeArquivo}`;
    }

    await pool.query(
      "INSERT INTO ideias (usuario_id, titulo, categoria, descricao, imagem) VALUES (?, ?, ?, ?, ?)",
      [usuario_id, titulo, categoria, descricao, imagemPath]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao salvar ideia:", err);
    res.status(500).json({ success: false, error: "Erro ao salvar ideia" });
  }
});

app.post("/api/conclusoes", async (req, res) => {
  try {
    const { id, video, imagens, descricao } = req.body;

    if (!ideia_id || !video || !imagens || !descricao) {
      return res.json({ success: false, error: "Campos incompletos." });
    }

    await pool.query(
      "INSERT INTO conclusoes (ideia, video, imagem, `descrição`, data) VALUES (?, ?, ?, ?, NOW())",
      [ideia_id, video, imagens, descricao]
    );

    await pool.query(
      `UPDATE usuarios u 
       JOIN ideias i ON u.id = i.usuario_id 
       SET u.pontos = u.pontos + 30 
       WHERE i.id = ?`,
      [ideia_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao salvar conclusão:", err);
    res.json({ success: false, error: "Erro no servidor." });
  }
});



// ===============================
// 🌿 COMUNIDADE (POSTS tipo Reddit)
// ===============================

// Criar post (com imagem opcional)
app.post("cybermakersite-production.up.railway.app/api/comunidade", upload.single("imagem"), async (req, res) => {
  try {
    const { usuario_id, titulo, texto } = req.body;

    if (!usuario_id || !titulo || !texto)
      return res.json({ success: false, error: "Campos incompletos" });

    let imagemBase64 = null;

    if (req.file) {
      const buffer = await sharp(req.file.buffer)
        .resize({ width: 800 })
        .jpeg({ quality: 65 })
        .toBuffer();

      imagemBase64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    }

    await pool.query(
      "INSERT INTO comunidade_posts (usuario_id, titulo, texto, imagem) VALUES (?, ?, ?, ?)",
      [usuario_id, titulo, texto, imagemBase64]
    );

    // +10 pontos automaticamente ao postar 🎁
    await pool.query(
      "UPDATE usuarios SET pontos = pontos + 10 WHERE id = ?",
      [usuario_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Erro ao postar:", err);
    res.json({ success: false, error: "Erro interno" });
  }
});

// Listar posts (mais recentes primeiro)
app.get("cybermakersite-production.up.railway.app/api/comunidade", async (req, res) => {
  try {
    const [posts] = await pool.query(
      `SELECT comunidade_posts.*, usuarios.nome, usuarios.foto
       FROM comunidade_posts
       JOIN usuarios ON comunidade_posts.usuario_id = usuarios.id
       ORDER BY comunidade_posts.data_criacao DESC`
    );
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// ===============================
// ✅ Ranking
// ===============================
app.get("https://cybermakersite-production.up.railway.app/api/ranking", async (req, res) => {
  try {
    const [results] = await pool.query(
      "SELECT id, nome, foto, pontos, online FROM usuarios ORDER BY pontos DESC"
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar ranking" });
  }
});

app.post("https://cybermakersite-production.up.railway.app/api/ranking/pontos", async (req, res) => {
  const { usuario_id, pontos } = req.body;
  await pool.query("UPDATE usuarios SET pontos = ? WHERE id = ?", [pontos, usuario_id]);
  res.json({ success: true });
});


// ===============================
// Fallback SPA
// ===============================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === COMUNIDADE: POSTAR ===
app.post("cybermakersite-production.up.railway.app/api/comunidade", async (req, res) => {
  try {
    const { usuario_id, titulo, texto, imagem } = req.body;

    if (!usuario_id || !titulo || !texto) {
      return res.json({ success: false, error: "Dados incompletos." });
    }

    await db.query(
      "INSERT INTO comunidade_posts (usuario_id, titulo, texto, imagem) VALUES (?, ?, ?, ?)",
      [usuario_id, titulo, texto, imagem || null]
    );

    // +10 pontos ao postar
    await db.query("UPDATE usuarios SET pontos = pontos + 10 WHERE id = ?", [usuario_id]);

    res.json({ success: true });
  } catch (err) {
    console.error("ERR POSTAR COMUNIDADE:", err);
    res.json({ success: false, error: "Erro interno." });
  }
});

// === COMUNIDADE: CARREGAR FEED ===
app.get("cybermakersite-production.up.railway.app/api/comunidade", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.titulo, p.texto, p.imagem, p.data_criacao,
             u.nome AS autor_nome, u.foto AS autor_foto
      FROM comunidade_posts p
      JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.data_criacao DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("ERR FEED COMUNIDADE:", err);
    res.json({ success: false, error: "Erro interno." });
  }
});

// ===============================
// Iniciar Servidor
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✨ Servidor online na porta ${PORT}!`));
