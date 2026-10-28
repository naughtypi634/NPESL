// 本地预览：带 Range 支持的静态服务器，跑 build/cloudflare-site。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve('build/cloudflare-site');
const PORT = Number(process.env.PORT || 8765);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  for (const candidate of [rel, rel + '.html', rel + '/index.html']) {
    let buf;
    try {
      buf = await readFile(join(ROOT, candidate));
    } catch {
      continue;
    }
    const type = MIME[extname(candidate)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
      if (start >= buf.length) {
        res.writeHead(416, { 'content-range': `bytes */${buf.length}` });
        res.end();
        return;
      }
      end = Math.min(end, buf.length - 1);
      res.writeHead(206, {
        'content-type': type,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${buf.length}`,
        'content-length': end - start + 1,
      });
      res.end(buf.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-length': buf.length,
    });
    res.end(buf);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`preview: http://127.0.0.1:${PORT}/drill/`);
});
