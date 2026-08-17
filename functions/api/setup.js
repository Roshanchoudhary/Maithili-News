import {hashPassword,json} from './_auth.js';

/*
 * First-admin setup.
 * The setup endpoint is intentionally available only while the users table is empty.
 * Once the first user exists, setup is permanently closed for this database.
 * SETUP_KEY is optional: if it exists in the environment, it is still accepted as
 * an additional safeguard; if it is absent, the empty-database rule is sufficient.
 */
export async function onRequestPost({request,env}){
  try{
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    const userCount = Number(countRow?.count || 0);

    if (userCount > 0) {
      return json({success:false,error:'Admin setup पहिले सँ बंद अछि। Login करू।'},403);
    }

    const configuredKey = String(env.SETUP_KEY || '').trim();
    if (configuredKey) {
      const suppliedKey = String(request.headers.get('X-Setup-Key') || '').trim();
      if (suppliedKey !== configuredKey) {
        return json({success:false,error:'Invalid setup key'},401);
      }
    }

    const b = await request.json();
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');

    if (!name) return json({success:false,error:'नाम जरूरी अछि।'},400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({success:false,error:'सही email जरूरी अछि।'},400);
    if (password.length < 8) return json({success:false,error:'Password कम-से-कम 8 characters केर हो।'},400);

    const hash = await hashPassword(password);
    await env.DB.prepare(
      `INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'admin','active')`
    ).bind(name,email,hash).run();

    return json({success:true,message:'Admin सफलतापूर्वक तैयार भ गेल। आब Login करू।'});
  } catch(e) {
    return json({success:false,error:e.message || 'Admin setup failed'},500);
  }
}

export async function onRequestGet({env}){
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    const count = Number(row?.count || 0);
    return json({success:true,available:count===0});
  } catch(e) {
    return json({success:false,error:e.message || 'Setup status failed'},500);
  }
}
