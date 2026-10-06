// Vehicle Inspection – Netlify function
// Sve tajne vrednosti dolaze iz Netlify environment variables (vidi README.md).

const crypto = require('crypto');

// ─── CONFIG ───────────────────────────────────────────────
function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Server nije podešen: nedostaje ${name}`);
  }
  return v;
}

const cfg = {
  sheetId: () => env('SHEET_ID'),
  reportsTab: () => env('REPORTS_TAB', 'Sheet1'),
  driversTab: () => env('DRIVERS_TAB', 'Drivers'),
  clientEmail: () => env('GOOGLE_CLIENT_EMAIL'),
  privateKey: () => env('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  cloud: () => env('CLOUDINARY_CLOUD'),
  cloudKey: () => env('CLOUDINARY_API_KEY'),
  cloudSecret: () => env('CLOUDINARY_API_SECRET'),
  cloudSigAlg: () => env('CLOUDINARY_SIGNATURE_ALGORITHM', 'sha256'),
  adminPassword: () => env('ADMIN_PASSWORD'),
  sessionSecret: () => env('SESSION_SECRET'),
  timeZone: () => env('APP_TIMEZONE', 'America/Chicago'),
};

const HEADER = ['Date', 'Full Name', 'Driver ID', 'Truck Number', 'Trailer Number',
  'Truck Photos', 'Trailer Photos', 'Driver Notes', 'Admin Comment'];

const DRIVER_TOKEN_TTL = 30 * 60;       // 30 min za popunjavanje i slanje izveštaja
const ADMIN_TOKEN_TTL = 12 * 60 * 60;   // 12 h admin sesija
const MAX_PHOTOS_PER_GROUP = 60;
const MAX_IMAGE_BASE64 = 5_500_000;     // ~4 MB slika (Netlify limit za zahtev je 6 MB)

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ─── HELPERS ──────────────────────────────────────────────
function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(data) {
  return base64url(crypto.createHmac('sha256', cfg.sessionSecret()).update(data).digest());
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signToken(payload, ttl) {
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl }));
  return `${body}.${hmac(body)}`;
}

function readToken(token, type) {
  if (typeof token !== 'string' || !token.includes('.')) throw new HttpError(401, 'Niste prijavljeni.');
  const [body, mac] = token.split('.');
  if (!safeEqual(mac, hmac(body))) throw new HttpError(401, 'Nevažeća sesija.');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch { throw new HttpError(401, 'Nevažeća sesija.'); }
  if (payload.type !== type) throw new HttpError(401, 'Nevažeća sesija.');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new HttpError(401, 'Sesija je istekla. Pokušajte ponovo.');
  return payload;
}

function str(v, field, max, { required = true } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `Neispravno polje: ${field}`);
  v = v.trim();
  if (required && !v) throw new HttpError(400, `Obavezno polje: ${field}`);
  if (v.length > max) throw new HttpError(400, `Predugačko polje: ${field}`);
  return v;
}

// Ignoriše velika/mala slova i dijakritike (Đorđević = djordjevic)
function normalizeName(s) {
  return String(s).toLowerCase().replace(/đ/g, 'dj')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/).filter(Boolean);
}

function quoteTab(tab) { return `'${tab.replace(/'/g, "''")}'`; }

// ─── GOOGLE SHEETS ────────────────────────────────────────
let cachedGoogleToken = null;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.exp - 60 > now) return cachedGoogleToken.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: cfg.clientEmail(),
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const sigInput = `${header}.${payload}`;
  const signature = base64url(crypto.createSign('RSA-SHA256').update(sigInput).sign(cfg.privateKey()));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${sigInput}.${signature}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google prijava nije uspela: ' + (data.error_description || data.error || res.status));
  cachedGoogleToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return data.access_token;
}

async function sheets(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId()}/${path}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google Sheets: ' + (data.error?.message || res.status));
  return data;
}

const range = (tab, cells) => encodeURIComponent(`${quoteTab(tab)}!${cells}`);

async function ensureHeader() {
  const tab = cfg.reportsTab();
  const d = await sheets(`values/${range(tab, 'A1:I1')}`);
  if (!d.values || d.values.length === 0) {
    await sheets(`values/${range(tab, 'A1:I1')}?valueInputOption=RAW`, {
      method: 'PUT', body: { values: [HEADER] },
    });
  }
}

// ─── CLOUDINARY ───────────────────────────────────────────
async function uploadToCloudinary(base64, mimeType, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'inspections';
  const sigStr = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${cfg.cloudSecret()}`;
  const signature = crypto.createHash(cfg.cloudSigAlg()).update(sigStr).digest('hex');

  const form = new URLSearchParams();
  form.append('file', `data:${mimeType};base64,${base64}`);
  form.append('api_key', cfg.cloudKey());
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud()}/image/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.error) throw new Error('Cloudinary: ' + data.error.message);
  return data.secure_url;
}

function isOurImageUrl(url) {
  return typeof url === 'string' && url.length < 500 &&
    url.startsWith(`https://res.cloudinary.com/${cfg.cloud()}/image/upload/`);
}

// ─── ACTIONS ──────────────────────────────────────────────
const actions = {
  // Vozač: provera imena i ID-a; vraća kratkotrajni token za slanje izveštaja
  async verify_driver(data) {
    const name = str(data.name, 'Full Name', 100);
    const driverid = str(data.driverid, 'Driver ID', 4);
    if (!/^\d{4}$/.test(driverid)) throw new HttpError(400, 'Driver ID mora imati tačno 4 cifre.');

    // Dovoljno je da se poklopi ime ILI prezime + tačan ID.
    // U izveštaj se upisuje puno ime iz lista Drivers.
    const nameWords = normalizeName(name);

    const d = await sheets(`values/${range(cfg.driversTab(), 'A2:B')}`);
    const match = (d.values || []).find(row => {
      if (!row[0] || !row[1]) return false;
      const sheetWords = normalizeName(row[0]);
      return String(row[1]).trim() === driverid && nameWords.some(w => sheetWords.includes(w));
    });
    if (!match) {
      await new Promise(r => setTimeout(r, 800)); // usporava pogađanje ID-a
      return { valid: false };
    }

    const officialName = String(match[0]).trim();
    return { valid: true, officialName, token: signToken({ type: 'driver', name: officialName, driverid }, DRIVER_TOKEN_TTL) };
  },

  async upload_image(data, token) {
    readToken(token, 'driver');
    const kind = data.kind === 'trailer' ? 'trailer' : 'truck';
    const mimeType = str(data.mimeType, 'mimeType', 20);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new HttpError(400, 'Nepodržan format slike.');
    if (typeof data.base64 !== 'string' || !data.base64 || data.base64.length > MAX_IMAGE_BASE64 ||
        !/^[A-Za-z0-9+/=]+$/.test(data.base64)) throw new HttpError(400, 'Neispravna ili prevelika slika.');

    const clean = v => String(v || '').replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
    const label = clean(data.label) || 'unit';
    const shot = clean(data.shot); // npr. "LR-Tires" – admin panel ga prikazuje ispod slike
    const rand = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const publicId = shot ? `${kind}__${shot}__${label}__${rand}` : `${kind}_${label}_${rand}`;
    return { url: await uploadToCloudinary(data.base64, mimeType, publicId) };
  },

  async append_row(data, token) {
    const driver = readToken(token, 'driver');
    const truck = str(data.truck, 'Truck Number', 40);
    const trailer = str(data.trailer, 'Trailer Number', 40);
    const notes = str(data.notes, 'Notes', 2000, { required: false });

    const checkUrls = (urls, label) => {
      if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_PHOTOS_PER_GROUP || !urls.every(isOurImageUrl)) {
        throw new HttpError(400, `Neispravne fotografije: ${label}`);
      }
      return urls.join(' | ');
    };
    const truckPhotos = checkUrls(data.truckUrls, 'truck');
    const trailerPhotos = checkUrls(data.trailerUrls, 'trailer');

    // samo datum, bez vremena (npr. 10/6/2026)
    const ts = new Date().toLocaleDateString('en-US', { timeZone: cfg.timeZone() });

    await ensureHeader();
    // RAW: unos vozača se nikad ne tumači kao formula
    await sheets(`values/${range(cfg.reportsTab(), 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: { values: [[ts, driver.name, driver.driverid, truck, trailer, truckPhotos, trailerPhotos, notes, '']] },
    });
    return { ok: true };
  },

  async admin_login(data) {
    const password = typeof data.password === 'string' ? data.password : '';
    if (!password || !safeEqual(password, cfg.adminPassword())) {
      await new Promise(r => setTimeout(r, 800)); // usporava pogađanje lozinke
      throw new HttpError(401, 'Pogrešna lozinka.');
    }
    return { token: signToken({ type: 'admin' }, ADMIN_TOKEN_TTL) };
  },

  async get_rows(data, token) {
    readToken(token, 'admin');
    const d = await sheets(`values/${range(cfg.reportsTab(), 'A1:I')}`);
    return { values: d.values || [], timeZone: cfg.timeZone() };
  },

  async update_comment(data, token) {
    readToken(token, 'admin');
    const rowIndex = Number(data.rowIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 2 || rowIndex > 1_000_000) throw new HttpError(400, 'Neispravan red.');
    const comment = str(data.comment, 'Comment', 2000, { required: false });
    await sheets(`values/${range(cfg.reportsTab(), `I${rowIndex}`)}?valueInputOption=RAW`, {
      method: 'PUT', body: { values: [[comment]] },
    });
    return { ok: true };
  },
};

// ─── HANDLER ──────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

  try {
    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); } catch { throw new HttpError(400, 'Neispravan zahtev.'); }
    const { action, data = {}, token } = parsed;

    if (!Object.prototype.hasOwnProperty.call(actions, action)) throw new HttpError(400, 'Nepoznata akcija.');
    if (typeof data !== 'object' || data === null) throw new HttpError(400, 'Neispravan zahtev.');

    return reply(200, await actions[action](data, token));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    return reply(status, { error: err.message || 'Greška na serveru.' });
  }
};
