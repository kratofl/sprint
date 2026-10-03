const fs=require('fs'),zlib=require('zlib'),path=require('path');
const html=fs.readFileSync(process.argv[2],'utf8');
const grab=t=>{const o='<script type="__bundler/'+t+'">';const i=html.indexOf(o);if(i<0)return null;const j=html.indexOf('</script>',i);return JSON.parse(html.slice(i+o.length,j))};
const manifest=grab('manifest'),template=grab('template'),order=grab('page_order')||[],ext=grab('ext_resources')||[];
const out=path.dirname(process.argv[1]);
fs.writeFileSync(path.join(out,'template.html'),template);
const ids={};for(const e of ext)ids[e.uuid]=e.id;
for(const [u,e] of Object.entries(manifest)){let b=Buffer.from(e.data,'base64');if(e.compressed)b=zlib.gunzipSync(b);
 const ext2=(e.mime.split('/')[1]||'bin').replace(/[^a-z0-9]/g,'').slice(0,8);
 const name=(order.includes(u)?'page-':'')+u+'.'+ext2;fs.writeFileSync(path.join(out,name),b);
 console.log(name,e.mime,b.length,ids[u]||'');}
console.log('pages',order);
