import {hashPassword,json} from './_auth.js';
export async function onRequestPost({request,env}){
  try{
    if(request.headers.get('X-Setup-Key')!==env.SETUP_KEY) return json({success:false,error:'Invalid setup key'},401);
    const b=await request.json(), name=String(b.name||'Admin').trim(), email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
    if(!email||password.length<8)return json({success:false,error:'Email आ कम-से-कम 8 अक्षरक password जरूरी अछि।'},400);
    const hash=await hashPassword(password);
    const old=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if(old) await env.DB.prepare(`UPDATE users SET name=?,password_hash=?,role='admin',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,hash,old.id).run();
    else await env.DB.prepare(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'admin','active')`).bind(name,email,hash).run();
    return json({success:true,message:'Admin तैयार अछि।'});
  }catch(e){return json({success:false,error:e.message},500)}
}
