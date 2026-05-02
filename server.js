const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

const ROOT = __dirname;
const DB_DIR = process.env.MAA_DB_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DB_DIR, 'database.json');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();
const icdBridgeSessions = new Map();
let lastLocalLogin = null;

const roles = ['admin', 'worker', 'programmer'];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ttf': 'font/ttf'
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function seedDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (Array.isArray(existing.users) && existing.users.length) return;
    } catch (error) {
      // Recreate the local desktop database if it is empty or damaged.
    }
  }
  const now = new Date().toISOString();
  const db = {
    users: [
      { id: 1, username: 'admin', name: 'Administrator', role: 'admin', passwordHash: hashPassword('admin123'), createdAt: now },
      { id: 2, username: 'worker', name: 'Worker', role: 'worker', passwordHash: hashPassword('worker123'), createdAt: now },
      { id: 3, username: 'programmer', name: 'Programmer', role: 'programmer', passwordHash: hashPassword('programmer123'), createdAt: now }
    ],
    auditLog: []
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function db() { seedDb(); return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDb(next) { fs.mkdirSync(DB_DIR, { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(next, null, 2)); }
function audit(user, action) {
  const next = db();
  next.auditLog.unshift({ at: new Date().toISOString(), user: user?.username || 'system', action });
  next.auditLog = next.auditLog.slice(0, 200);
  saveDb(next);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
  }));
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !sessions.has(sid)) {
    if (lastLocalLogin && Date.now() - lastLocalLogin.at < 2 * 60 * 60 * 1000) {
      const fallbackUser = db().users.find(u => u.id === lastLocalLogin.userId);
      return fallbackUser ? { id: fallbackUser.id, username: fallbackUser.username, name: fallbackUser.name, role: fallbackUser.role } : null;
    }
    return null;
  }
  const session = sessions.get(sid);
  const user = db().users.find(u => u.id === session.userId);
  return user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null;
}

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body);
}
function redirect(res, location) { res.writeHead(302, { Location: location }); res.end(); }
function jsonResponse(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}
function decodeHtmlBasic(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function htmlToText(value) {
  return decodeHtmlBasic(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function extractCpaLocation(html) {
  const match = String(html || '').match(/<td[^>]*>\s*Position\s*\/\s*Location\s*<\/td>\s*<td[^>]*>\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  return match ? htmlToText(match[1]) : '';
}
async function lookupCpaLocation(container) {
  const normalized = String(container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return { ok: false, status: 400, error: 'Invalid container number.' };
  const body = querystring.stringify({ containerLocation: normalized });
  const response = await fetch('https://cpatos.gov.bd/pcs/index.php/Report/mySearchContainerLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MAA-ASSOCIATES-ASYCUDA/1.0' },
    body
  });
  const html = await response.text();
  const location = extractCpaLocation(html);
  const notFound = /Wrong container|not found/i.test(html);
  return { ok: true, status: 200, container: normalized, location, found: Boolean(location) && !notFound };
}
function getHeaderSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? combined.split(/,(?=\s*[^;,]+=)/g) : [];
}
function storeResponseCookies(headers, jar) {
  for (const cookie of getHeaderSetCookies(headers)) {
    const first = String(cookie).split(';')[0];
    const i = first.indexOf('=');
    if (i > 0) jar.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
const ICD_BASE_ORIGIN = 'http://175.29.187.218';
const ICD_BASE_PATH = '/saif_icd_yard/';
const ICD_BASE_URL = ICD_BASE_ORIGIN + ICD_BASE_PATH;
function absoluteSaifUrl(location) {
  const value = String(location || '');
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith(ICD_BASE_PATH)) return ICD_BASE_ORIGIN + value;
  return new URL(value.replace(/^\/+/, ''), ICD_BASE_URL).toString();
}
async function saifFetch(url, options = {}, jar = new Map()) {
  let current = absoluteSaifUrl(url);
  let opts = { ...options, redirect: 'manual' };
  for (let i = 0; i < 6; i++) {
    const headers = { ...(opts.headers || {}) };
    const cookies = cookieHeader(jar);
    if (cookies) headers.Cookie = cookies;
    const response = await fetch(current, { ...opts, headers });
    storeResponseCookies(response.headers, jar);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    current = absoluteSaifUrl(location);
    opts = { method: 'GET', headers: { Referer: current }, redirect: 'manual' };
  }
  return fetch(current, { ...opts, headers: { ...(opts.headers || {}), Cookie: cookieHeader(jar) }, redirect: 'manual' });
}
function extractToken(html) {
  return (String(html || '').match(/name=["']_token["'][^>]*value=["']([^"']+)/i) || [])[1]
      || (String(html || '').match(/name=["']csrf-token["'][^>]*content=["']([^"']+)/i) || [])[1]
      || '';
}
function extractSearchForm(html) {
  const forms = [...String(html || '').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(m => ({ attrs: m[1], body: m[2] }));
  const scored = forms.map(form => {
    const text = form.attrs + ' ' + form.body;
    let score = 0;
    if (/container|cont|cntr/i.test(text)) score += 6;
    if (/search/i.test(text)) score += 4;
    if (/<input\b[^>]*type=["']?(?:text|search)?["']?/i.test(form.body)) score += 3;
    if (/<button\b[^>]*>[\s\S]*search|value=["']search/i.test(form.body)) score += 2;
    return { form, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].form : null;
}
function formAction(form, fallback) {
  const action = (form?.attrs.match(/action=["']([^"']+)/i) || [])[1];
  return action ? absoluteSaifUrl(action) : absoluteSaifUrl(fallback);
}
function hiddenPayloadFromForm(form) {
  const payload = {};
  if (!form) return payload;
  for (const m of form.body.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/name=["']([^"']+)/i) || [])[1];
    if (!name) continue;
    const type = ((tag.match(/\stype=["']?([^"'\s>]+)/i) || [])[1] || 'text').toLowerCase();
    if (type !== 'hidden') continue;
    const value = (tag.match(/value=["']([^"']*)/i) || [])[1] || '';
    payload[name] = decodeHtmlBasic(value);
  }
  return payload;
}
function formInputFields(form) {
  if (!form) return [];
  const fields = [];
  for (const m of form.body.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/\sname=["']([^"']+)/i) || [])[1];
    if (!name) continue;
    const type = ((tag.match(/\stype=["']?([^"'\s>]+)/i) || [])[1] || (m[1].toLowerCase() === 'input' ? 'text' : m[1].toLowerCase())).toLowerCase();
    const value = decodeHtmlBasic((tag.match(/\svalue=["']([^"']*)/i) || [])[1] || '');
    fields.push({ name, type, value });
  }
  return fields;
}
function summarizeSaifResult(raw) {
  let html = raw;
  try {
    const json = JSON.parse(raw);
    if (json.status && json.status !== 'success') return json.message || 'No result';
    html = json.data || json.html || json.result || raw;
  } catch (error) {}
  const text = htmlToText(html).replace(/\bSearch\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 900) || 'No result';
}
async function lookupSaifContainer(email, password, container) {
  const normalized = String(container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return { ok: false, status: 400, error: 'Invalid container number.' };
  if (!email || !password) return { ok: false, status: 400, error: 'ICD E-mail/Password missing.' };
  const jar = new Map();
  const loginPage = await saifFetch('/login', { method: 'GET' }, jar);
  const loginHtml = await loginPage.text();
  const token = extractToken(loginHtml);
  const loginBody = querystring.stringify({ _token: token, email, password });
  const logged = await saifFetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: absoluteSaifUrl('/login') },
    body: loginBody
  }, jar);
  await logged.text();
  const view = await saifFetch('/admin/search_container_view', { method: 'GET' }, jar);
  const viewHtml = await view.text();
  if (/Sign in to start your session|name=["']password["']/i.test(viewHtml)) return { ok: false, status: 401, error: 'ICD login failed.' };
  const csrf = extractToken(viewHtml) || token;
  const form = extractSearchForm(viewHtml);
  const payloadBase = hiddenPayloadFromForm(form);
  const candidateNames = ['container_no', 'container_number', 'container', 'containerNo', 'cont_no', 'cntr_no', 'search_container', 'search_value', 'container_id'];
  const urls = [...new Set([formAction(form, '/admin/search_container'), absoluteSaifUrl('/admin/search_container'), absoluteSaifUrl('/get_search_container_information')])];
  for (const target of urls) {
    for (const name of candidateNames) {
      const payload = { ...payloadBase, _token: csrf };
      payload[name] = normalized;
      const response = await saifFetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf, Referer: absoluteSaifUrl('/admin/search_container_view'), Accept: 'application/json, text/html, */*' },
        body: querystring.stringify(payload)
      }, jar);
      const raw = await response.text();
      if (response.status >= 200 && response.status < 400 && !/Session Expired|Sign in to start your session/i.test(raw)) {
        const result = summarizeSaifResult(raw);
        if (result && !/^No result$/i.test(result)) return { ok: true, status: 200, container: normalized, result };
      }
    }
  }
  return { ok: false, status: 502, error: 'ICD search form auto-detect kora jacche na.' };
}
async function loginIcdForBridge(email, password) {
  if (!email || !password) return { ok: false, status: 400, error: 'ICD E-mail/Password missing.' };
  const jar = new Map();
  const loginPage = await saifFetch('/login', { method: 'GET' }, jar);
  const loginHtml = await loginPage.text();
  const token = extractToken(loginHtml);
  const loginBody = querystring.stringify({ _token: token, email, password });
  const logged = await saifFetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: absoluteSaifUrl('/login') },
    body: loginBody
  }, jar);
  await logged.text();
  const view = await saifFetch('/admin/search_container_view', { method: 'GET' }, jar);
  const html = await view.text();
  if (/Sign in to start your session|name=["']password["']/i.test(html)) return { ok: false, status: 401, error: 'ICD login failed.' };
  return { ok: true, status: 200, jar, html };
}
function icdSessionId(jar, viewHtml = '') {
  const id = crypto.randomBytes(18).toString('hex');
  icdBridgeSessions.set(id, { jar, viewHtml, touchedAt: Date.now() });
  for (const [key, value] of icdBridgeSessions.entries()) {
    if (Date.now() - value.touchedAt > 30 * 60 * 1000) icdBridgeSessions.delete(key);
  }
  return id;
}
function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}
function icdFormProxyAction(sid, target, method, container) {
  return `/icd-proxy-submit?sid=${encodeURIComponent(sid)}&target=${encodeURIComponent(target)}&method=${encodeURIComponent(method || 'post')}&container=${encodeURIComponent(container || '')}`;
}
function icdLocalSearchPage(sid, container, viewHtml, message = '') {
  const normalized = String(container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const form = extractSearchForm(viewHtml);
  const target = formAction(form, '/admin/search_container_view');
  const method = (form?.attrs.match(/\smethod=(["'])(.*?)\1/i) || [])[2] || 'post';
  const formFields = formInputFields(form);
  const containerNames = ['container_no', 'container_number', 'container', 'containerNo', 'cont_no', 'cntr_no', 'search_container', 'search_value', 'container_id', 'container_search', 'cont_number', 'search', 'keyword', 'query', 'q'];
  const containerSet = new Set(containerNames.map(x => x.toLowerCase()));
  const visibleNames = formFields
    .filter(field => !['hidden', 'submit', 'button', 'password', 'email', 'file', 'checkbox', 'radio'].includes(field.type))
    .map(field => field.name);
  const primaryName = visibleNames.find(name => /container|cont|cntr|search/i.test(name)) || visibleNames[0] || 'container_no';
  const hiddenInputs = Object.entries(hiddenPayloadFromForm(form))
    .filter(([name]) => !containerSet.has(String(name).toLowerCase()))
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join('');
  const extraInputs = [...new Set(visibleNames)]
    .filter(name => name !== primaryName)
    .map(name => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(normalized)}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ICD Container Search</title><style>
body{margin:0;font-family:Arial,Helvetica,sans-serif;background:linear-gradient(135deg,#dff1ff,#f8fbff);color:#1f2937}.shell{max-width:720px;margin:34px auto;padding:0 14px}.head{display:flex;gap:14px;align-items:center;margin-bottom:18px}.head h1{margin:0;font-size:24px;color:#0f172a}.head span{font-size:13px;color:#64748b}.card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:18px;box-shadow:0 10px 26px #0f172a12}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row input{width:260px;min-height:38px;border:1px solid #94a3b8;border-radius:4px;padding:0 10px;font-size:15px;text-transform:uppercase}.row button{min-height:40px;border:1px solid #cbd5e1;border-radius:4px;background:#f8fafc;padding:0 16px;cursor:pointer}.notice{margin-top:12px;color:#b91c1c;font-size:13px}.ok{color:#14532d;font-weight:700}.muted{color:#64748b;font-size:13px;margin-top:10px}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;font-weight:700}@media(max-width:540px){.row input{width:100%;flex:1}.row button{width:100%}}</style></head><body><div class="shell"><div class="head"><h1>CONTAINER SEARCH</h1><span>LOG VIEW</span></div><div class="card">${message ? `<div class="warn">${escapeHtml(message)}</div>` : ''}<form id="icdAutoSearchForm" method="post" action="${escapeHtml(icdFormProxyAction(sid, target, method, normalized))}"><div class="row"><input id="icdContainerBox" name="${escapeHtml(primaryName)}" value="${escapeHtml(normalized)}" autocomplete="off"><button type="submit">Search</button></div>${hiddenInputs}${extraInputs}</form><div class="notice"><span class="ok">Container auto set:</span> ${escapeHtml(normalized)}</div><div class="muted">Container number box-e bosano ache. Search click korun.</div></div></div><script>
(function(){
  var box=document.getElementById('icdContainerBox');
  var container=${jsString(normalized)};
  if(box){box.value=container;box.setAttribute('value',container);box.focus();box.select();}
})();
</script></body></html>`;
}
function rewriteIcdHtml(html, sid, container, source = '/admin/search_container_view', autoSubmit = false) {
  const normalized = String(container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sourceUrl = absoluteSaifUrl(source || '/admin/search_container_view');
  let out = String(html || '');
  out = out.replace(/<form\b([^>]*)>/gi, (full, attrs) => {
    const action = (attrs.match(/\saction=(["'])(.*?)\1/i) || [])[2] || sourceUrl;
    const method = (attrs.match(/\smethod=(["'])(.*?)\1/i) || [])[2] || 'post';
    const target = absoluteSaifUrl(decodeHtmlBasic(action));
    const cleanAttrs = attrs
      .replace(/\saction=(["']).*?\1/i, '')
      .replace(/\smethod=(["']).*?\1/i, '')
      .replace(/\starget=(["']).*?\1/i, '');
    return `<form${cleanAttrs} method="post" action="${escapeHtml(icdFormProxyAction(sid, target, method, normalized))}">`;
  });
  const headInsert = `<base href="${escapeHtml(sourceUrl)}"><style>.icdBridgeNotice{position:sticky;top:0;z-index:99999;background:#14532d;color:#fff;padding:10px 14px;font:700 14px Arial,sans-serif;box-shadow:0 2px 10px #0002}.icdBridgeNotice small{display:block;font-weight:400;color:#dcfce7;margin-top:3px}</style>`;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>${headInsert}`);
  else out = `${headInsert}${out}`;
  const script = `<script>
(function(){
  var container=${jsString(normalized)};
  var autoSubmit=${autoSubmit ? 'true' : 'false'};
  function usable(el){
    var type=(el.getAttribute('type')||'text').toLowerCase();
    if(type==='hidden'||type==='password'||type==='email'||type==='submit'||type==='button') return false;
    if(el.name==='_token'||el.disabled||el.readOnly) return false;
    return true;
  }
  function labelText(el){
    var id=null;
    try{ if(el.id&&window.CSS&&CSS.escape) id=document.querySelector('label[for="'+CSS.escape(el.id)+'"]'); }catch(error){}
    return ((id&&id.textContent)||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+(el.className||'');
  }
  function setValue(el){
    el.value=container;
    el.setAttribute('value',container);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  var fields=[].slice.call(document.querySelectorAll('input,textarea,select')).filter(usable);
  var matches=fields.filter(function(el){return /container|cont|cntr|search/i.test(labelText(el));});
  if(!matches.length) matches=fields.filter(function(el){return (el.tagName==='INPUT'||el.tagName==='TEXTAREA') && (!el.type || /text|search|number/i.test(el.type));}).slice(0,2);
  matches.forEach(setValue);
  var form=(matches[0]&&matches[0].form)||[].slice.call(document.forms).find(function(f){return /container|cont|cntr|search/i.test((f.action||'')+' '+f.textContent);});
  if(form){
    ['container_no','container_number','container','containerNo','cont_no','cntr_no','search_container','search_value','container_id'].forEach(function(name){
      if(!form.querySelector('[name="'+name+'"]')){
        var input=document.createElement('input');
        input.type='hidden';
        input.name=name;
        input.value=container;
        form.appendChild(input);
      }
    });
  }
  var notice=document.createElement('div');
  notice.className='icdBridgeNotice';
  notice.innerHTML='ICD Search: '+container+'<small>Container number auto fill kora hoyeche'+(autoSubmit?' ebong search submit hocche.':' .')+'</small>';
  document.body.insertBefore(notice,document.body.firstChild);
  if(autoSubmit&&form&&!form.dataset.icdAutoSubmitted){
    form.dataset.icdAutoSubmitted='1';
    setTimeout(function(){ if(form.requestSubmit) form.requestSubmit(); else form.submit(); }, 900);
  }
})();
</script>`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${script}</body>`);
  else out += script;
  return out;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }

function layout(title, user, content) {
  const nav = user ? `<nav class="appNav"><a href="/dashboard">Dashboard</a><a href="/app">ASYCUDA Tool</a>${user.role === 'admin' ? '<a href="/admin">Admin</a>' : ''}${user.role === 'programmer' || user.role === 'admin' ? '<a href="/programmer">Programmer</a>' : ''}<a href="/worker">Worker</a><a href="/logout">Logout</a></nav>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;color:#14213d}.shell{max-width:1120px;margin:auto;padding:24px}.hero{background:linear-gradient(135deg,#0b5f4a,#0f766e 55%,#14532d);color:#fff;border-radius:16px;padding:22px;display:flex;align-items:center;gap:16px;margin-bottom:16px}.logo{width:62px;height:62px;background:#fff;color:#14532d;border-radius:12px;display:grid;place-items:center;font-weight:900;font-size:24px}.hero h1{margin:0;font-size:30px}.hero p{margin:4px 0 0;color:#dcfce7;font-weight:700;text-transform:uppercase}.card{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:18px;box-shadow:0 6px 18px #0000000d;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.appNav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.appNav a,.btn{display:inline-block;background:#0f766e;color:#fff;text-decoration:none;border:0;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer}.appNav a:last-child{background:#334155}input,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin:5px 0 12px}label{font-weight:700;font-size:13px}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #e2e8f0;padding:9px;text-align:left;font-size:13px}th{background:#14532d;color:#fff}.muted{color:#64748b}.danger{background:#dc2626}.pill{display:inline-block;border-radius:99px;background:#e8f5ee;color:#14532d;padding:4px 8px;font-weight:700}.cardHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.cardHead h3{margin:0;color:#14532d}.userForm{display:grid;grid-template-columns:1.1fr 1.2fr .9fr 1fr auto;gap:12px;align-items:end}.userForm .field{min-width:0}.userForm label{display:block;margin-bottom:5px;color:#334155}.userForm input,.userForm select{height:42px;margin:0}.userForm .btn{height:42px;white-space:nowrap}.tableWrap{overflow:auto;border:1px solid #e2e8f0;border-radius:10px}.tableWrap table{border:0}.tableWrap th:first-child,.tableWrap td:first-child{border-left:0}.tableWrap th:last-child,.tableWrap td:last-child{border-right:0}.resetForm{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:8px;align-items:center;margin:0}.resetForm input{height:38px;margin:0}.resetForm .btn{height:38px;padding:8px 12px}.panelIntro{margin:0 0 14px;color:#64748b}.sectionTitle{margin:0;color:#14532d}@media(max-width:900px){.userForm{grid-template-columns:repeat(2,minmax(0,1fr))}.userForm .submitField{grid-column:1/-1}.userForm .btn{width:100%}}@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:24px}.userForm{grid-template-columns:1fr}.resetForm{grid-template-columns:1fr}.resetForm .btn{width:100%}}.loginShell{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);gap:18px;align-items:stretch;max-width:980px;margin:22px auto 0}.loginIntro{background:linear-gradient(135deg,#0b5f4a,#0f766e 55%,#14532d);color:#fff;border-radius:16px;padding:34px;min-height:360px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}.loginIntro::after{content:"";position:absolute;right:-42px;bottom:-42px;width:190px;height:190px;border:2px solid rgba(255,255,255,.18);border-radius:50%}.loginBadge{display:inline-flex;align-self:flex-start;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:7px 11px;font-weight:800;font-size:12px;text-transform:uppercase}.loginIntro h2{font-size:42px;margin:18px 0 6px;letter-spacing:0}.loginIntro p{font-size:17px;font-weight:700;color:#dcfce7;margin:0;text-transform:uppercase}.loginMeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:28px}.loginMeta span{background:#fff;color:#14532d;border-radius:8px;padding:8px 10px;font-weight:800;font-size:12px}.loginCard{background:#fff;border:1px solid #dbe3ef;border-radius:16px;padding:30px;box-shadow:0 18px 45px #0f172a1a;display:flex;flex-direction:column;justify-content:center}.loginCardHead h2{margin:0;font-size:28px;color:#14532d}.loginCardHead p{margin:6px 0 22px;color:#64748b}.loginForm{display:grid;gap:8px}.loginForm label{margin:0;color:#334155}.loginForm input{height:46px;margin:0 0 10px;border-radius:10px;border:1px solid #cbd5e1;padding:0 9px;font-size:15px}.loginForm input:focus{outline:3px solid #bbf7d0;border-color:#0f766e}.loginBtn{width:100%;height:46px;border-radius:10px;margin-top:4px;font-size:15px}.quickLogin{text-align:center;background:#334155;margin-top:8px}.loginError{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;font-weight:700;margin-bottom:14px}@media(max-width:820px){.loginShell{grid-template-columns:1fr}.loginIntro{min-height:230px}.loginIntro h2{font-size:32px}}
  </style></head><body><div class="shell"><section class="hero"><div class="logo">MA</div><div><h1>MAA ASSOCIATES</h1><p>Customs Clearing &amp; Forwarding Agent</p></div></section>${nav}${content}</div></body></html>`;
}

function loginPage(message = '') {
  return layout('Login - MAA ASSOCIATES', null, `<section class="loginShell"><div class="loginIntro"><div class="loginBadge">Secure ASYCUDA Portal</div><h2>MAA ASSOCIATES</h2><p>Customs Clearing &amp; Forwarding Agent</p></div><div class="loginCard"><div class="loginCardHead"><h2>Sign in</h2><p>Enter your authorized account details</p></div>${message ? `<div class="loginError">${escapeHtml(message)}</div>` : ''}<form method="post" action="/login" class="loginForm"><label for="username">Username</label><input id="username" name="username" autocomplete="username" placeholder="Enter username" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required><button class="btn loginBtn" type="submit">Login</button><a class="btn loginBtn quickLogin" href="/quick-login/admin">Enter App</a></form></div></section>`);
}

function dashboard(user) {
  return layout('Dashboard', user, `<div class="grid"><div class="card"><h3>Role</h3><p><span class="pill">${escapeHtml(user.role)}</span></p><p>${escapeHtml(user.name)}</p></div><div class="card"><h3>ASYCUDA Tool</h3><p class="muted">Upload XML, auto-fill form, export reports.</p><a class="btn" href="/app">Open Tool</a></div><div class="card"><h3>Panels</h3><p><a class="btn" href="/worker">Worker Panel</a> ${user.role === 'admin' ? '<a class="btn" href="/admin">Admin Panel</a>' : ''} ${user.role !== 'worker' ? '<a class="btn" href="/programmer">Programmer Panel</a>' : ''}</p></div></div>`);
}
function backToDashboard() {
  return '<p><a class="btn" href="/dashboard">Back to Dashboard</a></p>';
}

function workerPanel(user) {
  return layout('Worker Panel', user, `${backToDashboard()}<div class="card"><h2>Worker Panel</h2><p class="muted">Main work area for XML processing and document preparation.</p><a class="btn" href="/app">Open ASYCUDA Processing Tool</a></div>`);
}
function userManagementHtml(user, panelPath) {
  const next = db();
  const users = next.users.map(u => `<tr><td>${u.id}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.createdAt)}</td><td><form method="post" action="/users/reset" class="resetForm"><input type="hidden" name="id" value="${u.id}"><input type="hidden" name="returnTo" value="${escapeHtml(panelPath)}"><input name="password" type="password" placeholder="New password" required><button class="btn" type="submit">Reset</button></form></td></tr>`).join('');
  return `<div class="card"><div class="cardHead"><div><h3>Create User</h3><p class="panelIntro">New account information enter korun.</p></div></div><form method="post" action="/users/create" class="userForm"><input type="hidden" name="returnTo" value="${escapeHtml(panelPath)}"><div class="field"><label>Username</label><input name="username" placeholder="User ID" required></div><div class="field"><label>Name</label><input name="name" placeholder="Full name" required></div><div class="field"><label>Role</label><select name="role">${roles.map(r => `<option>${r}</option>`).join('')}</select></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Password" required></div><div class="field submitField"><button class="btn" type="submit">Create User</button></div></form></div><div class="card"><div class="cardHead"><h3>Users</h3><span class="pill">${next.users.length} accounts</span></div><div class="tableWrap"><table><thead><tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Created</th><th>Reset Password</th></tr></thead><tbody>${users}</tbody></table></div><p class="muted">Existing passwords hashed thake, tai dekha jay na. Reset kore new password set kora jay.</p></div>`;
}
function programmerPanel(user) {
  const files = fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isFile()).map(f => `<tr><td>${escapeHtml(f)}</td><td>${fs.statSync(path.join(ROOT, f)).size}</td></tr>`).join('');
  return layout('Programmer Panel', user, `${backToDashboard()}<div class="card"><h2>Programmer Panel</h2><p class="muted">Project file overview, database location, and user management.</p><p><b>Database:</b> ${escapeHtml(DB_PATH)}</p><table><thead><tr><th>File</th><th>Bytes</th></tr></thead><tbody>${files}</tbody></table></div>${userManagementHtml(user, '/programmer')}`);
}

function adminPanel(user) {
  const next = db();
  const logs = next.auditLog.slice(0, 20).map(l => `<tr><td>${escapeHtml(l.at)}</td><td>${escapeHtml(l.user)}</td><td>${escapeHtml(l.action)}</td></tr>`).join('');
  return layout('Admin Panel', user, `${backToDashboard()}<div class="card"><h2>Admin Panel</h2></div>${userManagementHtml(user, '/admin')}<div class="card"><h3>Audit Log</h3><table><thead><tr><th>Time</th><th>User</th><th>Action</th></tr></thead><tbody>${logs}</tbody></table></div>`);
}


function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(querystring.parse(body)));
  });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    send(res, 200, data, mime[ext] || 'application/octet-stream', { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache' });
  });
}
function serveAppFile(req, res, filePath, user) {
  if (path.basename(filePath).toLowerCase() !== 'index.html') return serveFile(res, filePath);
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const role = escapeHtml(user?.role || '');
    const safeRoleJson = JSON.stringify(user?.role || '');
    const injected = html
      .replace('<body>', `<body data-role="${role}">`)
      .replace('</head>', `<script>window.APP_USER_ROLE=${safeRoleJson};</script></head>`);
    send(res, 200, injected, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache' });
  });
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) { redirect(res, '/login'); return null; }
  return user;
}
function requireRole(req, res, allowed) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!allowed.includes(user.role)) { send(res, 403, layout('Access denied', user, '<div class="card"><h2>Access denied</h2><p>You do not have permission for this panel.</p></div>')); return null; }
  return user;
}

seedDb();

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, loginPage());
  if (req.method === 'GET' && url.pathname === '/login') return send(res, 200, loginPage());
  if (req.method === 'POST' && url.pathname === '/login') {
    const body = await readBody(req);
    const inputUsername = String(body.username || '').trim();
    const inputPassword = String(body.password || '').trim();
    const found = db().users.find(u => u.username.toLowerCase() === inputUsername.toLowerCase());
    if (!found || !verifyPassword(inputPassword, found.passwordHash)) return send(res, 401, loginPage('Wrong username or password.'));
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { userId: found.id, createdAt: Date.now() });
    audit(found, 'login');
    lastLocalLogin = { userId: found.id, at: Date.now() };
    return send(res, 200, dashboard({ id: found.id, username: found.username, name: found.name, role: found.role }), 'text/html; charset=utf-8', { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (req.method === 'GET' && url.pathname === '/logout') {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    res.writeHead(302, { Location: '/login', 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/quick-login/admin') {
    const found = db().users.find(u => u.username === 'admin');
    if (!found) return send(res, 500, loginPage('Admin user not found.'));
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { userId: found.id, createdAt: Date.now() });
    lastLocalLogin = { userId: found.id, at: Date.now() };
    audit(found, 'quick login');
    return send(res, 200, dashboard({ id: found.id, username: found.username, name: found.name, role: found.role }), 'text/html; charset=utf-8', { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (req.method === 'GET' && url.pathname === '/icd-search-bridge') {
    const user = requireRole(req, res, ['programmer']); if (!user) return;
    return send(res, 200, layout('ICD Search', user, '<div class="card"><h2>ICD Search</h2><p class="muted">App er container table theke ICD Search button click korun. Ei page direct open korle container number pawa jay na.</p><a class="btn" href="/app">Back to App</a></div>'));
  }
  if (req.method === 'POST' && url.pathname === '/icd-search-bridge') {
    const user = requireRole(req, res, ['programmer']); if (!user) return;
    try {
      const body = await readBody(req);
      const email = String(body.email || '').trim();
      const password = String(body.password || '');
      const container = String(body.container || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z]{4}\d{7}$/.test(container)) return send(res, 200, layout('ICD Search', user, '<div class="card"><h2>Invalid container number.</h2><p class="muted">XML process kore container table-er ICD Search button click korun.</p><a class="btn" href="/app">Back to App</a></div>'));
      const login = await loginIcdForBridge(email, password);
      if (!login.ok) return send(res, 200, layout('ICD Search', user, `<div class="card"><h2>${escapeHtml(login.error || 'ICD login failed.')}</h2><p class="muted">ICD E-mail/Password check korun. Browser error er bodole ei message dekhabe.</p><a class="btn" href="/app">Back to App</a></div>`));
      const sid = icdSessionId(login.jar, login.html);
      return send(res, 200, icdLocalSearchPage(sid, container, login.html));
    } catch (error) {
      return send(res, 200, layout('ICD Search', currentUser(req), '<div class="card"><h2>ICD site theke page ana jacche na.</h2><p class="muted">Network ba ICD server response problem hote pare.</p><a class="btn" href="/app">Back to App</a></div>'));
    }
  }
  if (req.method === 'POST' && url.pathname === '/icd-proxy-submit') {
    const user = requireRole(req, res, ['programmer']); if (!user) return;
    try {
      const sid = String(url.searchParams.get('sid') || '');
      const bridge = icdBridgeSessions.get(sid);
      if (!bridge) return send(res, 200, layout('ICD Search', user, '<div class="card"><h2>ICD session expired.</h2><p class="muted">App theke ICD Search abar click korun.</p><a class="btn" href="/app">Back to App</a></div>'));
      bridge.touchedAt = Date.now();
      const target = absoluteSaifUrl(url.searchParams.get('target') || '/admin/search_container_view');
      const method = String(url.searchParams.get('method') || 'post').toUpperCase() === 'GET' ? 'GET' : 'POST';
      const container = String(url.searchParams.get('container') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const body = await readBody(req);
      const payload = { ...body };
      Object.keys(payload).forEach(key => { if (key.startsWith('_icd_')) delete payload[key]; });
      let response;
      if (method === 'GET') {
        const getUrl = new URL(target);
        const params = new URLSearchParams(querystring.stringify(payload));
        params.forEach((value, key) => getUrl.searchParams.set(key, value));
        response = await saifFetch(getUrl.toString(), { method: 'GET', headers: { Referer: absoluteSaifUrl('/admin/search_container_view') } }, bridge.jar);
      } else {
        response = await saifFetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: absoluteSaifUrl('/admin/search_container_view'), Accept: 'text/html,application/json,*/*' },
          body: querystring.stringify(payload)
        }, bridge.jar);
      }
      const raw = await response.text();
      const type = response.headers.get('content-type') || '';
      if (response.status >= 500 || /Whoops,\s*looks like something went wrong|something went wrong/i.test(raw)) {
        return send(res, 200, icdLocalSearchPage(sid, container, bridge.viewHtml, 'ICD server search submit nite pareni. Container box-e value bosano ache, abar Search click kore dekhen.'));
      }
      if (/json/i.test(type)) return send(res, 200, `<pre>${escapeHtml(raw)}</pre>`);
      return send(res, 200, rewriteIcdHtml(raw, sid, container, target, false));
    } catch (error) {
      return send(res, 200, layout('ICD Search', currentUser(req), '<div class="card"><h2>ICD search submit kora jacche na.</h2><p class="muted">Search form submit korte problem hocche.</p><a class="btn" href="/app">Back to App</a></div>'));
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/saif-container') {
    const user = requireRole(req, res, ['programmer']); if (!user) return;
    try {
      const body = await readBody(req);
      const result = await lookupSaifContainer(String(body.email || '').trim(), String(body.password || ''), String(body.container || '').trim());
      return jsonResponse(res, result.status || 200, result.ok ? result : { ok: false, error: result.error || 'ICD lookup failed.' });
    } catch (error) {
      return jsonResponse(res, 502, { ok: false, error: 'ICD site theke data ana jacche na.' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/cpa-location') {
    const user = requireRole(req, res, ['programmer']); if (!user) return;
    try {
      const result = await lookupCpaLocation(url.searchParams.get('container'));
      return jsonResponse(res, result.status || 200, result.ok ? result : { ok: false, error: result.error || 'CPA lookup failed.' });
    } catch (error) {
      return jsonResponse(res, 502, { ok: false, error: 'CPA site theke location ana jacche na.' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/dashboard') return redirect(res, '/dashboard');
  if (req.method === 'GET' && url.pathname === '/dashboard') { const user = requireUser(req, res); if (user) send(res, 200, dashboard(user)); return; }
  if (req.method === 'GET' && url.pathname === '/worker') { const user = requireUser(req, res); if (user) send(res, 200, workerPanel(user)); return; }
  if (req.method === 'GET' && url.pathname === '/programmer') { const user = requireRole(req, res, ['admin', 'programmer']); if (user) send(res, 200, programmerPanel(user)); return; }
  if (req.method === 'GET' && url.pathname === '/admin') { const user = requireRole(req, res, ['admin']); if (user) send(res, 200, adminPanel(user)); return; }
  if (req.method === 'POST' && (url.pathname === '/users/create' || url.pathname === '/admin/users')) {
    const user = requireRole(req, res, ['admin', 'programmer']); if (!user) return;
    const body = await readBody(req);
    const next = db();
    const username = String(body.username || '').trim();
    const role = roles.includes(String(body.role)) ? String(body.role) : 'worker';
    const returnTo = String(body.returnTo || (user.role === 'programmer' ? '/programmer' : '/admin'));
    if (!username || next.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return send(res, 400, layout('User Management', user, `<div class="card"><h2>User exists or invalid username.</h2><a class="btn" href="${escapeHtml(returnTo)}">Back</a></div>`));
    next.users.push({ id: Math.max(...next.users.map(u => u.id)) + 1, username, name: String(body.name || username), role, passwordHash: hashPassword(String(body.password || '123456')), createdAt: new Date().toISOString() });
    saveDb(next); audit(user, `created user ${username}`); redirect(res, returnTo); return;
  }
  if (req.method === 'POST' && url.pathname === '/users/reset') {
    const user = requireRole(req, res, ['admin', 'programmer']); if (!user) return;
    const body = await readBody(req);
    const next = db();
    const targetId = Number(body.id);
    const newPassword = String(body.password || '');
    const returnTo = String(body.returnTo || (user.role === 'programmer' ? '/programmer' : '/admin'));
    const target = next.users.find(u => u.id === targetId);
    if (!target || !newPassword) return send(res, 400, layout('User Management', user, `<div class="card"><h2>User not found or password empty.</h2><a class="btn" href="${escapeHtml(returnTo)}">Back</a></div>`));
    target.passwordHash = hashPassword(newPassword);
    target.passwordUpdatedAt = new Date().toISOString();
    saveDb(next); audit(user, `reset password for ${target.username}`); redirect(res, returnTo); return;
  }
  const protectedFiles = {
    '/app': 'index.html', '/index.html': 'index.html', '/note_sheet.html': 'note_sheet.html', '/style.css': 'style.css', '/script.js': 'script.js', '/note_sheet_style.css': 'note_sheet_style.css', '/README.txt': 'README.txt'
  };
  if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
    const fileName = path.basename(url.pathname);
    if (!/^SutonnyCMJ-(Regular|Bold)\.ttf$/i.test(fileName)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const user = requireUser(req, res);
    if (user) serveFile(res, path.join(ROOT, 'fonts', fileName));
    return;
  }
  if (req.method === 'GET' && protectedFiles[url.pathname]) { const user = requireUser(req, res); if (user) serveAppFile(req, res, path.join(ROOT, protectedFiles[url.pathname]), user); return; }
  send(res, 404, layout('Not found', currentUser(req), '<div class="card"><h2>Not found</h2></div>'));
});

function startServer(port = PORT) {
  return httpServer.listen(port, () => {
    console.log(`MAA ASSOCIATES app running at http://localhost:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = { startServer };
