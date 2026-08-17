export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'}, key, 256);
  return `pbkdf2$100000$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const salt = fromHex(parts[2]);
  const iterations = Number(parts[1]);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, key, 256);
  return constantTimeEqual(hex(new Uint8Array(bits)), parts[3]);
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

export async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return null;
  const tokenHash = await hashToken(decodeURIComponent(m[1]));
  const row = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.status='active' LIMIT 1`).bind(tokenHash).first();
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
    return null;
  }
  return row;
}

export function isStaff(user) { return !!user && ['admin','editor','author'].includes(user.role); }
export function canManageAll(user) { return !!user && ['admin','editor'].includes(user.role); }
export function json(data, status=200, extra={}) {
  const h = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});
  return new Response(JSON.stringify(data), {status,headers:h});
}
export function cookie(name,value,maxAge) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function hex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function fromHex(s){const a=new Uint8Array(s.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a;}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
