const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const CONFIG = require('./config');
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PLUGIN_API_KEY = process.env.PLUGIN_API_KEY || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'galaxai.sqlite');

if (process.env.NODE_ENV === 'production') {
  if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (ADMIN_KEY.length < 16) throw new Error('ADMIN_KEY must be at least 16 characters in production');
  if (PLUGIN_API_KEY.length < 16) throw new Error('PLUGIN_API_KEY must be at least 16 characters in production');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 tag TEXT NOT NULL,
 date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 item_id TEXT NOT NULL,
 item_name TEXT NOT NULL,
 ig_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'รอดำเนินการ',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS xbox_links (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 gamertag TEXT NOT NULL,
 ig_name TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id, ig_name),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS players (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT UNIQUE NOT NULL,
 gamertag TEXT,
 level INTEGER,
 playtime REAL,
 balance REAL,
 updated_at TEXT NOT NULL
);
`);

// Upgrade older databases without breaking existing installs.
try { db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE xbox_links ADD COLUMN created_at TEXT NOT NULL DEFAULT ''"); } catch (_) {}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const now = () => new Date().toISOString();
const thNow = () => new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const safeUser = u => ({ id: u.id, username: u.username });
const issue = u => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET || 'dev-only-change-me', { expiresIn: '7d' });
const validName = v => /^[a-zA-Z0-9_ก-๙-]{1,32}$/.test(String(v || '').trim());

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET || 'dev-only-change-me'); next(); }
  catch { return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }); }
}
function admin(req, res, next) {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(403).json({ error: 'ไม่มีสิทธิ์แอดมิน' });
  next();
}
function plugin(req, res, next) {
  if (!PLUGIN_API_KEY || req.headers['x-plugin-key'] !== PLUGIN_API_KEY) return res.status(403).json({ error: 'API key ไม่ถูกต้อง' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'GALAXAI', time: now() }));
app.get('/api/config', (req, res) => res.json({
  serverAddress: CONFIG.serverAddress,
  serverPort: CONFIG.serverPort,
  shopCategories: CONFIG.shopCategories,
  shopItems: CONFIG.shopItems,
  events: CONFIG.events,
  staff: CONFIG.staff,
  rules: CONFIG.rules,
  faq: CONFIG.faq
}));

app.get('/api/server/status', async (req, res) => {
  try {
    const r = await fetch(`https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(CONFIG.serverAddress)}:${CONFIG.serverPort}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) throw new Error('status provider error');
    const d = await r.json();
    res.json({ online: !!d.online, players: d.players || { online: 0, max: 0 }, version: d.version || '', motd: d.motd?.clean?.[0] || '' });
  } catch {
    res.status(502).json({ error: 'ตรวจสอบสถานะเซิร์ฟเวอร์ไม่ได้' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_ก-๙-]{3,24}$/.test(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ 3–24 ตัวอักษร ใช้ตัวอักษร ตัวเลข _ หรือ -' });
  if (password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)').run(username, hash, now());
    const u = db.prepare('SELECT id,username FROM users WHERE id=?').get(info.lastInsertRowid);
    res.status(201).json({ token: issue(u), user: safeUser(u) });
  } catch { res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: issue(u), user: safeUser(u) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: { id: req.user.id, username: req.user.username } }));

app.get('/api/news', (req, res) => res.json({ news: db.prepare('SELECT id,title,body,tag,date FROM news ORDER BY id DESC').all() }));
app.post('/api/admin/news', admin, (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  const tag = ['update', 'event', 'maint'].includes(req.body.tag) ? req.body.tag : 'update';
  if (!title || !body) return res.status(400).json({ error: 'กรอกหัวข้อและรายละเอียดให้ครบ' });
  const info = db.prepare('INSERT INTO news(title,body,tag,date) VALUES(?,?,?,?)').run(title.slice(0, 160), body.slice(0, 5000), tag, thNow());
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});
app.delete('/api/admin/news/:id', admin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/orders', auth, (req, res) => {
  const item = CONFIG.shopItems.find(i => i.id === req.body.itemId);
  const ig = String(req.body.igName || '').trim();
  if (!item) return res.status(400).json({ error: 'ไม่พบไอเทม' });
  if (!validName(ig)) return res.status(400).json({ error: 'ชื่อผู้เล่นต้องยาวไม่เกิน 32 ตัวอักษรและไม่มีอักขระพิเศษ' });
  const stamp = now();
  const info = db.prepare('INSERT INTO orders(user_id,item_id,item_name,ig_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(req.user.id, item.id, item.name, ig, 'รอดำเนินการ', stamp, stamp);
  res.status(201).json({ id: info.lastInsertRowid, status: 'รอดำเนินการ' });
});
app.get('/api/orders', auth, (req, res) => res.json({
  orders: db.prepare('SELECT id,item_name AS itemName,ig_name AS igName,status,created_at AS createdAt,updated_at AS updatedAt FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id)
}));
app.get('/api/admin/orders', admin, (req, res) => res.json({
  orders: db.prepare(`SELECT o.id,o.item_id AS itemId,o.item_name AS itemName,o.ig_name AS igName,o.status,o.created_at AS createdAt,o.updated_at AS updatedAt,u.username FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200`).all()
}));
app.patch('/api/admin/orders/:id', admin, (req, res) => {
  const allowed = ['รอดำเนินการ', 'กำลังดำเนินการ', 'ส่งแล้ว', 'ยกเลิก'];
  const status = String(req.body.status || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  const info = db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status, now(), Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  res.json({ ok: true });
});

app.post('/api/account/xbox', auth, (req, res) => {
  const gamertag = String(req.body.gamertag || '').trim();
  const igName = String(req.body.igName || '').trim();
  if (!gamertag || gamertag.length > 32 || !validName(igName)) return res.status(400).json({ error: 'Gamertag หรือชื่อผู้เล่นไม่ถูกต้อง' });
  db.prepare(`INSERT INTO xbox_links(user_id,gamertag,ig_name,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,ig_name) DO UPDATE SET gamertag=excluded.gamertag,created_at=excluded.created_at`)
    .run(req.user.id, gamertag, igName, now());
  res.json({ ok: true });
});
app.get('/api/account/xbox', auth, (req, res) => res.json({ links: db.prepare('SELECT gamertag,ig_name AS igName FROM xbox_links WHERE user_id=? ORDER BY id DESC').all(req.user.id) }));

app.get('/api/players/:name', (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!validName(name)) return res.status(400).json({ error: 'ชื่อผู้เล่นไม่ถูกต้อง' });
  const p = db.prepare('SELECT name,gamertag,level,playtime,balance,updated_at AS updatedAt FROM players WHERE lower(name)=lower(?)').get(name);
  res.json({ player: p || null, source: p ? 'server' : 'none' });
});
app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare('SELECT name,playtime AS hours FROM players WHERE playtime IS NOT NULL ORDER BY playtime DESC LIMIT 20').all();
  res.json({ players: rows, source: rows.length ? 'server' : 'none' });
});

// Minecraft plugin/backend feed. POST current player stats here.
app.post('/api/plugin/player', plugin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const gamertag = req.body.gamertag == null ? null : String(req.body.gamertag).trim().slice(0, 32);
  const level = req.body.level == null ? null : Number(req.body.level);
  const playtime = req.body.playtime == null ? null : Number(req.body.playtime);
  const balance = req.body.balance == null ? null : Number(req.body.balance);
  if (!validName(name) || [level, playtime, balance].some(v => v !== null && !Number.isFinite(v))) return res.status(400).json({ error: 'ข้อมูลผู้เล่นไม่ถูกต้อง' });
  db.prepare(`INSERT INTO players(name,gamertag,level,playtime,balance,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET gamertag=excluded.gamertag,level=excluded.level,playtime=excluded.playtime,balance=excluded.balance,updated_at=excluded.updated_at`)
    .run(name, gamertag, level, playtime, balance, now());
  res.json({ ok: true });
});
app.post('/api/plugin/players', plugin, (req, res) => {
  if (!Array.isArray(req.body.players) || req.body.players.length > 1000) return res.status(400).json({ error: 'players ต้องเป็น array ไม่เกิน 1000 รายการ' });
  const upsert = db.prepare(`INSERT INTO players(name,gamertag,level,playtime,balance,updated_at) VALUES(@name,@gamertag,@level,@playtime,@balance,@updatedAt)
    ON CONFLICT(name) DO UPDATE SET gamertag=excluded.gamertag,level=excluded.level,playtime=excluded.playtime,balance=excluded.balance,updated_at=excluded.updated_at`);
  const tx = db.transaction(players => { for (const p of players) {
    const name = String(p.name || '').trim();
    if (!validName(name)) continue;
    upsert.run({ name, gamertag: p.gamertag == null ? null : String(p.gamertag).slice(0,32), level: p.level == null ? null : Number(p.level), playtime: p.playtime == null ? null : Number(p.playtime), balance: p.balance == null ? null : Number(p.balance), updatedAt: now() });
  }});
  tx(req.body.players);
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  next();
});
app.use((req, res) => res.status(404).json({ error: 'ไม่พบเส้นทางที่เรียก' }));

const server = app.listen(PORT, () => console.log(`GALAXAI backend running on port ${PORT}`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
