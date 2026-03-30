const CFG = window.MARLETTA_CONFIG || {};

function normalizeText(v){return String(v ?? '').trim();}
function normalizeBool(v){return ['да','yes','true','1'].includes(normalizeText(v).toLowerCase());}
function toNumber(v){const n=Number(String(v ?? '').replace(/\s+/g,'').replace(',', '.'));return Number.isFinite(n)?n:0;}
function formatPrice(num){return `${num.toFixed(2).replace(/\.00$/, ',00').replace('.', ',')} ${CFG.ui?.currency || 'лв.'}`;}

function csvToObjects(text){
  const rows=[]; let row=[]; let value=''; let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const char=text[i], next=text[i+1];
    if(char==='"'){
      if(inQuotes && next==='"'){ value+='"'; i++; }
      else inQuotes=!inQuotes;
    } else if(char===',' && !inQuotes){ row.push(value); value=''; }
    else if((char==='\n' || char==='\r') && !inQuotes){ if(char==='\r' && next==='\n') i++; row.push(value); rows.push(row); row=[]; value=''; }
    else value+=char;
  }
  if(value.length || row.length){ row.push(value); rows.push(row); }
  const clean=rows.filter(r=>r.some(c=>String(c).trim()!==''));
  if(!clean.length) return [];
  const headers=clean[0].map((h,i)=>String(h||'').replace(/^﻿/,'').trim()||`col_${i}`);
  return clean.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i] ?? ''])));
}
function tableToObjects(table){
  const headers=(table?.cols||[]).map((col,i)=>normalizeText(col?.label || col?.id)||`col_${i}`);
  return (table?.rows||[]).map(row=>Object.fromEntries(headers.map((h,i)=>[h,normalizeText(row?.c?.[i]?.f ?? row?.c?.[i]?.v ?? '')]))).filter(o=>Object.values(o).some(Boolean));
}
function fetchSheetJsonp(spreadsheetId,sheetName){
  return new Promise((resolve,reject)=>{
    const cb=`marlettaDetail_${sheetName.replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}`;
    const s=document.createElement('script'); let timer;
    function clean(){ if(timer) clearTimeout(timer); delete window[cb]; s.remove(); }
    window[cb]=(resp)=>{ clean(); if(!resp || resp.status==='error') return reject(new Error('Google error')); try{ resolve(tableToObjects(resp.table)); }catch(e){ reject(e);} };
    s.onerror=()=>{ clean(); reject(new Error('Script error')); };
    timer=setTimeout(()=>{ clean(); reject(new Error('Timeout')); },12000);
    s.src=`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&headers=1&tqx=out:json;responseHandler:${cb}`;
    document.head.appendChild(s);
  });
}
async function fetchCsv(url){ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('CSV fail'); return csvToObjects(await res.text()); }
async function loadData(){
  const ds=CFG.dataSource||{}, local=ds.local||{}, g=ds.googleSheet||{};
  if(ds.mode==='google-sheet' && g.spreadsheetId){
    try{
      const [cats, prods] = await Promise.all([
        fetchSheetJsonp(g.spreadsheetId, g.categoriesSheet || 'Categories'),
        fetchSheetJsonp(g.spreadsheetId, g.productsSheet || 'Products')
      ]);
      return {cats, prods};
    }catch(err){ console.warn('Detail sheet fallback', err); }
  }
  const [cats, prods] = await Promise.all([
    fetchCsv(local.categoriesUrl || 'data/categories.csv'),
    fetchCsv(local.productsUrl || 'data/products.csv')
  ]);
  return {cats, prods};
}

function getQueryParam(name){ return new URLSearchParams(window.location.search).get(name); }
function categoryNameBySlug(categories, slug){ return categories.find(c => c.slug === slug)?.name_bg || slug; }
function stockClass(status){ return status==='В наличност' ? 'in-stock' : status==='Ниска наличност' ? 'low-stock' : 'out-stock'; }

async function initDetail(){
  const slug = getQueryParam('slug');
  const shell = document.getElementById('detail-shell');
  const empty = document.getElementById('detail-empty');
  const crumb = document.getElementById('detail-breadcrumb');
  if(!slug){ shell.hidden=true; empty.hidden=false; return; }

  try{
    const {cats, prods} = await loadData();
    const products = prods.map(p => ({
      ...p,
      isActive: normalizeBool(p.is_active),
      isFeatured: normalizeBool(p.is_featured),
      price: toNumber(p.price_bgn),
      promoPrice: toNumber(p.promo_price_bgn),
      image: normalizeText(p.image_1 || p.image_2 || p.image_3 || 'assets/hero-slide-1.jpg'),
      stockStatus: normalizeText(p.stock_status) || 'В наличност'
    })).filter(p => p.isActive);

    const product = products.find(p => normalizeText(p.slug || p.product_id || p.sku) === slug);
    if(!product){ shell.hidden=true; empty.hidden=false; return; }

    const hasPromo = product.promoPrice > 0 && product.promoPrice < product.price;
    crumb.textContent = product.name_bg;
    document.title = `${product.name_bg} | Marletta`;

    shell.innerHTML = `
      <div class="detail-gallery"><img src="${product.image}" alt="${product.name_bg}"></div>
      <div class="detail-panel">
        <div class="detail-topline">
          <div>
            <span class="section-tag">${categoryNameBySlug(cats, product.category_slug)}${product.subcategory_slug ? ` • ${categoryNameBySlug(cats, product.subcategory_slug)}` : ''}</span>
            <h1 class="detail-title">${product.name_bg}</h1>
          </div>
          <span class="badge badge-stock ${stockClass(product.stockStatus)}">${product.stockStatus}</span>
        </div>
        <p class="detail-desc">${product.short_desc_bg || 'Описание ще се попълни от каталога. Засега поне имаме продукт, което е напредък.'}</p>
        <div class="detail-grid">
          <div class="detail-item"><span>SKU</span><strong>${product.sku || '-'}</strong></div>
          <div class="detail-item"><span>Единица</span><strong>${product.unit || '-'}</strong></div>
          <div class="detail-item"><span>Материал</span><strong>${product.material || '-'}</strong></div>
          <div class="detail-item"><span>Цвят</span><strong>${product.color || '-'}</strong></div>
          <div class="detail-item"><span>Размер</span><strong>${product.size || '-'}</strong></div>
          <div class="detail-item"><span>Наличност</span><strong>${product.stock_qty || '0'} / min ${product.min_stock || '0'}</strong></div>
        </div>
        <div class="price-box">
          <div class="price-row">
            ${hasPromo ? `<span class="price-old">${formatPrice(product.price)}</span><span class="price-main">${formatPrice(product.promoPrice)}</span>` : `<span class="price-main">${formatPrice(product.price)}</span>`}
          </div>
          <span class="price-sub">${product.stockStatus}</span>
        </div>
        <div class="detail-actions">
          <a class="btn btn-primary" href="mailto:${CFG.company?.email || 'office@marletta.bg'}?subject=${encodeURIComponent(`${CFG.ui?.inquirySubjectPrefix || 'Запитване'}: ${product.name_bg}`)}">Изпрати запитване</a>
          <a class="btn btn-secondary-dark" href="index.html#catalog">Назад към каталога</a>
        </div>
      </div>
    `;
  }catch(error){
    console.error(error);
    shell.hidden=true;
    empty.hidden=false;
    empty.textContent='Детайлите не успяха да се заредят. Някой пак е решил да усложни лесното.';
  }
}

document.addEventListener('DOMContentLoaded', initDetail);
