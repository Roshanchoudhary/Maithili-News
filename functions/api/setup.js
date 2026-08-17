import {hashPassword,json} from './_auth.js';

// First-admin setup: allowed only while no admin exists.
// If SETUP_KEY is configured, it is required; otherwise the setup page works without a key.
export async function onRequestPost({request,env}){
  try{
    const adminExists = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
    if(adminExists) return json({success:false,error:'Admin account पहिले सँ बनल अछि।'},409);

    const configuredKey = String(env.SETUP_KEY || '').trim();
    if(configuredKey && request.headers.get('X-Setup-Key') !== configuredKey){
      return json({success:false,error:'Setup key गलत अछि। Cloudflare Production secret check करू।'},401);
    }

    const b=await request.json();
    const name=String(b.name||'').trim();
    const email=String(b.email||'').trim().toLowerCase();
    const password=String(b.password||'');
    if(!name||!email||password.length<8)
      return json({success:false,error:'नाम, सही email आ कम-से-कम 8 अक्षरक password जरूरी अछि।'},400);

    const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if(exists) return json({success:false,error:'ई email पहिले सँ registered अछि।'},409);

    const hash=await hashPassword(password);
    await env.DB.prepare(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'admin','active')`).bind(name,email,hash).run();
    return json({success:true,message:'Admin सफलतापूर्वक बनि गेल।'});
  }catch(e){
    return json({success:false,error:e.message||'Admin setup error'},500);
  }
}

export async function onRequestGet({env}){
  const admin = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
  return json({success:true,setupAvailable:!admin});
}
