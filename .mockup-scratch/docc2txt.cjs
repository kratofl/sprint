const fs=require('fs');
const inl=(a=[])=>a.map(n=>n.type==='text'?n.text:n.type==='codeVoice'?n.code:n.inlineContent?inl(n.inlineContent):n.type==='reference'?(n.title||n.identifier.split('/').pop()):'').join('');
function blk(b,d=''){ if(!b) return ''; return b.map(x=>{switch(x.type){
 case 'heading': return '\n'+'#'.repeat(x.level)+' '+x.text+'\n';
 case 'paragraph': return d+inl(x.inlineContent)+'\n';
 case 'unorderedList': case 'orderedList': return x.items.map(i=>d+'- '+blk(i.content,'').trim()).join('\n')+'\n';
 case 'aside': return d+'> ['+(x.name||x.style)+'] '+blk(x.content,'').trim()+'\n';
 case 'table': return x.rows.map(r=>'| '+r.map(c=>blk(c,'').trim().replace(/\n/g,' ')).join(' | ')+' |').join('\n')+'\n';
 case 'row': return x.columns.map(c=>blk(c.content,d)).join('');
 case 'tabNavigator': return x.tabs.map(t=>d+'['+t.title+']\n'+blk(t.content,d)).join('');
 default: return x.content?blk(x.content,d):'';}}).join('');}
for (const f of process.argv.slice(2)){const j=JSON.parse(fs.readFileSync(f));let out='# '+(j.metadata&&j.metadata.title)+'\n'+(j.abstract?inl(j.abstract):'')+'\n';for(const s of j.primaryContentSections||[]) out+=blk(s.content);fs.writeFileSync(f.replace('.json','.txt'),out);}
