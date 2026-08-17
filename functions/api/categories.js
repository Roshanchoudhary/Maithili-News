import {getUser,isStaff,canManageAll,json} from './_auth.js';
export async function onRequest({request,env}){
  try{
    const method=request.method, url=new URL(request.url), id=url.searchParams.get('id');
    if(method==='GET'){
      const rows=(await env.DB.prepare(`SELECT c.*,p.name parent_name,p.slug parent_slug FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.status='active' ORDER BY COALESCE(c.parent_id,0),c.menu_order,c.name`).all()).results||[];
      return json({success:true,categories:rows});
    }
    const user=await getUser(request,env); if(!user||!isStaff(user)) return json({success:false,error:'Unauthorized'},401);
    if(method==='POST'||method==='PUT'){
      const b=await request.json(), name=String(b.name||'').trim(), slug=String(b.slug||'').trim().toLowerCase(), parentId=b.parent_id?Number(b.parent_id):null;
      if(!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({success:false,error:'नाम आ English slug जरूरी अछि।'},400);
      if(parentId && id && Number(parentId)===Number(id)) return json({success:false,error:'Category अपन parent नहि भ' सकैत अछि।'},400);
      if(method==='POST') await env.DB.prepare(`INSERT INTO categories(name,slug,parent_id,description,menu_visible,menu_order,status) VALUES(?,?,?,?,?,?, 'active')`).bind(name,slug,parentId,String(b.description||''),b.menu_visible===false?0:1,Number(b.menu_order||0)).run();
      else {if(!id)return json({success:false,error:'ID जरूरी अछि'},400); await env.DB.prepare(`UPDATE categories SET name=?,slug=?,parent_id=?,description=?,menu_visible=?,menu_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,slug,parentId,String(b.description||''),b.menu_visible===false?0:1,Number(b.menu_order||0),id).run();}
      return json({success:true});
    }
    if(method==='DELETE'){
      if(!canManageAll(user)) return json({success:false,error:'केवल admin/editor delete करि सकैत छथि।'},403);
      if(!id)return json({success:false,error:'ID जरूरी अछि'},400);
      await env.DB.prepare('UPDATE categories SET status=\'inactive\' WHERE id=?').bind(id).run();
      return json({success:true});
    }
    return json({success:false,error:'Method not allowed'},405);
  }catch(e){return json({success:false,error:e.message},500)}
}
