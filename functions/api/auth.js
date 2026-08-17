import {hashPassword,verifyPassword,hashToken,getUser,json,cookie} from './_auth.js';

export async function onRequestGet({request,env}) {
  const user=await getUser(request,env);
  return json({success:true,user:user?{id:user.id,name:user.name,email:user.email,role:user.role}:null});
}

export async function onRequestPost({request,env}) {
  try {
    const body=await request.json();
    const action=String(body.action||'login');
    if(action==='logout') return new Response(JSON.stringify({success:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie('session','',0)}});

    if(action==='register') {
      const name=String(body.name||'').trim(), email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
      if(!name||!email||password.length<8) return json({success:false,error:'नाम, सही email आ कम-से-कम 8 अक्षरक password जरूरी अछि।'},400);
      const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if(exists) return json({success:false,error:'ई email पहिले सँ registered अछि।'},409);
      const hash=await hashPassword(password);
      const r=await env.DB.prepare(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'reader','active')`).bind(name,email,hash).run();
      const user={id:r.meta.last_row_id,name,email,role:'reader'};
      return await createSession(user,env);
    }

    const email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
    const user=await env.DB.prepare('SELECT id,name,email,password_hash,role,status FROM users WHERE email=? LIMIT 1').bind(email).first();
    if(!user||user.status!=='active'||!(await verifyPassword(password,user.password_hash))) return json({success:false,error:'Email अथवा password गलत अछि।'},401);
    return await createSession(user,env);
  } catch(e){ return json({success:false,error:e.message||'Authentication error'},500); }
}

async function createSession(user,env){
  const token=crypto.randomUUID()+'-'+crypto.randomUUID();
  const tokenHash=await hashToken(token);
  const expires=new Date(Date.now()+7*86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,user.id,expires).run();
  return new Response(JSON.stringify({success:true,user:{id:user.id,name:user.name,email:user.email,role:user.role}}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie('session',token,7*86400)}});
}
