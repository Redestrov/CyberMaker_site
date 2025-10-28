import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
//import connect from "conection.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // allow image uploads as base64

// Read DB config from environment variables for deployment platforms
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "ooTphHt42wy49L1ywfRU";
const DB_NAME = process.env.DB_NAME || "CyberMaker";
const PORT = process.env.PORT || 3306;

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Serve static frontend (the site files)
app.use(express.static(path.join(__dirname)));

app.get("/api/ping", (req,res)=>res.json({ok:true}));

// Register user
app.post("/api/registrar", async (req, res) => {
  try {
    const { nome, email, senha, foto } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ success:false, error: "Faltando campos" });

    const [rows] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0) return res.status(400).json({ success:false, error: "Email já cadastrado" });

    const hash = await bcrypt.hash(senha, 10);
    const fotoVal = foto || null;
    const [result] = await pool.query(
      "INSERT INTO usuarios (nome, email, senha, foto, pontos, online) VALUES (?, ?, ?, ?, 0, FALSE)",
      [nome, email, hash, fotoVal]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, error: "Erro interno" });
  }
});

// Login
app.post("/api/login", async (req,res) => {
  try{
    const { email, senha } = req.body;
    if(!email || !senha) return res.status(400).json({ success:false, error:"Faltando campos" });

    const [rows] = await pool.query("SELECT id, nome, email, senha, foto, pontos FROM usuarios WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(400).json({ success:false, error:"Usuário não encontrado" });

    const user = rows[0];
    const match = await bcrypt.compare(senha, user.senha);
    if (!match) return res.status(401).json({ success:false, error:"Senha incorreta" });

    // remove senha before sending
    delete user.senha;
    res.json({ success:true, usuario: user });
  } catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

// Mark online
app.post("/api/usuarios/online", async (req,res) => {
  try{
    const { usuario_id } = req.body;
    if (!usuario_id) return res.status(400).json({ success:false, error:"ID ausente" });
    await pool.query("UPDATE usuarios SET online = TRUE WHERE id = ?", [usuario_id]);
    res.json({ success:true });
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

// Mark offline
app.post("/api/usuarios/offline", async (req,res) => {
  try{
    const { usuario_id } = req.body;
    if (!usuario_id) return res.status(400).json({ success:false, error:"ID ausente" });
    await pool.query("UPDATE usuarios SET online = FALSE WHERE id = ?", [usuario_id]);
    res.json({ success:true });
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

// Ranking
app.get("/api/ranking", async (req,res) => {
  try{
    const [rows] = await pool.query("SELECT id, nome, pontos, online, foto FROM usuarios ORDER BY pontos DESC LIMIT 100");
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

// Ideas (diário / arena) - basic CRUD
app.get("/api/ideias", async (req,res) => {
  try{
    const [rows] = await pool.query("SELECT * FROM ideias ORDER BY id DESC LIMIT 200");
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

app.get("/api/ideias/:usuario_id", async (req,res) => {
  try{
    const usuario_id = req.params.usuario_id;
    const [rows] = await pool.query("SELECT * FROM ideias WHERE usuario_id = ? ORDER BY id DESC", [usuario_id]);
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

app.post("/api/ideias", async (req,res) => {
  try{
    const { usuario_id, titulo, texto } = req.body;
    if(!usuario_id || !titulo) return res.status(400).json({ success:false, error:"Faltando campos" });
    const [result] = await pool.query("INSERT INTO ideias (usuario_id, titulo, texto, created_at) VALUES (?, ?, ?, NOW())", [usuario_id, titulo, texto || ""]);
    res.json({ success:true, id: result.insertId });
  }catch(err){
    console.error(err);
    res.status(500).json({ success:false, error:"Erro interno" });
  }
});

// Fallback to index.html for SPA routes
app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, ()=> {
  console.log("Server running on port", PORT);
});
