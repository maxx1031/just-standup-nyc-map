// 零依赖小服务器：把整个文件夹当静态网站，接收手机传来的 CSV，并记住连过来的手机。
// 用法：node server.js   → 玩家页 /motion/play.html，开发页 /motion/motion-lab.html
// 已知设备：GET /devices
// 实时：手机每 100ms POST /push?id=XXXX（传感器帧 + 事件），电脑页面用 GET /stream?id=XXXX（SSE）实时收。
//      选 SSE + POST 而不是 WebSocket，是为了继续零依赖；同一条链路以后给大屏用。
// 手机上要 https，另开一个终端跑：cloudflared tunnel --url http://localhost:5190
const http = require('http'), fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = __dirname, PORT = 5190, CSV_DIR = path.join(ROOT, 'motion', 'csv');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.csv': 'text/csv' };
let count = 0;
const DEV_FILE = path.join(ROOT, 'motion', 'devices.json');
const devices = fs.existsSync(DEV_FILE) ? JSON.parse(fs.readFileSync(DEV_FILE, 'utf8')) : {};
// 公网地址：启动时可用 PUBLIC_URL 指定；之后谁从 trycloudflare 隧道进来，就记住那个域名（隧道重开换域名也能跟上）
let publicUrl = process.env.PUBLIC_URL || '';
const live = {}, subs = new Set();   // 每台手机最近一次界面状态；正在看的电脑页面
const readJSON = (req, cb) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { cb(JSON.parse(b)); } catch (e) { cb(null); } }); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const host = req.headers.host || '';
  if (/\.trycloudflare\.com$/.test(host)) publicUrl = 'https://' + host;
  if (url.pathname === '/public') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ url: publicUrl ? publicUrl + '/motion/play.html' : '' }));
  }
  if (url.pathname === '/qr.svg') {   // 玩家页二维码（用 brew 装的 qrencode 生成）
    if (!publicUrl) { res.writeHead(404); return res.end(); }
    return execFile(fs.existsSync('/opt/homebrew/bin/qrencode') ? '/opt/homebrew/bin/qrencode' : 'qrencode', ['-t', 'SVG', '-m', '1', '-o', '-', publicUrl + '/motion/play.html'], (err, out) => {
      if (err) { res.writeHead(500); return res.end(String(err)); }
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }); res.end(out);
    });
  }
  if (req.method === 'POST' && url.pathname === '/csv') {
    const name = (url.searchParams.get('name') || 'motion.csv').replace(/[^\w.-]/g, '_');
    let body = '';
    req.on('data', d => { body += d; if (body.length > 20e6) req.destroy(); });
    req.on('end', () => {
      fs.mkdirSync(CSV_DIR, { recursive: true });
      fs.writeFileSync(path.join(CSV_DIR, name), body);
      count++;
      console.log(`[${new Date().toLocaleTimeString()}] 收到第 ${count} 段：${name}（${body.split('\n').length - 2} 行）`);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, n: count }));
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/hello') {
    return readJSON(req, d => {
      if (!d || !/^[A-Z0-9]{4}$/.test(d.id)) { res.writeHead(400); return res.end(); }
      const old = devices[d.id];
      devices[d.id] = { id: d.id, name: String(d.name || '').slice(0, 24), page: String(d.page || '').slice(0, 20),
        ua: String(d.ua || '').slice(0, 160), last: new Date().toISOString() };
      if (!old || old.name !== devices[d.id].name)
        console.log(`[${new Date().toLocaleTimeString()}] 📱 ${old ? '改名' : '新设备'}：${devices[d.id].name} · ${d.id}（${devices[d.id].page}）`);
      fs.writeFileSync(DEV_FILE, JSON.stringify(devices, null, 2));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
  }
  if (req.method === 'POST' && url.pathname === '/push') {
    const id = url.searchParams.get('id') || '';
    return readJSON(req, d => {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      if (!d || !/^[A-Z0-9]{4}$/.test(id)) return;
      if (devices[id]) devices[id].last = new Date().toISOString();
      const L = live[id] || (live[id] = { state: null });
      (d.events || []).forEach(e => { if (e.type === 'state') L.state = e; });
      const msg = 'data: ' + JSON.stringify({ id, at: Date.now(), ...d }) + '\n\n';
      [...subs].forEach(c => { if (c.id === id || c.id === '*') c.res.write(msg); });
    });
  }
  if (url.pathname === '/stream') {
    const id = url.searchParams.get('id') || '*';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    if (live[id] && live[id].state) res.write('data: ' + JSON.stringify({ id, at: Date.now(), frames: [], events: [live[id].state] }) + '\n\n');
    const c = { id, res }; subs.add(c);
    const ka = setInterval(() => res.write(': ka\n\n'), 15000);
    req.on('close', () => { subs.delete(c); clearInterval(ka); });
    return;
  }
  if (url.pathname === '/devices') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(Object.values(devices).sort((a, b) => b.last.localeCompare(a.last)), null, 2));
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  // 不对外提供 .env / .venv / .git 这类点开头的路径（.env 里是赞助商密钥）
  if (path.relative(ROOT, file).split(path.sep).some(s => s.startsWith('.'))) { res.writeHead(404); return res.end('not found'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/motion/play.html`));
