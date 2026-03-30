const CFG = window.MARLETTA_CONFIG || {};
const STATE = {
  categories: [],
  products: [],
  attributes: [],
  filters: {
    search: "",
    category: "all",
    subcategory: "all",
    material: "all",
    color: "all",
    stock: "all",
    featured: false,
    minPrice: "",
    maxPrice: "",
    sort: "name-asc"
  },
  heroIndex: 0,
  heroTimer: null,
  sourceMode: ""
};

const ELS = {
  navToggle: document.getElementById('nav-toggle'),
  nav: document.getElementById('main-nav'),
  heroSlides: [...document.querySelectorAll('.hero-slide')],
  heroPrev: document.querySelector('.hero-arrow-prev'),
  heroNext: document.querySelector('.hero-arrow-next'),
  heroDots: document.getElementById('hero-dots'),
  heroTitle: document.getElementById('hero-title'),
  heroText: document.getElementById('hero-text'),
  statProducts: document.querySelector('[data-stat="products"]'),
  statCategories: document.querySelector('[data-stat="categories"]'),
  statAvailable: document.querySelector('[data-stat="available"]'),
  sourceBadge: document.getElementById('source-badge'),
  categoryCards: document.getElementById('category-cards'),
  grid: document.getElementById('product-grid'),
  empty: document.getElementById('empty-state'),
  productsCount: document.getElementById('products-count'),
  search: document.getElementById('catalog-search'),
  category: document.getElementById('filter-category'),
  subcategory: document.getElementById('filter-subcategory'),
  material: document.getElementById('filter-material'),
  color: document.getElementById('filter-color'),
  stock: document.getElementById('filter-stock'),
  minPrice: document.getElementById('filter-price-min'),
  maxPrice: document.getElementById('filter-price-max'),
  featured: document.getElementById('filter-featured'),
  sort: document.getElementById('sort-products'),
  clear: document.getElementById('clear-filters')
};

const HERO_CONTENT = [
  {
    title: 'Каталог за оградни системи, врати и строителни решения',
    text: 'Една архитектура, една таблица и много по-малко драма при качване на нови продукти.'
  },
  {
    title: 'Филтри и богати продуктови карти, без ръчно писане на HTML',
    text: 'Категория, цвят, материал, цена, наличност и акценти. Нещата, които са нормални за каталог, но често липсват по необясними причини.'
  },
  {
    title: 'Google Sheets като master, локални CSV като резервен план',
    text: 'Когато таблицата е налична, тя води. Когато не е, сайтът не умира театрално пред клиента.'
  }
];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeBool(value) {
  const v = normalizeText(value).toLowerCase();
  return ['да','yes','true','1'].includes(v);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function csvToObjects(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const cleanRows = rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  if (!cleanRows.length) return [];

  const headers = cleanRows[0].map((header, i) => String(header || '').replace(/^﻿/, '').trim() || `col_${i}`);
  return cleanRows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

async function fetchCsv(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV load failed: ${url}`);
  return csvToObjects(await res.text());
}

function tableToObjects(table) {
  const headers = (table?.cols || []).map((col, i) => normalizeText(col?.label || col?.id) || `col_${i}`);
  return (table?.rows || []).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      const cell = row?.c?.[i];
      obj[header] = normalizeText(cell?.f ?? cell?.v ?? '');
    });
    return obj;
  }).filter(obj => Object.values(obj).some(v => normalizeText(v) !== ''));
}

function fetchSheetJsonp(spreadsheetId, sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `marletta_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const script = document.createElement('script');
    let timer = null;

    function cleanup() {
      if (timer) clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (response) => {
      cleanup();
      if (!response || response.status === 'error') {
        reject(new Error(`Google Sheets response error: ${sheetName}`));
        return;
      }
      try {
        resolve(tableToObjects(response.table));
      } catch (err) {
        reject(err);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`Google Sheets script error: ${sheetName}`));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Google Sheets timeout: ${sheetName}`));
    }, 12000);

    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&headers=1&tqx=out:json;responseHandler:${callbackName}`;
    document.head.appendChild(script);
  });
}

async function loadData() {
  const ds = CFG.dataSource || {};
  const local = ds.local || {};
  const google = ds.googleSheet || {};

  if (ds.mode === 'google-sheet' && google.spreadsheetId) {
    try {
      const [categories, products, attributes] = await Promise.all([
        fetchSheetJsonp(google.spreadsheetId, google.categoriesSheet || 'Categories'),
        fetchSheetJsonp(google.spreadsheetId, google.productsSheet || 'Products'),
        fetchSheetJsonp(google.spreadsheetId, google.attributesSheet || 'Attributes')
      ]);
      STATE.sourceMode = 'Google Sheets';
      return { categories, products, attributes };
    } catch (error) {
      console.warn('Google Sheets load failed, switching to local fallback.', error);
    }
  }

  const [categories, products, attributes] = await Promise.all([
    fetchCsv(local.categoriesUrl || 'data/categories.csv'),
    fetchCsv(local.productsUrl || 'data/products.csv'),
    fetchCsv(local.attributesUrl || 'data/attributes.csv')
  ]);
  STATE.sourceMode = 'Local fallback';
  return { categories, products, attributes };
}

function decorateData(data) {
  STATE.categories = data.categories.map(cat => ({
    ...cat,
    isActive: normalizeBool(cat.is_active),
    level: Number(cat.level || 1)
  })).filter(cat => cat.isActive);

  STATE.products = data.products.map(p => ({
    ...p,
    isActive: normalizeBool(p.is_active),
    isFeatured: normalizeBool(p.is_featured),
    price: toNumber(p.price_bgn),
    promoPrice: toNumber(p.promo_price_bgn),
    stockQty: toNumber(p.stock_qty),
    minStock: toNumber(p.min_stock),
    image: normalizeText(p.image_1 || p.image_2 || p.image_3 || 'assets/hero-slide-1.jpg'),
    name: normalizeText(p.name_bg),
    slug: normalizeText(p.slug || p.product_id || p.sku),
    categorySlug: normalizeText(p.category_slug),
    subcategorySlug: normalizeText(p.subcategory_slug),
    shortDesc: normalizeText(p.short_desc_bg),
    material: normalizeText(p.material),
    color: normalizeText(p.color),
    size: normalizeText(p.size),
    stockStatus: normalizeText(p.stock_status) || 'В наличност'
  })).filter(p => p.isActive);

  STATE.attributes = data.attributes;
}

function getTopCategories() {
  return STATE.categories.filter(c => Number(c.level) === 1).sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
}

function getSubcategories(categorySlug = null) {
  const subs = STATE.categories.filter(c => Number(c.level) === 2);
  if (!categorySlug || categorySlug === 'all') return subs.sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));

  const top = STATE.categories.find(c => c.slug === categorySlug && Number(c.level) === 1);
  if (!top) return [];
  return subs.filter(s => normalizeText(s.parent_id) === normalizeText(top.category_id)).sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
}

function categoryNameBySlug(slug) {
  return STATE.categories.find(c => c.slug === slug)?.name_bg || slug;
}

function getDynamicStockStatus(product) {
  if (product.stockStatus) return product.stockStatus;
  if (product.stockQty <= 0) return 'Изчерпан';
  if (product.stockQty <= product.minStock) return 'Ниска наличност';
  return 'В наличност';
}

function stockBadgeClass(status) {
  if (status === 'В наличност') return 'in-stock';
  if (status === 'Ниска наличност') return 'low-stock';
  return 'out-stock';
}

function formatPrice(num) {
  return `${num.toFixed(2).replace(/\.00$/, ',00').replace('.', ',')} ${CFG.ui?.currency || 'лв.'}`;
}

function buildCategoryCards() {
  ELS.categoryCards.innerHTML = getTopCategories().map(cat => `
    <article class="category-card">
      <img src="${cat.image || 'assets/cat-fences-main.jpg'}" alt="${cat.name_bg}">
      <div class="category-card-content">
        <h3>${cat.name_bg}</h3>
        <p>${cat.short_description || ''}</p>
      </div>
    </article>
  `).join('');
}

function setSelectOptions(select, options, defaultLabel) {
  const current = select.value || 'all';
  select.innerHTML = [`<option value="all">${defaultLabel}</option>`]
    .concat(options.map(opt => `<option value="${opt.value}">${opt.label}</option>`))
    .join('');
  select.value = options.some(o => o.value === current) || current === 'all' ? current : 'all';
}

function buildFilterOptions() {
  const topCategories = getTopCategories().map(cat => ({ value: cat.slug, label: cat.name_bg }));
  const subcategories = getSubcategories(STATE.filters.category).map(cat => ({ value: cat.slug, label: cat.name_bg }));
  const materials = [...new Set(STATE.products.map(p => p.material).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'bg')).map(v => ({ value: v, label: v }));
  const colors = [...new Set(STATE.products.map(p => p.color).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'bg')).map(v => ({ value: v, label: v }));

  setSelectOptions(ELS.category, topCategories, 'Всички категории');
  setSelectOptions(ELS.subcategory, subcategories, 'Всички подкатегории');
  setSelectOptions(ELS.material, materials, 'Всички материали');
  setSelectOptions(ELS.color, colors, 'Всички цветове');
  setSelectOptions(ELS.stock, [
    { value: 'В наличност', label: 'В наличност' },
    { value: 'Ниска наличност', label: 'Ниска наличност' },
    { value: 'Изчерпан', label: 'Изчерпан' }
  ], 'Всички статуси');
}

function getFilteredProducts() {
  const q = STATE.filters.search.toLowerCase();
  const filtered = STATE.products.filter(p => {
    const stockStatus = getDynamicStockStatus(p);
    const haystack = [p.name, p.sku, p.material, p.shortDesc, p.color].join(' ').toLowerCase();

    if (q && !haystack.includes(q)) return false;
    if (STATE.filters.category !== 'all' && p.categorySlug !== STATE.filters.category) return false;
    if (STATE.filters.subcategory !== 'all' && p.subcategorySlug !== STATE.filters.subcategory) return false;
    if (STATE.filters.material !== 'all' && p.material !== STATE.filters.material) return false;
    if (STATE.filters.color !== 'all' && p.color !== STATE.filters.color) return false;
    if (STATE.filters.stock !== 'all' && stockStatus !== STATE.filters.stock) return false;
    if (STATE.filters.featured && !p.isFeatured) return false;
    if (STATE.filters.minPrice !== '' && p.price < toNumber(STATE.filters.minPrice)) return false;
    if (STATE.filters.maxPrice !== '' && p.price > toNumber(STATE.filters.maxPrice)) return false;
    return true;
  });

  switch (STATE.filters.sort) {
    case 'price-asc':
      filtered.sort((a,b) => a.price - b.price);
      break;
    case 'price-desc':
      filtered.sort((a,b) => b.price - a.price);
      break;
    default:
      filtered.sort((a,b) => a.name.localeCompare(b.name, 'bg'));
      break;
  }

  return filtered;
}

function productCard(product) {
  const stockStatus = getDynamicStockStatus(product);
  const hasPromo = product.promoPrice > 0 && product.promoPrice < product.price;
  const categoryLabel = categoryNameBySlug(product.categorySlug);
  const subLabel = categoryNameBySlug(product.subcategorySlug);

  return `
    <article class="product-card">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}">
        <div class="badges">
          <div>
            <span class="badge badge-stock ${stockBadgeClass(stockStatus)}">${stockStatus}</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${product.isFeatured ? '<span class="badge badge-featured">Акцент</span>' : ''}
            ${hasPromo ? '<span class="badge badge-promo">Промо</span>' : ''}
          </div>
        </div>
      </div>
      <div class="product-body">
        <div class="product-tax">${categoryLabel}${subLabel && subLabel !== product.subcategorySlug ? ` • ${subLabel}` : ''}</div>
        <h3 class="product-title">${product.name}</h3>
        <p class="product-desc">${product.shortDesc || 'Без описание. Което е тъжно, но не и фатално.'}</p>
        <div class="product-specs">
          <div class="spec-row"><span class="spec-label">Материал</span><span class="spec-value">${product.material || '-'}</span></div>
          <div class="spec-row"><span class="spec-label">Цвят</span><span class="spec-value">${product.color || '-'}</span></div>
          <div class="spec-row"><span class="spec-label">Размер</span><span class="spec-value">${product.size || '-'}</span></div>
        </div>
        <div class="product-bottom">
          <div class="price-box">
            <div class="price-row">
              ${hasPromo ? `<span class="price-old">${formatPrice(product.price)}</span><span class="price-main">${formatPrice(product.promoPrice)}</span>` : `<span class="price-main">${formatPrice(product.price)}</span>`}
            </div>
            <span class="price-sub">${product.unit || 'бр.'}</span>
          </div>
          <a class="btn btn-primary btn-small card-link" href="product.html?slug=${encodeURIComponent(product.slug)}">Детайли</a>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const items = getFilteredProducts();
  ELS.productsCount.textContent = String(items.length);
  ELS.grid.innerHTML = items.map(productCard).join('');
  ELS.empty.hidden = items.length > 0;
}

function updateStats() {
  ELS.statProducts.textContent = String(STATE.products.length);
  ELS.statCategories.textContent = String(getTopCategories().length);
  ELS.statAvailable.textContent = String(STATE.products.filter(p => getDynamicStockStatus(p) === 'В наличност').length);
  ELS.sourceBadge.textContent = `Източник: ${STATE.sourceMode}`;
}

function syncFilterState() {
  STATE.filters.search = ELS.search.value.trim();
  STATE.filters.category = ELS.category.value;
  STATE.filters.subcategory = ELS.subcategory.value;
  STATE.filters.material = ELS.material.value;
  STATE.filters.color = ELS.color.value;
  STATE.filters.stock = ELS.stock.value;
  STATE.filters.featured = ELS.featured.checked;
  STATE.filters.minPrice = ELS.minPrice.value;
  STATE.filters.maxPrice = ELS.maxPrice.value;
  STATE.filters.sort = ELS.sort.value;
}

function onCategoryChange() {
  syncFilterState();
  STATE.filters.subcategory = 'all';
  buildFilterOptions();
  renderProducts();
}

function clearFilters() {
  STATE.filters = {
    search: '', category: 'all', subcategory: 'all', material: 'all', color: 'all', stock: 'all', featured: false, minPrice: '', maxPrice: '', sort: 'name-asc'
  };
  ELS.search.value = '';
  ELS.minPrice.value = '';
  ELS.maxPrice.value = '';
  ELS.featured.checked = false;
  ELS.sort.value = 'name-asc';
  buildFilterOptions();
  ELS.stock.value = 'all';
  renderProducts();
}

function bindFilters() {
  ELS.search.addEventListener('input', () => { syncFilterState(); renderProducts(); });
  ELS.category.addEventListener('change', onCategoryChange);
  ELS.subcategory.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.material.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.color.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.stock.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.featured.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.minPrice.addEventListener('input', () => { syncFilterState(); renderProducts(); });
  ELS.maxPrice.addEventListener('input', () => { syncFilterState(); renderProducts(); });
  ELS.sort.addEventListener('change', () => { syncFilterState(); renderProducts(); });
  ELS.clear.addEventListener('click', clearFilters);
}

function initNav() {
  if (!ELS.navToggle || !ELS.nav) return;
  ELS.navToggle.addEventListener('click', () => {
    const open = ELS.nav.classList.toggle('open');
    ELS.navToggle.setAttribute('aria-expanded', String(open));
  });
  ELS.nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    ELS.nav.classList.remove('open');
    ELS.navToggle.setAttribute('aria-expanded', 'false');
  }));
}

function showHero(index) {
  STATE.heroIndex = (index + ELS.heroSlides.length) % ELS.heroSlides.length;
  ELS.heroSlides.forEach((slide, i) => slide.classList.toggle('active', i === STATE.heroIndex));
  const dotButtons = [...ELS.heroDots.querySelectorAll('button')];
  dotButtons.forEach((dot, i) => dot.classList.toggle('active', i === STATE.heroIndex));
  const content = HERO_CONTENT[STATE.heroIndex] || HERO_CONTENT[0];
  ELS.heroTitle.textContent = content.title;
  ELS.heroText.textContent = content.text;
}

function initHero() {
 const slides = document.querySelectorAll('.hero-slide');
const prevBtn = document.querySelector('.hero-arrow-prev');
const nextBtn = document.querySelector('.hero-arrow-next');

let current = 0;

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.remove('active');
  });
  slides[index].classList.add('active');
}

function nextSlide() {
  current = (current + 1) % slides.length;
  showSlide(current);
}

function prevSlide() {
  current = (current - 1 + slides.length) % slides.length;
  showSlide(current);
}

// старт
if (slides.length) {
  showSlide(current);
  setInterval(nextSlide, 5000);
}

nextBtn?.addEventListener('click', nextSlide);
prevBtn?.addEventListener('click', prevSlide);
}

function restartHeroAutoplay() {
  clearInterval(STATE.heroTimer);
  STATE.heroTimer = setInterval(() => showHero(STATE.heroIndex + 1), CFG.ui?.heroAutoplayMs || 5000);
}

async function init() {
  try {
    initNav();
    initHero();
    const data = await loadData();
    decorateData(data);
    updateStats();
    buildCategoryCards();
    buildFilterOptions();
    bindFilters();
    renderProducts();
  } catch (error) {
    console.error(error);
    document.getElementById('empty-state').hidden = false;
    document.getElementById('empty-state').textContent = 'Каталогът не успя да се зареди. Нещо пак е решило да саботира процеса.';
    ELS.sourceBadge.textContent = 'Източник: грешка';
  }
}

document.addEventListener('DOMContentLoaded', init);
