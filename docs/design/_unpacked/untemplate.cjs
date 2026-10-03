const fs=require('fs'),zlib=require('zlib');
const names={'e6de40c7-521d-4849-b978-d76da4511864':'web-light','7fe9c1f1-c477-4cee-8e46-e60e23b7c2bc':'web-dark','8d858887-124b-4c13-b92f-135f6c62b06f':'windows-light','35c2845a-fae9-4e00-b6be-1a538f200e11':'windows-dark','b9200762-41a7-4e6a-a22f-5e02885b2c83':'components-web','6e805f48-c80a-4f26-847b-94ac753a49e8':'web-sheet-neue-ausgabe','fab391aa-26cc-41b8-a3a0-16f74ae52c35':'rules-neue-buchung','04f8b237-cf37-48f7-bd4d-990d65f4e94e':'macos-light'};
fs.mkdirSync('pages',{recursive:true});
for(const [u,n] of Object.entries(names)){const html=fs.readFileSync('page-'+u+'.html','utf8');
 const grab=t=>{const o='<script type="__bundler/'+t+'">';const i=html.indexOf(o);if(i<0)return null;const j=html.indexOf('</script>',i);return JSON.parse(html.slice(i+o.length,j))};
 let tpl=grab('template');const man=grab('manifest')||{};
 const assets=[];for(const [id,e] of Object.entries(man)){assets.push(id+' '+e.mime);
   if(/font/.test(e.mime)){let b=Buffer.from(e.data,'base64');if(e.compressed)b=zlib.gunzipSync(b);tpl=tpl.split(id).join('data:'+e.mime+';base64,'+b.toString('base64'));}
   else if(/image|svg/.test(e.mime)){let b=Buffer.from(e.data,'base64');if(e.compressed)b=zlib.gunzipSync(b);tpl=tpl.split(id).join('data:'+e.mime+';base64,'+b.toString('base64'));}}
 fs.writeFileSync('pages/'+n+'.html',tpl);
 const readable=tpl.replace(/data:[a-z\/+.-]+;base64,[A-Za-z0-9+\/=]+/g,'DATA');
 fs.writeFileSync('pages/'+n+'.readable.html',readable);
 console.log(n,tpl.length,readable.length,assets.join(', '));}
