const config = window.MARLETTA_CONFIG || {};
const state = {
  categories: [],
  products: [],
  attributes: [],
  filters: {
    search: "",
    category: "all",
    subcategory: "all"
  },
  currentSlide: 0,
  autoplay: null
};

const els = {
  navToggle: document.querySelector(".nav-toggle"),
  nav: document.querySelector(".main-nav"),
  statsProducts: document.querySelector("[data-stat='products']"),
  statsCategories: document.querySelector("[data-stat='categories']"),
  statsAvailable: document.querySelector("[data-stat='available']"),
  sourceBadge: document.querySelector("#source-badge"),
  heroSlides: Array.from(document.querySelectorAll(".hero-slide")),
  heroDots: document.querySelector("#hero-dots"),
  heroTitle: document.querySelector("#hero-title"),
  heroText: document.querySelector("#hero-text"),
  heroPrev: document.querySelector(".hero-arrow-prev"),
  heroNext: document.querySelector(".hero-arrow-next"),
  categoryCards: document.querySelector("#category-cards"),
  categoryChips: document.querySelector("#category-chips"),
  subcategoryChips: document.querySelector("#subcategory-chips"),
  search: document.querySelector("#catalog-search"),
  productGrid: document.querySelector("#product-grid"),
  productsCount: document.querySelector("#products-count"),
  emptyState: document.querySelector("#empty-state"),
  modal: document.querySelector("#product-modal"),
  modalBackdrop: document.querySelector("#modal-backdrop"),
  modalClose: document.querySelector("#modal-close"),
  modalBody: document.querySelector("#modal-body"),
};

const HERO_CONTENT = [
  {
    title: "Оградни системи, врати и строителни решения",
    text: "Сайтът е подготвен за много продукти, категории и каталози. Данните могат да идват директно от Google Sheets, без да пипате кода при всяко добавяне."
  },
  {
    title: "Каталог, който се обновява от таблица",
    text: "Добавяш нов ред в Products, обновяваш наличности в Inventory и сайтът си дърпа информацията. По-малко драма, повече контрол."
  },
  {
    title: "Ясна структура за следващата стъпка към онлайн магазин",
    text: "Тази версия е стабилна база за филтри, подкатегории, динамични продуктови страници, наличности и бъдеща количка."
  }
];

function initNav() {
  if (!els.navToggle || !els.nav) return;
  els.navToggle.addEventListener("click", () => {
    const isOpen = els.nav.classList.toggle("open");
    els.navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  els.nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      els.nav.classList.remove("open");
      els.navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function csvUrlForSheet(spreadsheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&headers=1&tqx=out:json`;
}

function buildUrls() {
  const ds = config.dataSource || {};
  if (ds.mode === "google-sheet" && ds.googleSheet && ds.googleSheet.spreadsheetId) {
    const gid = ds.googleSheet;
    return {
      modeLabel: "Google Sheets",
      mode: "google-sheet",
      spreadsheetId: gid.spreadsheetId,
      categoriesSheet: gid.categoriesSheet || "Categories",
      productsSheet: gid.productsSheet || "Products",
      attributesSheet: gid.attributesSheet || "Attributes",
      categoriesUrl: csvUrlForSheet(gid.spreadsheetId, gid.categoriesSheet || "Categories"),
      productsUrl: csvUrlForSheet(gid.spreadsheetId, gid.productsSheet || "Products"),
      attributesUrl: csvUrlForSheet(gid.spreadsheetId, gid.attributesSheet || "Attributes")
    };
  }
  return {
    modeLabel: "Локални примерни данни",
    mode: "local",
    categoriesUrl: ds.local?.categoriesUrl || "data/categories.csv",
    productsUrl: ds.local?.productsUrl || "data/products.csv",
    attributesUrl: ds.local?.attributesUrl || "data/attributes.csv"
  };
}

function normalizeCellValue(cell) {
  if (!cell) return "";
  if (typeof cell.f === "string" && cell.f.trim()) return cell.f.trim();
  if (cell.v === null || cell.v === undefined) return "";
  return String(cell.v).trim();
}

function tableToObjects(table) {
  const cols = Array.isArray(table?.cols) ? table.cols : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const headers = cols.map((col, index) => {
    const label = String(col?.label || "").replace(/^﻿/, "").trim();
    const id = String(col?.id || "").replace(/^﻿/, "").trim();
    return label || id || `col_${index}`;
  });

  return rows
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = normalizeCellValue(row?.c?.[index]);
      });
      return obj;
    })
    .filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));
}

function fetchGoogleSheetJsonp(spreadsheetId, sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `marlettaSheet_${sheetName.replace(/[^a-zA-Z0-9_]/g, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Google Sheets timeout: ${sheetName}`));
    }, 10000);

    window[callbackName] = (response) => {
      clearTimeout(timer);
      cleanup();
      if (!response || response.status === "error") {
        reject(new Error(`Google Sheets error: ${sheetName}`));
        return;
      }
      try {
        resolve(tableToObjects(response.table));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Google Sheets script load failed: ${sheetName}`));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&headers=1&tqx=out:json;responseHandler:${callbackName}`;
    document.head.appendChild(script);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
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
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "
" || char === "") && !inQuotes) {
      if (char === "" && next === "
") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const cleanRows = rows.filter(r => r.some(cell => String(cell).trim() !== ""));
  if (!cleanRows.length) return [];
  const headers = cleanRows[0].map((header, index) => String(header || "").replace(/^﻿/, "").trim() || `col_${index}`);
  return cleanRows.slice(1).map(r => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (r[index] ?? "").trim();
    });
    return obj;
  });
}

async function fetchCsv(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Неуспешно зареждане: ${url}`);
  const text = await res.text();
  return parseCsv(text);
}
function toNumber(value) {
  const normalized = String(value || "").replace(",", ".").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function isYes(value) {
  return String(value || "").toLowerCase() === "да";
}

function formatPrice(value) {
  const num = toNumber(value);
  if (!num) return "Цена по запитване";
  return new Intl.NumberFormat("bg-BG", { style: "currency", currency: "BGN" }).format(num);
}

function stockClass(status) {
  if (status === "Изчерпан") return "is-out";
  if (status === "Ниска наличност") return "is-low";
  return "is-in";
}

function topCategories() {
  return state.categories
    .filter(cat => String(cat.level) === "1" && isYes(cat.is_active))
    .sort((a, b) => toNumber(a.sort_order) - toNumber(b.sort_order));
}

function subcategoriesFor(categorySlug) {
  if (categorySlug === "all") return [];
  const parent = state.categories.find(cat => cat.slug === categorySlug && String(cat.level) === "1");
  if (!parent) return [];
  return state.categories
    .filter(cat => cat.parent_id === parent.category_id && isYes(cat.is_active))
    .sort((a, b) => toNumber(a.sort_order) - toNumber(b.sort_order));
}

function filteredProducts() {
  const search = state.filters.search.toLowerCase().trim();
  return state.products
    .filter(product => isYes(product.is_active))
    .filter(product => state.filters.category === "all" || product.category_slug === state.filters.category)
    .filter(product => state.filters.subcategory === "all" || product.subcategory_slug === state.filters.subcategory)
    .filter(product => {
      if (!search) return true;
      const hay = [
        product.name_bg,
        product.short_desc_bg,
        product.sku,
        product.material,
        product.color,
        product.size,
      ].join(" ").toLowerCase();
      return hay.includes(search);
    })
    .sort((a, b) => {
      const aFeatured = isYes(a.is_featured) ? 0 : 1;
      const bFeatured = isYes(b.is_featured) ? 0 : 1;
      return aFeatured - bFeatured || toNumber(a.sort_order) - toNumber(b.sort_order);
    });
}

function renderStats() {
  const activeProducts = state.products.filter(p => isYes(p.is_active));
  const activeCategories = topCategories();
  const available = activeProducts.filter(p => p.stock_status === "В наличност").length;
  els.statsProducts.textContent = activeProducts.length;
  els.statsCategories.textContent = activeCategories.length;
  els.statsAvailable.textContent = available;
}

function renderCategoryCards() {
  const categories = topCategories();
  els.categoryCards.innerHTML = categories.map(cat => `
    <button class="category-card" data-category="${cat.slug}" type="button">
      <div class="category-card-image">
        <img src="${cat.image}" alt="${cat.name_bg}" loading="lazy" />
      </div>
      <div class="category-card-body">
        <h3>${cat.name_bg}</h3>
        <p>${cat.short_description || ""}</p>
        <span>Виж продукти</span>
      </div>
    </button>
  `).join("");

  els.categoryCards.querySelectorAll("[data-category]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filters.category = btn.dataset.category;
      state.filters.subcategory = "all";
      syncChipStates();
      renderSubcategoryChips();
      renderProducts();
      document.querySelector("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderCategoryChips() {
  const chips = [{ slug: "all", name_bg: "Всички" }, ...topCategories()];
  els.categoryChips.innerHTML = chips.map(cat => `
    <button class="filter-chip ${state.filters.category === cat.slug ? "active" : ""}" data-category="${cat.slug}" type="button">${cat.name_bg}</button>
  `).join("");

  els.categoryChips.querySelectorAll("[data-category]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filters.category = btn.dataset.category;
      state.filters.subcategory = "all";
      syncChipStates();
      renderSubcategoryChips();
      renderProducts();
    });
  });
}

function renderSubcategoryChips() {
  const subcats = subcategoriesFor(state.filters.category);
  if (!subcats.length) {
    els.subcategoryChips.innerHTML = "";
    return;
  }
  const chips = [{ slug: "all", name_bg: "Всички подкатегории" }, ...subcats];
  els.subcategoryChips.innerHTML = chips.map(cat => `
    <button class="filter-chip soft ${state.filters.subcategory === cat.slug ? "active" : ""}" data-subcategory="${cat.slug}" type="button">${cat.name_bg}</button>
  `).join("");
  els.subcategoryChips.querySelectorAll("[data-subcategory]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filters.subcategory = btn.dataset.subcategory;
      syncChipStates();
      renderProducts();
    });
  });
}

function syncChipStates() {
  els.categoryChips.querySelectorAll("[data-category]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.category === state.filters.category);
  });
  els.subcategoryChips.querySelectorAll("[data-subcategory]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.subcategory === state.filters.subcategory);
  });
}

function getAttributesForSku(sku) {
  return state.attributes
    .filter(item => item.sku === sku)
    .sort((a, b) => toNumber(a.sort_order) - toNumber(b.sort_order));
}

function productCard(product) {
  const topCategory = state.categories.find(cat => cat.slug === product.category_slug);
  const subCategory = state.categories.find(cat => cat.slug === product.subcategory_slug);
  const price = toNumber(product.promo_price_bgn) > 0
    ? `<div class="price-box"><strong>${formatPrice(product.promo_price_bgn)}</strong><span>${formatPrice(product.price_bgn)}</span></div>`
    : `<div class="price-box"><strong>${formatPrice(product.price_bgn)}</strong></div>`;
  return `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image_1 || "assets/cat-fences-main.jpg"}" alt="${product.name_bg}" loading="lazy" />
        <span class="stock-badge ${stockClass(product.stock_status)}">${product.stock_status}</span>
        ${isYes(product.is_featured) ? '<span class="featured-badge">Акцент</span>' : ""}
      </div>
      <div class="product-body">
        <div class="product-meta">${topCategory?.name_bg || ""}${subCategory ? ` • ${subCategory.name_bg}` : ""}</div>
        <h3>${product.name_bg}</h3>
        <p>${product.short_desc_bg || ""}</p>
        <ul class="product-specs">
          ${product.material ? `<li><span>Материал</span><strong>${product.material}</strong></li>` : ""}
          ${product.color ? `<li><span>Цвят</span><strong>${product.color}</strong></li>` : ""}
          ${product.size ? `<li><span>Размер</span><strong>${product.size}</strong></li>` : ""}
        </ul>
        <div class="product-footer">
          ${price}
          <button class="btn btn-primary btn-small" type="button" data-open-product="${product.sku}">Детайли</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const products = filteredProducts();
  els.productsCount.textContent = products.length;
  els.productGrid.innerHTML = products.map(productCard).join("");
  els.emptyState.hidden = products.length > 0;
  els.productGrid.querySelectorAll("[data-open-product]").forEach(btn => {
    btn.addEventListener("click", () => openProductModal(btn.dataset.openProduct));
  });
}

function openProductModal(sku) {
  const product = state.products.find(item => item.sku === sku);
  if (!product) return;
  const attrs = getAttributesForSku(sku);
  const topCategory = state.categories.find(cat => cat.slug === product.category_slug);
  const subCategory = state.categories.find(cat => cat.slug === product.subcategory_slug);
  const priceMarkup = toNumber(product.promo_price_bgn) > 0
    ? `<div class="modal-price"><strong>${formatPrice(product.promo_price_bgn)}</strong><span>${formatPrice(product.price_bgn)}</span></div>`
    : `<div class="modal-price"><strong>${formatPrice(product.price_bgn)}</strong></div>`;

  els.modalBody.innerHTML = `
    <div class="modal-grid">
      <div class="modal-media">
        <img src="${product.image_1 || "assets/cat-fences-main.jpg"}" alt="${product.name_bg}" />
      </div>
      <div class="modal-copy">
        <div class="product-meta">${topCategory?.name_bg || ""}${subCategory ? ` • ${subCategory.name_bg}` : ""}</div>
        <h3>${product.name_bg}</h3>
        <p>${product.short_desc_bg || ""}</p>
        <div class="modal-inline">
          <span class="stock-badge ${stockClass(product.stock_status)}">${product.stock_status}</span>
          <span class="sku-badge">SKU: ${product.sku}</span>
        </div>
        ${priceMarkup}
        <div class="modal-details">
          ${product.material ? `<div><span>Материал</span><strong>${product.material}</strong></div>` : ""}
          ${product.color ? `<div><span>Цвят</span><strong>${product.color}</strong></div>` : ""}
          ${product.size ? `<div><span>Размер</span><strong>${product.size}</strong></div>` : ""}
          ${product.unit ? `<div><span>Единица</span><strong>${product.unit}</strong></div>` : ""}
          ${product.stock_qty ? `<div><span>Наличност</span><strong>${product.stock_qty}</strong></div>` : ""}
        </div>
        ${attrs.length ? `
          <div class="attr-block">
            <h4>Допълнителни характеристики</h4>
            <div class="attr-list">
              ${attrs.map(attr => `<div><span>${attr.attribute_name_bg}</span><strong>${attr.attribute_value_bg}</strong></div>`).join("")}
            </div>
          </div>
        ` : ""}
        <div class="modal-actions">
          <a class="btn btn-primary" href="${config.company?.phoneLink || "#contact"}">Обади се</a>
          <a class="btn btn-secondary-dark" href="${config.company?.emailLink || "#contact"}">Изпрати запитване</a>
        </div>
      </div>
    </div>
  `;
  els.modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  els.modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function initModal() {
  els.modalClose?.addEventListener("click", closeModal);
  els.modalBackdrop?.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.modal.hidden) closeModal();
  });
}

function showSlide(index) {
  const slides = els.heroSlides;
  if (!slides.length) return;
  state.currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("active", i === state.currentSlide));
  Array.from(els.heroDots.children).forEach((dot, i) => dot.classList.toggle("active", i === state.currentSlide));
  els.heroTitle.textContent = HERO_CONTENT[state.currentSlide].title;
  els.heroText.textContent = HERO_CONTENT[state.currentSlide].text;
}

function startSlider() {
  clearInterval(state.autoplay);
  state.autoplay = setInterval(() => showSlide(state.currentSlide + 1), 5200);
}

function initSlider() {
  if (!els.heroDots) return;
  els.heroDots.innerHTML = HERO_CONTENT.map((_, i) => `<button type="button" aria-label="Слайд ${i + 1}" class="${i === 0 ? "active" : ""}"></button>`).join("");
  Array.from(els.heroDots.children).forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      startSlider();
    });
  });
  els.heroPrev?.addEventListener("click", () => {
    showSlide(state.currentSlide - 1);
    startSlider();
  });
  els.heroNext?.addEventListener("click", () => {
    showSlide(state.currentSlide + 1);
    startSlider();
  });
  showSlide(0);
  startSlider();
}

async function loadLocalData(localUrls) {
  const [categories, products, attributes] = await Promise.all([
    fetchCsv(localUrls.categoriesUrl),
    fetchCsv(localUrls.productsUrl),
    fetchCsv(localUrls.attributesUrl),
  ]);
  return { categories, products, attributes };
}

async function loadData() {
  const urls = buildUrls();
  const localUrls = {
    categoriesUrl: config.dataSource?.local?.categoriesUrl || "data/categories.csv",
    productsUrl: config.dataSource?.local?.productsUrl || "data/products.csv",
    attributesUrl: config.dataSource?.local?.attributesUrl || "data/attributes.csv"
  };

  try {
    let payload;

    if (urls.mode === "google-sheet") {
      payload = await Promise.all([
        fetchGoogleSheetJsonp(urls.spreadsheetId, urls.categoriesSheet),
        fetchGoogleSheetJsonp(urls.spreadsheetId, urls.productsSheet),
        fetchGoogleSheetJsonp(urls.spreadsheetId, urls.attributesSheet),
      ]).then(([categories, products, attributes]) => ({ categories, products, attributes }));
      els.sourceBadge.textContent = `Източник: ${urls.modeLabel}`;
    } else {
      payload = await loadLocalData(localUrls);
      els.sourceBadge.textContent = "Източник: локални примерни данни";
    }

    state.categories = payload.categories;
    state.products = payload.products;
    state.attributes = payload.attributes;
  } catch (error) {
    console.error("Primary data source failed, falling back to local CSV:", error);
    const fallback = await loadLocalData(localUrls);
    state.categories = fallback.categories;
    state.products = fallback.products;
    state.attributes = fallback.attributes;
    els.sourceBadge.textContent = "Източник: локални данни (fallback)";
  }
}

function initSearch() {
  els.search?.addEventListener("input", (event) => {
    state.filters.search = event.target.value || "";
    renderProducts();
  });
}

async function bootstrap() {
  initNav();
  initSlider();
  initSearch();
  initModal();
  try {
    await loadData();
    renderStats();
    renderCategoryCards();
    renderCategoryChips();
    renderSubcategoryChips();
    renderProducts();
  } catch (error) {
    els.productGrid.innerHTML = `<div class="load-error">Не успях да заредя данните нито от таблицата, нито от локалния резервен файл. Провери връзката и опитай пак.</div>`;
    els.emptyState.hidden = true;
  }
}

bootstrap();