import {getUser,isStaff,canManageAll,json} from './_auth.js';

export async function onRequest({request,env}){
  try{
    const url=new URL(request.url), method=request.method, id=url.searchParams.get('id'), slug=url.searchParams.get('slug');
    if(method==='GET') return await getNews(url,request,env);
    const user=await getUser(request,env); if(!user||!isStaff(user)) return json({success:false,error:'Unauthorized'},401);
    if(method==='POST'){
      if(url.searchParams.get('bulk')==='1') return await bulkSaveNews(request,env,user);
      return await saveNews(null,request,env,user);
    }
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


async function bulkSaveNews(request, env, user){
  if(user.role==='author'){
    return json({success:false,error:'Bulk upload केवल admin/editor लेल उपलब्ध अछि।'},403);
  }

  const body=await request.json();
  const rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length) return json({success:false,error:'Upload file में news नहि अछि।'},400);
  if(rows.length>500) return json({success:false,error:'एक बेर में अधिकतम 500 news upload करू।'},400);

  const catResult=await env.DB.prepare(
    `SELECT id,name,slug FROM categories WHERE status='active'`
  ).all();
  const categories=catResult.results||[];
  const catMap=new Map();
  for(const c of categories){
    catMap.set(String(c.id).toLowerCase(), Number(c.id));
    catMap.set(String(c.name).trim().toLowerCase(), Number(c.id));
    catMap.set(String(c.slug).trim().toLowerCase(), Number(c.id));
  }

  const imported=[];
  const errors=[];
  const seen=new Set();

  for(let i=0;i<rows.length;i++){
    const r=rows[i]||{};
    const rowNo=Number(r._row)||i+2;
    const title=String(r.title||'').trim();
    const content=String(r.content||'').trim();
    if(!title || !content){
      errors.push({row:rowNo,error:'title और content जरूरी अछि।'});
      continue;
    }

    let slug=String(r.slug||'').trim().toLowerCase();
    if(!slug){
      slug='news-'+Date.now().toString(36)+'-'+(i+1);
    }
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
      errors.push({row:rowNo,error:'slug केवल English letters, numbers और hyphen में हो।'});
      continue;
    }

    // Prevent duplicate slugs inside the same upload.
    const originalSlug=slug;
    let suffix=1;
    while(seen.has(slug)) slug=originalSlug+'-'+(++suffix);
    seen.add(slug);

    const status0=String(r.status||'draft').trim().toLowerCase();
    const allowed=['draft','review','published','archived'];
    if(!allowed.includes(status0)){
      errors.push({row:rowNo,error:'status केवल draft/review/published/archived हो।'});
      continue;
    }
    let status=status0;
    if(user.role==='author' && status==='published') status='review';

    let categoryId=null;
    const cat=String(r.category||r.category_slug||r.category_id||'').trim().toLowerCase();
    if(cat){
      categoryId=catMap.get(cat)||null;
      if(!categoryId){
        errors.push({row:rowNo,error:`Category नहि भेटल: ${r.category}`});
        continue;
      }
    }

    const featured=['1','true','yes','हाँ','हां'].includes(String(r.featured||'').trim().toLowerCase())?1:0;

    imported.push({
      row:rowNo,title,slug,
      summary:String(r.summary||'').trim(),
      content,
      image_url:String(r.image_url||r.image||'').trim(),
      category_id:categoryId,
      author_id:Number(user.id),
      status,
      featured,
      seo_title:String(r.seo_title||'').trim(),
      seo_description:String(r.seo_description||'').trim()
    });
  }

  // Check existing slugs so one bad duplicate does not stop the whole upload.
  for(let i=imported.length-1;i>=0;i--){
    const x=imported[i];
    const old=await env.DB.prepare('SELECT id FROM news WHERE slug=? LIMIT 1').bind(x.slug).first();
    if(old){
      errors.push({row:x.row,error:`Slug पहले सँ मौजूद अछि: ${x.slug}`});
      imported.splice(i,1);
    }
  }

  let success=0;
  for(const x of imported){
    try{
      await env.DB.prepare(`
        INSERT INTO news(
          title,slug,summary,content,image_url,category_id,author_id,status,
          featured,seo_title,seo_description,published_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END)
      `).bind(
        x.title,x.slug,x.summary,x.content,x.image_url,x.category_id,x.author_id,
        x.status,x.featured,x.seo_title,x.seo_description,x.status
      ).run();
      success++;
    }catch(e){
      errors.push({row:x.row,error:e.message||'Database error'});
    }
  }

  return json({
    success:true,
    imported:success,
    failed:errors.length,
    total:rows.length,
    errors
  });
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
