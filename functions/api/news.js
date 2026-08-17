import {getUser,isStaff,canManageAll,json} from './_auth.js';

export async function onRequest({request,env}){
  try{
    const url=new URL(request.url), method=request.method, id=url.searchParams.get('id'), slug=url.searchParams.get('slug');
    if(method==='GET') return await getNews(url,request,env);
    const user=await getUser(request,env); if(!user||!isStaff(user)) return json({success:false,error:'Unauthorized'},401);
    if(method==='POST') return await saveNews(null,request,env,user);
    if(method==='PUT') return await saveNews(id,request,env,user);
    if(method==='DELETE'){
      if(!canManageAll(user)) return json({success:false,error:'केवल admin/editor delete करि सकैत छथि।'},403);
      if(!id)return json({success:false,error:'ID जरूरी अछि'},400);
      await env.DB.prepare('DELETE FROM news WHERE id=?').bind(id).run(); return json({success:true});
    }
    return json({success:false,error:'Method not allowed'},405);
  }catch(e){return json({success:false,error:e.message},500)}
}

async function getNews(url,request,env){
  const id=url.searchParams.get('id'), slug=url.searchParams.get('slug'), search=url.searchParams.get('q')||'', status=url.searchParams.get('status'), category=url.searchParams.get('category_slug'), page=Math.max(1,Number(url.searchParams.get('page')||1)), limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit')||12)));
  let where=['n.status=\'published\''], binds=[];
  if(id||slug){where=[]; if(id){where.push('n.id=?');binds.push(id)} else {where.push('n.slug=?');binds.push(slug)}}
  if(status){where=where.filter(x=>x!=="n.status='published'");where.push('n.status=?');binds.push(status)}
  if(category){where.push('c.slug=?');binds.push(category)}
  if(search){where.push('(n.title LIKE ? OR n.summary LIKE ? OR n.content LIKE ?)');const s='%'+search+'%';binds.push(s,s,s)}
  const base=`FROM news n LEFT JOIN categories c ON c.id=n.category_id LEFT JOIN users u ON u.id=n.author_id WHERE ${where.join(' AND ')}`;
  if(id||slug){const row=await env.DB.prepare(`SELECT n.*,c.name category_name,c.slug category_slug,u.name author_name ${base} LIMIT 1`).bind(...binds).first(); if(!row)return json({success:false,error:'समाचार नहि भेटल'},404); if(row.status!=='published') {const user=await getUser(request,env); if(!user||!isStaff(user))return json({success:false,error:'समाचार उपलब्ध नहि अछि'},404);} if(row.status==='published') await env.DB.prepare('UPDATE news SET views=views+1 WHERE id=?').bind(row.id).run(); return json({success:true,news:row});}
  const count=await env.DB.prepare(`SELECT COUNT(*) count ${base}`).bind(...binds).first();
  const rows=(await env.DB.prepare(`SELECT n.id,n.title,n.slug,n.summary,n.image_url,n.status,n.featured,n.views,n.published_at,n.created_at,c.name category_name,c.slug category_slug,u.name author_name ${base} ORDER BY COALESCE(n.published_at,n.created_at) DESC LIMIT ? OFFSET ?`).bind(...binds,limit,(page-1)*limit).all()).results||[];
  return json({success:true,news:rows,total:Number(count?.count||0),page,limit});
}
async function saveNews(id,request,env,user){
  const b=await request.json(), title=String(b.title||'').trim(), slug=String(b.slug||'').trim().toLowerCase(), content=String(b.content||'').trim();
  if(!title||!content||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return json({success:false,error:'Title, content आ English slug जरूरी अछि।'},400);
  const requestedStatus=['draft','review','published','archived'].includes(b.status)?b.status:'draft';
  let status=requestedStatus;
  if(user.role==='author' && status==='published') status='review';
  const categoryId=b.category_id?Number(b.category_id):null;
  if(id){const old=await env.DB.prepare('SELECT author_id FROM news WHERE id=?').bind(id).first();if(!old)return json({success:false,error:'समाचार नहि भेटल'},404);if(user.role==='author'&&Number(old.author_id)!==Number(user.id))return json({success:false,error:'अहाँ केवल अपन समाचार edit करि सकैत छी।'},403);await env.DB.prepare(`UPDATE news SET title=?,slug=?,summary=?,content=?,image_url=?,category_id=?,status=?,featured=?,seo_title=?,seo_description=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(title,slug,String(b.summary||''),content,String(b.image_url||''),categoryId,status,b.featured?1:0,String(b.seo_title||''),String(b.seo_description||''),status,id).run();return json({success:true,id:Number(id),status});}
  const r=await env.DB.prepare(`INSERT INTO news(title,slug,summary,content,image_url,category_id,author_id,status,featured,seo_title,seo_description,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END)`).bind(title,slug,String(b.summary||''),content,String(b.image_url||''),categoryId,user.id,status,b.featured?1:0,String(b.seo_title||''),String(b.seo_description||''),status).run();return json({success:true,id:r.meta.last_row_id,status});
}
