const SB='https://dydcfbpyjljezzrcfllf.supabase.co';
const SK='sb_publishable_ptOR937-AB9mbAcv6KjtDQ_MgpHsgH3';
const HD={'apikey':SK,'Authorization':'Bearer '+SK,'Content-Type':'application/json','Prefer':'return=representation'};

let houses=[], expenses=[], revenues=[], markers={}, map=null;
let editHId=null, editEId=null, editRId=null, tempLL=null;
let catF='all', revF='all', dateF='all', searchQ='', specificDate='';

// ─── API ────────────────────────────────────────────────────────────────────
async function api(table,method='GET',body=null,q=''){
  const r=await fetch(`${SB}/rest/v1/${table}${q}`,{method,headers:HD,body:body?JSON.stringify(body):undefined});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Object.assign(new Error(e.message||r.statusText),{code:e.code});}
  return r.status===204?null:r.json();
}

async function loadAll(){
  try{
    [houses,expenses]=await Promise.all([
      api('houses','GET',null,'?select=*&order=visitdate.desc'),
      api('expenses','GET',null,'?select=*&order=date.desc')
    ]);
  }catch(e){
    if(e.code==='PGRST301'||e.message?.includes('permission')) showRLS();
    else toast('Erro ao carregar: '+e.message);
    return;
  }
  try{
    revenues=await api('revenues','GET',null,'?select=*&order=date.desc');
    document.getElementById('notice').classList.remove('show');
  }catch(e){
    revenues=[];
    if(e.code==='42P01') showNotice();
  }
  refresh();
}

function refresh(){renderMarkers();renderRevenues();renderExpenses();renderMovimentos();renderSummary();updateHdr();}

// ─── MAP ────────────────────────────────────────────────────────────────────
const SC={'Por Visitar':'#9e9e9e','Visitada':'#1565c0','Doou':'#2e7d32','Ausente':'#e65100','Recusou':'#b71c1c'};
function mkIcon(st){
  const c=SC[st]||'#9e9e9e';
  return L.divIcon({html:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="24" height="34"><path d="M12 1C7.03 1 3 5.03 3 10c0 6 9 22 9 22s9-16 9-22C21 5.03 16.97 1 12 1z" fill="${c}" stroke="white" stroke-width="1.8"/><circle cx="12" cy="10" r="4" fill="white" opacity=".85"/></svg>`,className:'',iconSize:[24,34],iconAnchor:[12,34]});
}
function initMap(){
  map=L.map('map').setView([40.8667,-7.7333],16);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri © DigitalGlobe',maxZoom:19}).addTo(map);
  map.on('click',e=>{tempLL=e.latlng;editHId=null;openHmod(null);});
}
function renderMarkers(){
  Object.values(markers).forEach(m=>map.removeLayer(m));
  markers={};
  houses.forEach(h=>{
    const m=L.marker([h.lat,h.lng],{icon:mkIcon(h.status)}).addTo(map);
    m.on('click',()=>openHmod(h));
    markers[h.id]=m;
  });
}

// ─── HOUSE MODAL ────────────────────────────────────────────────────────────
function openHmod(h){
  editHId=h?h.id:null;
  g('hmtitle').textContent=h?'🏠 Editar Casa':'📍 Nova Casa';
  g('hname').value=h?(h.name||''):'';
  g('haddr').value=h?(h.address||''):'';
  g('hest').value=h?h.status:'Visitada';
  g('hval').value=h?(h.duevalue||''):'';
  g('hnotes').value=h?(h.notes||''):'';
  g('hdelrow').style.display=h?'block':'none';
  toggleHVal();
  g('hmod').classList.add('open');
}
function toggleHVal(){g('vgrp').style.display=g('hest').value==='Doou'?'block':'none';}
g('hest').addEventListener('change',toggleHVal);
g('hcancel').addEventListener('click',()=>{g('hmod').classList.remove('open');tempLL=null;});
g('hsave').addEventListener('click',async()=>{
  const name=g('hname').value.trim(),address=g('haddr').value.trim(),status=g('hest').value;
  const duevalue=parseFloat(g('hval').value)||0,notes=g('hnotes').value.trim();
  const p={name,address,status,duevalue:status==='Doou'?duevalue:0,notes};
  try{
    if(editHId){
      const r=await api('houses','PATCH',p,`?id=eq.${editHId}`);
      const i=houses.findIndex(h=>h.id===editHId);if(i>=0&&r?.[0])houses[i]=r[0];
      toast('Casa atualizada ✓');
    }else{
      if(!tempLL)return;
      const r=await api('houses','POST',{...p,lat:tempLL.lat,lng:tempLL.lng});
      if(r?.[0])houses.unshift(r[0]);
    }
    g('hmod').classList.remove('open');tempLL=null;
    renderMarkers();renderMovimentos();renderSummary();updateHdr();
  }catch(e){toast('Erro: '+e.message);}
});
g('hdel').addEventListener('click',async()=>{
  if(!editHId||!confirm('Eliminar esta casa?'))return;
  try{
    await api('houses','DELETE',null,`?id=eq.${editHId}`);
    houses=houses.filter(h=>h.id!==editHId);
    g('hmod').classList.remove('open');
    renderMarkers();renderMovimentos();renderSummary();updateHdr();toast('Eliminado ✓');
  }catch(e){toast('Erro: '+e.message);}
});

// ─── REVENUE MODAL ──────────────────────────────────────────────────────────
function toggleRType(){
  const t=g('rtype').value;
  g('rcomf').style.display=t==='Comércio'?'block':'none';
  g('rrifaf').style.display=t==='Rifas'?'block':'none';
  g('rgenf').style.display=(t==='Atividades'||t==='Bar')?'block':'none';
}
g('rtype').addEventListener('change',toggleRType);
function calcRifaTotal(){
  const q=parseFloat(g('rqty').value)||0,p=parseFloat(g('rprice').value)||0;
  if(q>0&&p>0)g('rvalue').value=(q*p).toFixed(2);
}
g('rqty').addEventListener('input',calcRifaTotal);
g('rprice').addEventListener('input',calcRifaTotal);

function openRmod(rev){
  editRId=rev?rev.id:null;
  g('rmtitle').textContent=rev?'✏️ Editar Receita':'💰 Nova Receita';
  const t=rev?(rev.type||'Comércio'):'Comércio';
  g('rtype').value=t;
  g('rname').value=t==='Comércio'?(rev?.name||''):'';
  const subs=(rev?.subtype||'').split(',').map(s=>s.trim());
  g('sub_cartao').checked=subs.includes('Cartão no Cartaz');
  g('sub_lona').checked=subs.includes('Lona');
  g('sub_outro').checked=subs.includes('Outro');
  g('rdesc').value=t==='Rifas'?(rev?.name||''):'';
  g('rgendesc').value=(t==='Atividades'||t==='Bar')?(rev?.name||''):'';
  g('rqty').value=rev?(rev.quantity||''):'';
  g('rprice').value='';
  g('rvalue').value=rev?(rev.value||''):'';
  g('rnotes').value=rev?(rev.notes||''):'';
  g('rdelrow').style.display=rev?'block':'none';
  toggleRType();
  g('rmod').classList.add('open');
}
window.openRmod=openRmod;
window.openRevById=id=>openRmod(revenues.find(r=>r.id===id));

g('rcancel').addEventListener('click',()=>g('rmod').classList.remove('open'));
g('rsave').addEventListener('click',async()=>{
  const type=g('rtype').value;
  const value=parseFloat(g('rvalue').value);
  if(isNaN(value)||value<0){toast('Valor inválido');return;}
  let p={type,value,notes:g('rnotes').value.trim()};
  if(type==='Comércio'){
    const name=g('rname').value.trim();
    if(!name){toast('Preenche o nome do estabelecimento');return;}
    const sels=['sub_cartao','sub_lona','sub_outro'].filter(id=>g(id).checked).map(id=>g(id).value);
    p.name=name;p.subtype=sels.length?sels.join(', '):null;p.quantity=null;
  }else if(type==='Rifas'){
    const name=g('rdesc').value.trim();
    if(!name){toast('Preenche a descrição');return;}
    p.name=name;p.subtype=null;p.quantity=parseInt(g('rqty').value)||null;
  }else{
    const name=g('rgendesc').value.trim();
    if(!name){toast('Preenche a descrição');return;}
    p.name=name;p.subtype=null;p.quantity=null;
  }
  try{
    if(editRId){
      const r=await api('revenues','PATCH',p,`?id=eq.${editRId}`);
      const i=revenues.findIndex(x=>x.id===editRId);if(i>=0&&r?.[0])revenues[i]=r[0];
      toast('Receita atualizada ✓');
    }else{
      const r=await api('revenues','POST',p);if(r?.[0])revenues.unshift(r[0]);
    }
    g('rmod').classList.remove('open');
    renderRevenues();renderMovimentos();renderSummary();updateHdr();
  }catch(e){toast('Erro: '+e.message);}
});
g('rdel').addEventListener('click',async()=>{
  if(!editRId||!confirm('Eliminar esta receita?'))return;
  try{
    await api('revenues','DELETE',null,`?id=eq.${editRId}`);
    revenues=revenues.filter(r=>r.id!==editRId);
    g('rmod').classList.remove('open');
    renderRevenues();renderMovimentos();renderSummary();updateHdr();toast('Eliminado ✓');
  }catch(e){toast('Erro: '+e.message);}
});

// ─── RENDER RECEITAS ────────────────────────────────────────────────────────
function renderRevenues(){
  const fl=revF==='all'?revenues:revenues.filter(r=>r.type===revF);
  const el=g('rlist');
  if(!fl.length){el.innerHTML=`<div class="sp">Nenhuma receita${revF!=='all'?' nesta categoria':''}.<br><small>Usa o + para adicionar.</small></div>`;return;}
  const tot=fl.reduce((s,r)=>s+(r.value||0),0);
  el.innerHTML=`
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;color:var(--sub)">Total${revF!=='all'?' ('+revF+')':''}</span>
      <span style="font-size:20px;font-weight:800;color:var(--ok)">+${tot.toFixed(2)}€</span>
    </div></div>
    ${fl.map(r=>`
      <div class="card" style="cursor:pointer" onclick="openRevById('${r.id}')">
        <div class="ch">
          <div><div class="ct">${esc(r.name)}</div>
          <div class="cs">${r.type}${r.subtype?' · '+r.subtype:''}${r.quantity?' · '+r.quantity+' rifas':''} · ${fdate(r.date)}</div></div>
          <div style="font-size:16px;font-weight:800;color:var(--ok)">+${(r.value||0).toFixed(2)}€</div>
        </div>
      </div>`).join('')}
    <div style="height:72px"></div>`;
}
g('rfbar').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(!c)return;
  revF=c.dataset.r;
  document.querySelectorAll('#rfbar .chip').forEach(x=>x.classList.toggle('active',x===c));
  renderRevenues();
});
g('addrbtn').addEventListener('click',()=>openRmod(null));

// ─── RENDER DESPESAS ────────────────────────────────────────────────────────
function renderExpenses(){
  const fl=catF==='all'?expenses:expenses.filter(e=>e.category===catF);
  const el=g('elist');
  if(!fl.length){el.innerHTML=`<div class="sp">Nenhuma despesa${catF!=='all'?' nesta categoria':''}.<br><small>Usa o + para adicionar.</small></div>`;return;}
  const tot=fl.reduce((s,e)=>s+(e.value||0),0);
  el.innerHTML=`
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;color:var(--sub)">Total${catF!=='all'?' ('+catF+')':''}</span>
      <span style="font-size:20px;font-weight:800;color:var(--err)">-${tot.toFixed(2)}€</span>
    </div></div>
    ${fl.map(e=>`
      <div class="card" style="cursor:pointer" onclick="oem('${e.id}')">
        <div class="ch">
          <div><div class="ct">${esc(e.description)}</div><div class="cs">${e.category} · ${fdate(e.date)}</div></div>
          <div style="font-size:16px;font-weight:800;color:var(--err)">-${(e.value||0).toFixed(2)}€</div>
        </div>
      </div>`).join('')}
    <div style="height:72px"></div>`;
}
function oem(id){
  const e=expenses.find(x=>x.id===id);editEId=id;
  g('emtitle').textContent='✏️ Editar Despesa';
  g('edesc').value=e.description;g('eval').value=e.value;g('ecat').value=e.category;
  g('edelrow').style.display='block';g('emod').classList.add('open');
}
window.oem=oem;
g('addbtn').addEventListener('click',()=>{
  editEId=null;g('emtitle').textContent='💸 Nova Despesa';
  g('edesc').value='';g('eval').value='';g('ecat').value='Material';
  g('edelrow').style.display='none';g('emod').classList.add('open');
});
g('ecancel').addEventListener('click',()=>g('emod').classList.remove('open'));
g('esave').addEventListener('click',async()=>{
  const description=g('edesc').value.trim(),value=parseFloat(g('eval').value),category=g('ecat').value;
  if(!description){toast('Preenche a descrição');return;}
  if(isNaN(value)||value<0){toast('Valor inválido');return;}
  try{
    if(editEId){
      const r=await api('expenses','PATCH',{description,value,category},`?id=eq.${editEId}`);
      const i=expenses.findIndex(e=>e.id===editEId);if(i>=0&&r?.[0])expenses[i]=r[0];
      toast('Despesa atualizada ✓');
    }else{
      const r=await api('expenses','POST',{description,value,category});if(r?.[0])expenses.unshift(r[0]);
    }
    g('emod').classList.remove('open');renderExpenses();renderMovimentos();renderSummary();updateHdr();
  }catch(e){toast('Erro: '+e.message);}
});
g('edel').addEventListener('click',async()=>{
  if(!editEId||!confirm('Eliminar esta despesa?'))return;
  try{
    await api('expenses','DELETE',null,`?id=eq.${editEId}`);
    expenses=expenses.filter(e=>e.id!==editEId);
    g('emod').classList.remove('open');renderExpenses();renderMovimentos();renderSummary();updateHdr();toast('Eliminado ✓');
  }catch(e){toast('Erro: '+e.message);}
});
g('cfbar').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(!c)return;
  catF=c.dataset.c;
  document.querySelectorAll('#cfbar .chip').forEach(x=>x.classList.toggle('active',x===c));
  renderExpenses();
});

// ─── MOVIMENTOS ─────────────────────────────────────────────────────────────
function buildAll(){
  const all=[];
  houses.filter(h=>h.status==='Doou').forEach(h=>all.push({
    id:h.id,src:'house',icon:'🏠',label:'Peditório Normal',
    name:h.name||h.address||'Sem nome',sub:h.address||'',
    value:+(h.duevalue||0),date:h.visitdate
  }));
  const rIcon={'Comércio':'🏪','Atividades':'🎭','Bar':'🍺','Rifas':'🎟️'};
  revenues.forEach(r=>all.push({
    id:r.id,src:'revenue',icon:rIcon[r.type]||'💰',
    label:r.type+(r.subtype?' · '+r.subtype:'')+(r.quantity?' · '+r.quantity+' rifas':''),
    name:r.name||'',sub:'',value:+(r.value||0),date:r.date
  }));
  expenses.forEach(e=>all.push({
    id:e.id,src:'expense',icon:'💸',label:e.category,
    name:e.description||'',sub:'',value:-(e.value||0),date:e.date
  }));
  return all.sort((a,b)=>new Date(b.date)-new Date(a.date));
}

function applyFilters(all){
  let fl=all;
  if(searchQ){const q=searchQ.toLowerCase();fl=fl.filter(m=>(m.name+m.label+m.sub).toLowerCase().includes(q));}
  if(dateF==='receitas') fl=fl.filter(m=>m.value>0);
  else if(dateF==='despesas') fl=fl.filter(m=>m.value<0);
  if(specificDate){
    fl=fl.filter(m=>m.date&&m.date.slice(0,10)===specificDate);
  } else if(dateF!=='all'&&dateF!=='receitas'&&dateF!=='despesas'){
    const now=new Date(),s=new Date();
    if(dateF==='today'){s.setHours(0,0,0,0);}
    else if(dateF==='week'){s.setDate(now.getDate()-now.getDay());s.setHours(0,0,0,0);}
    else if(dateF==='month'){s.setDate(1);s.setHours(0,0,0,0);}
    fl=fl.filter(m=>new Date(m.date)>=s);
  }
  return fl;
}

function renderMovimentos(){
  const fl=applyFilters(buildAll());
  const el=g('mlist');
  if(!fl.length){el.innerHTML=`<div class="sp">Nenhum movimento encontrado.</div>`;return;}
  const totR=fl.filter(m=>m.value>0).reduce((s,m)=>s+m.value,0);
  const totD=fl.filter(m=>m.value<0).reduce((s,m)=>s+Math.abs(m.value),0);
  el.innerHTML=`
    <div class="card" style="margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:center">
        <div><div style="font-size:16px;font-weight:800;color:var(--ok)">+${totR.toFixed(2)}€</div><div style="font-size:11px;color:var(--sub)">Receitas</div></div>
        <div><div style="font-size:16px;font-weight:800;color:var(--err)">-${totD.toFixed(2)}€</div><div style="font-size:11px;color:var(--sub)">Despesas</div></div>
      </div>
    </div>
    ${fl.map(m=>`
      <div class="mitem" onclick="openMov('${m.id}','${m.src}')">
        <div class="mico">${m.icon}</div>
        <div class="mbody">
          <div class="mname">${esc(m.name||'—')}</div>
          <div class="msub">${esc(m.label)}</div>
        </div>
        <div class="mright">
          <div class="mval" style="color:${m.value>=0?'var(--ok)':'var(--err)'}">${m.value>=0?'+':''}${m.value.toFixed(2)}€</div>
          <div class="mdate">${fdate(m.date)}</div>
        </div>
      </div>`).join('')}
    <div style="height:16px"></div>`;
}

function openMov(id,src){
  if(src==='house')openHmod(houses.find(h=>h.id===id));
  else if(src==='revenue')openRmod(revenues.find(r=>r.id===id));
  else oem(id);
}
window.openMov=openMov;

g('msearch').addEventListener('input',e=>{searchQ=e.target.value.trim();renderMovimentos();});
g('mdate').addEventListener('change',e=>{
  specificDate=e.target.value;
  g('mdateclear').style.display=specificDate?'inline':'none';
  renderMovimentos();
});
g('mdateclear').addEventListener('click',()=>{
  specificDate='';g('mdate').value='';g('mdateclear').style.display='none';
  renderMovimentos();
});
g('mfbar').addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(!c)return;
  dateF=c.dataset.d;
  document.querySelectorAll('#mfbar .chip').forEach(x=>x.classList.toggle('active',x===c));
  renderMovimentos();
});

// ─── RESUMO ─────────────────────────────────────────────────────────────────
function renderSummary(){
  const rPed=houses.filter(h=>h.status==='Doou').reduce((s,h)=>s+(h.duevalue||0),0);
  const rCom=revenues.filter(r=>r.type==='Comércio').reduce((s,r)=>s+(r.value||0),0);
  const rAtv=revenues.filter(r=>r.type==='Atividades').reduce((s,r)=>s+(r.value||0),0);
  const rBar=revenues.filter(r=>r.type==='Bar').reduce((s,r)=>s+(r.value||0),0);
  const rRif=revenues.filter(r=>r.type==='Rifas').reduce((s,r)=>s+(r.value||0),0);
  const totR=rPed+rCom+rAtv+rBar+rRif,totD=expenses.reduce((s,e)=>s+(e.value||0),0),saldo=totR-totD;
  g('sgrid').innerHTML=`
    <div class="sc" style="grid-column:1/-1"><div class="sv ${saldo>=0?'gp':'rp'}">${saldo>=0?'+':''}${saldo.toFixed(2)}€</div><div class="sl">Saldo Atual</div></div>
    <div class="sc"><div class="sv" style="color:var(--ok)">${totR.toFixed(2)}€</div><div class="sl">Total Receitas</div></div>
    <div class="sc"><div class="sv" style="color:var(--err)">${totD.toFixed(2)}€</div><div class="sl">Total Despesas</div></div>
    <div class="sc"><div class="sv">${rPed.toFixed(2)}€</div><div class="sl">🏠 Peditório</div></div>
    <div class="sc"><div class="sv">${rCom.toFixed(2)}€</div><div class="sl">🏪 Comércio</div></div>
    <div class="sc"><div class="sv">${rAtv.toFixed(2)}€</div><div class="sl">🎭 Atividades</div></div>
    <div class="sc"><div class="sv">${rBar.toFixed(2)}€</div><div class="sl">🍺 Bar</div></div>
    <div class="sc"><div class="sv">${rRif.toFixed(2)}€</div><div class="sl">🎟️ Rifas</div></div>
    <div class="sc"><div class="sv">${houses.filter(h=>h.status==='Doou').length}</div><div class="sl">Casas doaram</div></div>
    <div class="sc"><div class="sv">${revenues.filter(r=>r.type==='Comércio').length}</div><div class="sl">Estabelecimentos</div></div>
  `;
  const emap={'Doou':'🟢','Visitada':'🔵','Ausente':'🟠','Recusou':'🔴','Por Visitar':'⚪'};
  g('sbreak').innerHTML=`<div class="stitle" style="margin-top:0">Casas por Estado</div>
    ${['Doou','Visitada','Ausente','Recusou','Por Visitar'].map(s=>`
      <div class="srow"><span>${emap[s]} ${s}</span><span style="font-weight:800">${houses.filter(h=>h.status===s).length}</span></div>`).join('')}`;
  const cats={};
  expenses.forEach(e=>{cats[e.category]=(cats[e.category]||0)+e.value;});
  g('cbreak').innerHTML=`<div class="stitle" style="margin-top:0">Despesas por Categoria</div>
    ${Object.keys(cats).length?Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`
      <div class="srow"><span>${c}</span><span style="font-weight:800;color:var(--err)">-${v.toFixed(2)}€</span></div>`).join('')
    :'<div style="color:var(--sub);font-size:13px;padding:6px 0">Nenhuma despesa ainda.</div>'}`;
}

// ─── TABS ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.nb').forEach(b=>b.addEventListener('click',()=>{
  const t=b.dataset.t;
  document.querySelectorAll('.nb').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tp').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');g('tab-'+t).classList.add('active');
  if(t==='map')setTimeout(()=>map?.invalidateSize(),60);
}));

// ─── HEADER ─────────────────────────────────────────────────────────────────
function updateHdr(){
  const totR=houses.filter(h=>h.status==='Doou').reduce((s,h)=>s+(h.duevalue||0),0)
            +revenues.reduce((s,r)=>s+(r.value||0),0);
  const totD=expenses.reduce((s,e)=>s+(e.value||0),0);
  const s=totR-totD;
  g('hsaldo').textContent=`${s>=0?'+':''}${s.toFixed(2)}€`;
  g('hsaldo').style.color=s>=0?'#69f0ae':'#ff5252';
  g('hsub').textContent=`${houses.length} casas · ${totR.toFixed(2)}€ receitas`;
}

// ─── NOTICES ────────────────────────────────────────────────────────────────
function showNotice(){
  g('nsql').textContent=`CREATE TABLE revenues (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  type text NOT NULL,\n  name text,\n  subtype text,\n  quantity int,\n  value numeric NOT NULL DEFAULT 0,\n  date timestamp DEFAULT now(),\n  notes text\n);\nALTER TABLE revenues DISABLE ROW LEVEL SECURITY;`;
  g('notice').classList.add('show');document.querySelector('[data-t="resumo"]').click();
  toast('Cria a tabela revenues no Supabase!');
}
function showRLS(){
  g('nsql').textContent=`ALTER TABLE houses   DISABLE ROW LEVEL SECURITY;\nALTER TABLE expenses DISABLE ROW LEVEL SECURITY;\nALTER TABLE revenues DISABLE ROW LEVEL SECURITY;`;
  g('notice').classList.add('show');document.querySelector('[data-t="resumo"]').click();
}

// ─── UTILS ──────────────────────────────────────────────────────────────────
function g(id){return document.getElementById(id);}
function fdate(d){return d?new Date(d).toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'2-digit'}):''}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toast(m){const t=g('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}

window.addEventListener('load',()=>{initMap();loadAll();});
