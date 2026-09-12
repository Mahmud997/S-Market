/**
 * B2B Trade — Mini-1C
 * Main application logic (Updated with Profit, Margin, Print Invoices & Financial Reports)
 */

(function () {
    'use strict';

    // ========== STATE ==========
    const state = {
        user: null,
        role: 'buyer', // 'buyer' | 'admin'
        products: [],
        categories: [],   // string names
        cart: {},          // { productId: qty }
        favorites: {},     // { productId: true }
        activeCategory: 'all',
        invoices: [],
        carouselIndex: 0,
        searchQuery: '',
        sortBy: 'name',
        reportPeriod: 'today',
        reportDateFrom: null,
        reportDateTo: null,
        deliveryMap: null,
        deliveryMarker: null
    };

    // ========== DOM REFS ==========
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ========== TOAST ==========
    function toast(message, type = 'info') {
        const container = $('#toastContainer');
        if (!container) return;
        
        const el = document.createElement('div');
        const colors = {
            info: 'bg-white border-blue-200 text-slate-700 shadow-lg shadow-blue-500/10',
            success: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
            error: 'bg-rose-500 text-white shadow-lg shadow-rose-500/20',
            warn: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
        };
        el.className = `pointer-events-auto px-5 py-3 rounded-2xl border text-sm font-semibold transition-all duration-300 ${colors[type] || colors.info}`;
        el.textContent = message;
        container.appendChild(el);
        
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(10px)';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ========== FORMAT ==========
    const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n || 0) + ' ₸';

    // ========== DATA LAYER ==========
    async function loadProducts() {
        if (window.B2B && window.B2B.USE_DEMO) {
            state.products = window.B2B.DemoStore.get('products', []);
            return;
        }
        try {
            const db = window.db || (window.B2B && window.B2B.db) || firebase.firestore();
            const snap = await db.collection('products').get();
            state.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error(e);
            toast('Ошибка загрузки товаров из базы', 'error');
        }
    }

    async function saveProduct(product) {
        if (window.B2B && window.B2B.USE_DEMO) {
            const list = window.B2B.DemoStore.get('products', []);
            if (product.id) {
                const idx = list.findIndex(p => p.id === product.id);
                if (idx >= 0) list[idx] = product;
                else list.push(product);
            } else {
                product.id = 'p' + Date.now() + Math.random().toString(36).substr(2, 4);
                list.push(product);
            }
            window.B2B.DemoStore.set('products', list);
            state.products = list;
            return product;
        }
        
        const db = window.db || (window.B2B && window.B2B.db) || firebase.firestore();
        if (product.id) {
            const id = product.id;
            delete product.id;
            await db.collection('products').doc(id).set(product, { merge: true });
            product.id = id;
        } else {
            product.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const ref = await db.collection('products').add(product);
            product.id = ref.id;
        }
        return product;
    }

    async function deleteProductFromDb(id) {
        if (window.B2B && window.B2B.USE_DEMO) {
            let list = window.B2B.DemoStore.get('products', []);
            list = list.filter(p => p.id !== id);
            window.B2B.DemoStore.set('products', list);
            state.products = list;
            return;
        }
        const db = window.db || (window.B2B && window.B2B.db) || firebase.firestore();
        await db.collection('products').doc(id).delete();
        state.products = state.products.filter(p => p.id !== id);
    }

    async function loadInvoices() {
        if (window.B2B && window.B2B.USE_DEMO) {
            state.invoices = window.B2B.DemoStore.get('invoices', []);
            return;
        }
        try {
            const db = window.db || (window.B2B && window.B2B.db) || firebase.firestore();
            const snap = await db.collection('invoices').orderBy('createdAt', 'desc').limit(100).get();
            state.invoices = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
                };
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function saveInvoice(invoice) {
        if (window.B2B && window.B2B.USE_DEMO) {
            const list = window.B2B.DemoStore.get('invoices', []);
            invoice.id = 'inv' + Date.now();
            invoice.createdAt = new Date().toISOString();
            list.unshift(invoice);
            window.B2B.DemoStore.set('invoices', list);
            
            // Deduct stock
            const products = window.B2B.DemoStore.get('products', []);
            invoice.items.forEach(item => {
                const p = products.find(x => x.id === item.productId);
                if (p) p.stock = Math.max(0, p.stock - item.qty);
            });
            window.B2B.DemoStore.set('products', products);
            state.products = products;
            state.invoices = list;
            return invoice;
        }

        const db = window.db || (window.B2B && window.B2B.db) || firebase.firestore();
        const ref = await db.collection('invoices').add({
            ...invoice,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Batch update product stocks
        const batch = db.batch();
        invoice.items.forEach(item => {
            if (item.productId) {
                const pRef = db.collection('products').doc(item.productId);
                const p = state.products.find(x => x.id === item.productId);
                if (p) {
                    const newStock = Math.max(0, p.stock - item.qty);
                    batch.update(pRef, { stock: newStock });
                    p.stock = newStock;
                }
            }
        });
        await batch.commit();

        invoice.id = ref.id;
        invoice.createdAt = new Date().toISOString();
        state.invoices.unshift(invoice);
        return invoice;
    }

    // ========== AUTH ==========
    async function showApp(user, role = 'buyer') {
        state.user = user;
        state.role = role;
        $('#authScreen')?.classList.add('hidden');
        $('#appScreen')?.classList.remove('hidden');
        $('#userInfo')?.classList.remove('hidden');
        
        const badge = $('#userRoleBadge');
        if (badge) {
            if (role === 'admin') {
                badge.textContent = 'Администратор';
                badge.className = 'text-xs px-3 py-1 rounded-full font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200';
                $('#tabAdmin')?.classList.remove('hidden');
            } else {
                badge.textContent = 'Покупатель';
                badge.className = 'text-xs px-3 py-1 rounded-full font-semibold bg-blue-100 text-blue-700 border border-blue-200';
                $('#tabAdmin')?.classList.add('hidden');
            }
        }
        
        if (window.lucide) lucide.createIcons();
        await initAppData();
    }

    function logout() {
        state.user = null;
        state.cart = {};
        state.products = [];
        state.invoices = [];
        
        if (window.B2B && window.B2B.USE_DEMO) {
            window.B2B.DemoStore.set('user', null);
        } else if (window.B2B && window.B2B.auth) {
            window.B2B.auth.signOut().catch(console.error);
        }
        
        $('#phoneAuthContainer')?.classList.remove('hidden');
        $('#otpContainer')?.classList.add('hidden');
        if ($('#otpCode')) $('#otpCode').value = '';
        if ($('#phoneNumber')) $('#phoneNumber').value = '';
        
        $('#appScreen')?.classList.add('hidden');
        $('#authScreen')?.classList.remove('hidden');
        $('#userInfo')?.classList.add('hidden');
        updateCartUI();
        toast('Вы вышли из системы');
    }

    function demoLogin(asAdmin = false) {
        const user = { uid: 'demo', displayName: asAdmin ? 'Админ' : 'Покупатель', email: 'demo@b2b.local' };
        if (window.B2B) {
            window.B2B.DemoStore.set('user', { ...user, role: asAdmin ? 'admin' : 'buyer' });
        }
        showApp(user, asAdmin ? 'admin' : 'buyer');
        toast(asAdmin ? 'Вход выполнен: Администратор' : 'Вход выполнен: Покупатель', 'success');
    }

    async function handleAuthSuccess(user) {
        try {
            const role = window.B2B ? await window.B2B.resolveUserRole(user) : 'admin';
            if (window.B2B) await window.B2B.ensureUserProfile(user, role);
            await showApp(user, role);
            toast('Добро пожаловать в систему!', 'success');
        } catch (e) {
            console.error(e);
            toast('Ошибка входа: ' + e.message, 'error');
        }
    }

    // ========== CART ==========
    function addToCart(productId, delta = 1) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;
        
        const current = state.cart[productId] || 0;
        const next = current + delta;
        
        if (next <= 0) {
            delete state.cart[productId];
        } else if (next > product.stock) {
            toast(`На складе доступно только ${product.stock} шт.`, 'warn');
            return;
        } else {
            state.cart[productId] = next;
        }
        updateCartUI();
        renderInvoice();
        renderCatalog();
    }

    function getCartCount() {
        return Object.values(state.cart).reduce((s, q) => s + q, 0);
    }

    function getCartTotal() {
        return Object.entries(state.cart).reduce((sum, [id, qty]) => {
            const p = state.products.find(x => x.id === id);
            return sum + (p ? p.price * qty : 0);
        }, 0);
    }

    function updateCartUI() {
        const count = getCartCount();
        const cartBadge = $('#cartCount');
        if (cartBadge) {
            cartBadge.textContent = count;
            cartBadge.classList.toggle('hidden', count === 0);
        }
        
        const total = getCartTotal();
        if ($('#invoiceTotal')) $('#invoiceTotal').textContent = fmt(total);
        if ($('#submitInvoiceBtn')) {
            const storeOk = !!$('#selectStore')?.value;
            const isDelivery = ($('#selectStore')?.value || '').includes('Доставка');
            const addrOk = !isDelivery || (($('#deliveryAddress')?.value || '').trim().length > 3);
            $('#submitInvoiceBtn').disabled = count === 0 || !storeOk || !addrOk;
        }
    }

    // ========== RENDER CATALOG ==========
    function loadFavorites() {
        try {
            const raw = localStorage.getItem('smarket_favorites');
            state.favorites = raw ? JSON.parse(raw) : {};
        } catch { state.favorites = {}; }
    }
    function saveFavorites() {
        localStorage.setItem('smarket_favorites', JSON.stringify(state.favorites));
        updateFavUI();
    }
    function toggleFavorite(productId) {
        if (state.favorites[productId]) delete state.favorites[productId];
        else state.favorites[productId] = true;
        saveFavorites();
        renderCatalog();
        renderFavorites();
    }
    function updateFavUI() {
        const n = Object.keys(state.favorites).length;
        const el = $('#favCount');
        if (el) {
            el.textContent = n;
            el.classList.toggle('hidden', n === 0);
        }
    }

    function loadCategories() {
        const fromProducts = [...new Set(state.products.map(p => p.category).filter(Boolean))];
        let stored = [];
        try {
            if (window.B2B && window.B2B.USE_DEMO) {
                stored = window.B2B.DemoStore.get('categories', []) || [];
            } else {
                stored = JSON.parse(localStorage.getItem('smarket_categories') || '[]');
            }
        } catch { stored = []; }
        const defaults = ['Напитки', 'Снэки', 'Сладости', 'Молочное', 'Еда / Кафе', 'Одежда', 'Техника', 'Авто'];
        const base = stored.length ? stored : defaults;
        state.categories = [...new Set([...base, ...fromProducts])].sort((a,b) => a.localeCompare(b, 'ru'));
        try { localStorage.setItem('smarket_categories', JSON.stringify(state.categories)); } catch {}
    }
    function persistCategories() {
        if (window.B2B && window.B2B.USE_DEMO) {
            window.B2B.DemoStore.set('categories', state.categories);
        }
        localStorage.setItem('smarket_categories', JSON.stringify(state.categories));
        fillCategorySelects();
        renderCategoryChips();
        renderAdminCategories();
    }
    function addCategory(name) {
        name = (name || '').trim();
        if (!name) return toast('Введите название категории', 'warn');
        if (state.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
            return toast('Такая категория уже есть', 'warn');
        }
        state.categories.push(name);
        state.categories.sort((a,b) => a.localeCompare(b, 'ru'));
        persistCategories();
        toast('Категория добавлена', 'success');
    }
    function removeCategory(name) {
        state.categories = state.categories.filter(c => c !== name);
        persistCategories();
        toast('Категория удалена', 'success');
    }
    function fillCategorySelects() {
        const sel = $('#prodCategory');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">Без категории</option>' +
            state.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (cur) sel.value = cur;
    }
    function renderAdminCategories() {
        const box = $('#adminCategoriesList');
        if (!box) return;
        if (!state.categories.length) {
            box.innerHTML = '<span class="text-xs text-slate-400">Категорий пока нет</span>';
            return;
        }
        box.innerHTML = state.categories.map(c => `
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
                ${escapeHtml(c)}
                <button type="button" data-del-cat="${escapeHtml(c)}" class="text-slate-400 hover:text-red-500 font-bold leading-none">&times;</button>
            </span>`).join('');
        box.querySelectorAll('[data-del-cat]').forEach(btn => {
            btn.addEventListener('click', () => removeCategory(btn.dataset.delCat));
        });
    }
    function renderCategoryChips() {
        const box = $('#categoryChips');
        if (!box) return;

        // Иконки по названию (как на маркетплейсах)
        const iconMap = {
            'напитки': 'cup-soda',
            'снэки': 'cookie',
            'сладости': 'candy',
            'молочное': 'milk',
            'еда': 'utensils',
            'еда / кафе': 'utensils',
            'кафе': 'utensils',
            'одежда': 'shirt',
            'техника': 'smartphone',
            'жильё': 'home',
            'жилье': 'home',
            'авто': 'car',
            'такси': 'car-taxi-front',
            'мастера': 'wrench',
            'скот': 'beef',
            'скот / агро': 'wheat',
            'агро': 'wheat',
            'электроника': 'cpu',
            'красота': 'sparkles',
            'спорт': 'dumbbell',
            'дети': 'baby',
            'дом': 'sofa',
            'книги': 'book-open',
            'животные': 'paw-print',
            'услуги': 'briefcase',
            'мебель': 'armchair',
            'обувь': 'footprints',
            'игрушки': 'toy-brick'
        };
        const colors = [
            { bg: 'bg-amber-50', icon: 'text-amber-500' },
            { bg: 'bg-blue-50', icon: 'text-blue-600' },
            { bg: 'bg-indigo-50', icon: 'text-indigo-500' },
            { bg: 'bg-sky-50', icon: 'text-sky-600' },
            { bg: 'bg-rose-50', icon: 'text-rose-500' },
            { bg: 'bg-violet-50', icon: 'text-violet-500' },
            { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
            { bg: 'bg-orange-50', icon: 'text-orange-500' },
            { bg: 'bg-cyan-50', icon: 'text-cyan-600' },
            { bg: 'bg-fuchsia-50', icon: 'text-fuchsia-500' }
        ];

        const cats = state.categories.length ? state.categories : [];
        if (cats.length === 0) {
            box.innerHTML = `<div class="col-span-4 text-center py-6 text-sm text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Категории появятся, когда админ их добавит</div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        box.innerHTML = cats.map((c, i) => {
            const key = c.toLowerCase().trim();
            let icon = 'tag';
            for (const [k, v] of Object.entries(iconMap)) {
                if (key.includes(k) || k.includes(key)) { icon = v; break; }
            }
            const col = colors[i % colors.length];
            const active = state.activeCategory === c;
            return `
            <button type="button" data-cat="${escapeHtml(c)}"
                class="cat-card group flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-2xl border transition-all duration-200
                ${active
                    ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-600/20 scale-[1.02]'
                    : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5'}">
                <span class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${active ? 'bg-white/20' : col.bg} transition-colors">
                    <i data-lucide="${icon}" class="w-5 h-5 sm:w-6 sm:h-6 ${active ? 'text-white' : col.icon}"></i>
                </span>
                <span class="text-[11px] sm:text-xs font-semibold text-center leading-tight line-clamp-2 ${active ? 'text-white' : 'text-slate-700'}">${escapeHtml(c)}</span>
            </button>`;
        }).join('');

        box.querySelectorAll('[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                state.activeCategory = (state.activeCategory === cat) ? 'all' : cat;
                renderCategoryChips();
                renderCatalog();
            });
        });
        if (window.lucide) lucide.createIcons();
    }


    function productCardHtml(p) {
        const qty = state.cart[p.id] || 0;
        const fav = !!state.favorites[p.id];
        const img = p.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=dbeafe&color=2563eb&size=200`;
        const cat = p.category ? `<span class="text-[10px] font-medium text-slate-400 truncate">${escapeHtml(p.category)}</span>` : '';
        return `
            <div class="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all hover:shadow-md hover:border-slate-300 group">
                <div class="aspect-square bg-slate-50 relative overflow-hidden">
                    <img src="${img}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover" loading="lazy"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=dbeafe&color=2563eb&size=200'">
                    <button type="button" data-fav="${p.id}" class="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105 transition-transform" title="Избранное">
                        <i data-lucide="heart" class="w-4 h-4 ${fav ? 'text-red-500 fill-red-500' : 'text-slate-400'}" style="${fav ? 'fill: currentColor' : ''}"></i>
                    </button>
                    ${p.stock < 10 ? '<span class="absolute top-2 left-2 text-[10px] px-2 py-0.5 bg-red-500 text-white font-semibold rounded-md">Мало</span>' : ''}
                </div>
                <div class="p-3 flex flex-col flex-1">
                    ${cat}
                    <h4 class="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 mb-1 mt-0.5">${escapeHtml(p.name)}</h4>
                    <div class="text-red-500 font-bold text-base mb-0.5">${fmt(p.price)}</div>
                    <div class="text-[11px] text-slate-400 mb-3">В наличии: ${p.stock} шт</div>
                    <div class="mt-auto">
                        ${qty > 0 ? `
                            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1">
                                <button class="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm font-bold" data-action="dec" data-id="${p.id}">−</button>
                                <span class="font-bold text-slate-800 text-sm px-2">${qty}</span>
                                <button class="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm font-bold" data-action="inc" data-id="${p.id}">+</button>
                            </div>
                        ` : `
                            <button class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors active:scale-[0.98]" data-action="add" data-id="${p.id}">
                                В корзину
                            </button>
                        `}
                    </div>
                </div>
            </div>`;
    }

    function bindProductCardEvents(root) {
        if (!root) return;
        root.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const action = btn.dataset.action;
                if (action === 'add' || action === 'inc') addToCart(id, 1);
                if (action === 'dec') addToCart(id, -1);
            });
        });
        root.querySelectorAll('[data-fav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(btn.dataset.fav);
            });
        });
        if (window.lucide) lucide.createIcons();
    }

    function renderCatalog() {
        const list = $('#productList');
        const empty = $('#emptyCatalog');
        if (!list) return;

        let items = [...state.products];
        
        if (state.activeCategory && state.activeCategory !== 'all') {
            items = items.filter(p => (p.category || '') === state.activeCategory);
        }
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            items = items.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
        }
        
        switch (state.sortBy) {
            case 'price-asc': items.sort((a, b) => a.price - b.price); break;
            case 'price-desc': items.sort((a, b) => b.price - a.price); break;
            case 'stock': items.sort((a, b) => b.stock - a.stock); break;
            default: items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        }
        
        if (items.length === 0) {
            list.innerHTML = '';
            empty?.classList.remove('hidden');
            return;
        }
        empty?.classList.add('hidden');
        list.innerHTML = items.map(productCardHtml).join('');
        bindProductCardEvents(list);
    }

    function renderFavorites() {
        const list = $('#favoritesList');
        const empty = $('#emptyFavorites');
        if (!list) return;
        const items = state.products.filter(p => state.favorites[p.id]);
        if (items.length === 0) {
            list.innerHTML = '';
            empty?.classList.remove('hidden');
            return;
        }
        empty?.classList.add('hidden');
        list.innerHTML = items.map(productCardHtml).join('');
        bindProductCardEvents(list);
    }

    // ========== RENDER INVOICE ==========
    function renderInvoice() {
        const container = $('#invoiceItems');
        const empty = $('#emptyCart');
        if (!container) return;
        
        const entries = Object.entries(state.cart);
        
        if (entries.length === 0) {
            container.innerHTML = '';
            empty?.classList.remove('hidden');
            updateCartUI();
            return;
        }
        empty?.classList.add('hidden');
        
        container.innerHTML = entries.map(([id, qty]) => {
            const p = state.products.find(x => x.id === id);
            if (!p) return '';
            return `
            <div class="flex items-center justify-between py-3.5 gap-3">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-800 truncate">${escapeHtml(p.name)}</div>
                    <div class="text-xs text-slate-400 mt-0.5">${fmt(p.price)} × ${qty} шт</div>
                </div>
                <div class="font-bold text-blue-600 text-sm whitespace-nowrap">${fmt(p.price * qty)}</div>
                <div class="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button class="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm font-bold" data-action="dec" data-id="${id}">−</button>
                    <span class="w-6 text-center text-xs font-bold">${qty}</span>
                    <button class="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm font-bold" data-action="inc" data-id="${id}">+</button>
                </div>
            </div>`;
        }).join('');
        
        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                addToCart(id, btn.dataset.action === 'inc' ? 1 : -1);
            });
        });
        
        updateCartUI();
    }

    // ========== RENDER CAROUSEL ==========
    function renderCarousel() {
        const featured = state.products.slice(0, 5);
        const container = $('#carouselContainer');
        const dots = $('#carouselDots');
        if (!container || !dots) return;
        
        if (featured.length === 0) {
            container.innerHTML = `<div class="carousel-slide flex items-center justify-center text-slate-400 text-sm">Витрина товаров пуста</div>`;
            dots.innerHTML = '';
            return;
        }
        
        container.innerHTML = featured.map((p) => {
            const img = p.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=dbeafe&color=2563eb&size=400`;
            return `
            <div class="carousel-slide flex items-center justify-between px-8 py-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 w-full shrink-0">
                <div class="max-w-xs">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">Рекомендуемый товар</span>
                    <h3 class="text-lg font-bold text-slate-800 mt-2 line-clamp-1">${escapeHtml(p.name)}</h3>
                    <div class="text-xl font-extrabold text-blue-600 mt-1">${fmt(p.price)}</div>
                </div>
                <img src="${img}" alt="${escapeHtml(p.name)}" class="w-28 h-28 object-cover rounded-2xl shadow-md border-2 border-white shrink-0">
            </div>`;
        }).join('');
        
        dots.innerHTML = featured.map((_, i) => 
            `<button class="w-2 h-2 rounded-full transition-all ${i === 0 ? 'bg-blue-600 w-5' : 'bg-slate-300'}" data-idx="${i}"></button>`
        ).join('');
        
        state.carouselIndex = 0;
        updateCarousel();
        
        dots.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                state.carouselIndex = +btn.dataset.idx;
                updateCarousel();
            });
        });
    }

    function updateCarousel() {
        const container = $('#carouselContainer');
        if (!container || !container.children.length) return;
        const slides = container.children.length;
        state.carouselIndex = (state.carouselIndex + slides) % slides;
        container.style.transform = `translateX(-${state.carouselIndex * 100}%)`;
        
        $$('#carouselDots button').forEach((btn, i) => {
            btn.className = `w-2 h-2 rounded-full transition-all ${i === state.carouselIndex ? 'bg-blue-600 w-5' : 'bg-slate-300'}`;
        });
    }

    // ========== RENDER ADMIN PRODUCTS & STATS ==========
    function renderAdminProducts() {
        const container = $('#adminProductsList');
        if (!container) return;

        if (state.products.length === 0) {
            container.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">Товары отсутствуют в базе</p>`;
            return;
        }

        // Группировка по категориям
        const groups = {};
        state.products.forEach(p => {
            const key = p.category || 'Без категории';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        const order = [...state.categories.filter(c => groups[c]), ...Object.keys(groups).filter(k => !state.categories.includes(k))];

        container.innerHTML = order.map(cat => {
            const items = groups[cat] || [];
            const list = items.map(p => `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-200/80 rounded-xl transition-all hover:shadow-sm">
                <div class="flex items-center space-x-3 min-w-0">
                    <img src="${p.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name) + '&background=dbeafe&color=2563eb'}" class="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-100">
                    <div class="min-w-0">
                        <p class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(p.name)}</p>
                        <p class="text-xs text-slate-400">
                            <span class="text-blue-600 font-bold">${fmt(p.price)}</span>
                            · закуп ${fmt(p.costPrice || 0)} · ${p.stock} шт
                        </p>
                    </div>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                    <button onclick="window.B2B_EditProduct('${p.id}')" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg border border-amber-200">Изменить</button>
                    <button onclick="window.B2B_DeleteProduct('${p.id}')" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200">Удалить</button>
                </div>
            </div>`).join('');
            return `
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2 px-1">
                    <h4 class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(cat)}</h4>
                    <span class="text-[11px] text-slate-400">${items.length} шт</span>
                </div>
                <div class="space-y-2">${list}</div>
            </div>`;
        }).join('');
    }

    function filterInvoicesByPeriod() {
        const now = new Date();
        return state.invoices.filter(inv => {
            if (!inv.createdAt) return false;
            const invDate = new Date(inv.createdAt);
            
            if (state.reportPeriod === 'today') {
                return invDate.toDateString() === now.toDateString();
            }
            if (state.reportPeriod === 'week') {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return invDate >= weekAgo;
            }
            if (state.reportPeriod === 'month') {
                return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
            }
            if (state.reportPeriod === 'custom') {
                const from = state.reportDateFrom ? new Date(state.reportDateFrom) : new Date(0);
                const to = state.reportDateTo ? new Date(state.reportDateTo) : new Date(8640000000000000);
                to.setHours(23, 59, 59, 999);
                return invDate >= from && invDate <= to;
            }
            return true; // 'all'
        });
    }

    function renderAdminStats() {
        const filteredInvoices = filterInvoicesByPeriod();
        
        let totalRevenue = 0;   // Выручка
        let totalCost = 0;      // Себестоимость

        filteredInvoices.forEach(inv => {
            totalRevenue += inv.total || 0;
            (inv.items || []).forEach(item => {
                const product = state.products.find(p => p.id === item.productId);
                const costPrice = item.costPrice || product?.costPrice || 0;
                totalCost += costPrice * item.qty;
            });
        });

        const grossProfit = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
        const markupPercent = totalCost > 0 ? ((grossProfit / totalCost) * 100).toFixed(1) : 0;

        if ($('#statRevenue')) $('#statRevenue').textContent = fmt(totalRevenue);
        if ($('#statCount')) $('#statCount').textContent = filteredInvoices.length;
        if ($('#statProducts')) $('#statProducts').textContent = state.products.length;
        if ($('#statCost')) $('#statCost').textContent = fmt(totalCost);
        if ($('#statProfit')) $('#statProfit').textContent = fmt(grossProfit);
        if ($('#statMargin')) $('#statMargin').textContent = `${marginPercent}%`;
        if ($('#statMarkup')) $('#statMarkup').textContent = `${markupPercent}%`;

        const list = $('#invoicesHistoryList');
        if (!list) return;

        if (filteredInvoices.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Накладные за выбранный период отсутствуют</p>`;
            return;
        }
        
        list.innerHTML = filteredInvoices.map(inv => {
            const date = inv.createdAt ? new Date(inv.createdAt).toLocaleString('ru-RU') : '—';
            let invCost = 0;

            const itemsList = (inv.items || []).map(item => {
                const product = state.products.find(p => p.id === item.productId);
                const costPrice = item.costPrice || product?.costPrice || 0;
                const itemTotalCost = costPrice * item.qty;
                const itemRevenue = (item.price || 0) * item.qty;
                const itemProfit = itemRevenue - itemTotalCost;
                invCost += itemTotalCost;

                return `
                <div class="flex justify-between items-center text-[11px] text-slate-600 border-t border-slate-100 pt-1.5 mt-1.5">
                    <div class="min-w-0 flex-1">
                        <span class="font-medium text-slate-800">${escapeHtml(item.name || 'Товар')}</span>
                        <span class="text-slate-400 font-normal"> (Закуп: ${fmt(costPrice)} | Продажа: ${fmt(item.price)})</span>
                        <b class="text-slate-800"> × ${item.qty} шт</b>
                    </div>
                    <div class="text-right ml-2 whitespace-nowrap">
                        <div class="font-medium text-slate-700">${fmt(itemRevenue)}</div>
                        <div class="text-[10px] text-emerald-600 font-semibold">Прибыль: +${fmt(itemProfit)}</div>
                    </div>
                </div>`;
            }).join('');

            const invProfit = (inv.total || 0) - invCost;

            return `
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 text-xs shadow-sm mb-3">
                <div class="flex justify-between items-start gap-2 border-b border-slate-200/60 pb-2 mb-2">
                    <div>
                        <div class="font-bold text-slate-800 text-sm">${escapeHtml(inv.store || 'Магазин')}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">${date} • Покупатель: ${escapeHtml(inv.userName || '—')}</div>
                        ${inv.delivery ? `<div class="text-[11px] text-blue-600 mt-1 font-medium">${escapeHtml(inv.delivery.address || '—')}${inv.delivery.exactNote ? ' · ' + escapeHtml(inv.delivery.exactNote) : ''}${inv.delivery.lat ? ' · карта: ' + inv.delivery.lat + ',' + inv.delivery.lng : ''}</div>` : ''}
                        ${inv.adminNote ? `<div class="text-[11px] text-cyan-700 mt-0.5">Админ: ${escapeHtml(inv.adminNote)}</div>` : ''}
                    </div>
                    <div class="flex items-center space-x-3">
                        <div class="text-right">
                            <div class="font-extrabold text-emerald-600 text-base whitespace-nowrap">${fmt(inv.total || 0)}</div>
                            <div class="text-[10px] text-slate-500 font-medium">Прибыль: <span class="text-emerald-700 font-bold">${fmt(invProfit)}</span></div>
                        </div>
                        <button onclick="window.B2B_PrintInvoice('${inv.id}')" class="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs flex items-center space-x-1 shadow-sm transition-colors" title="Распечатать накладную">
                            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                            <span>Печать</span>
                        </button>
                    </div>
                </div>
                
                <div class="bg-white p-2.5 rounded-xl border border-slate-100 space-y-1">
                    <div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Заказанные товары и маржинальность:</div>
                    ${itemsList || '<div class="text-[11px] text-slate-400">Состав заказа пуст</div>'}
                </div>
            </div>`;
        }).join('');
    }

    // ========== PRINT INVOICE & REPORT FUNCTIONS ==========
    window.B2B_PrintInvoice = function(invId) {
        const inv = state.invoices.find(i => i.id === invId);
        if (!inv) {
            toast('Накладная не найдена', 'error');
            return;
        }

        const date = inv.createdAt ? new Date(inv.createdAt).toLocaleString('ru-RU') : '—';
        
        const rowsHtml = (inv.items || []).map((item, idx) => `
            <tr>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee;">${escapeHtml(item.name || 'Товар')}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${item.qty} шт</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${fmt(item.price || 0)}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${fmt((item.price || 0) * item.qty)}</td>
            </tr>
        `).join('');

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Накладная № ${inv.id}</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #1e293b; line-height: 1.4; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #db2777; padding-bottom: 12px; margin-bottom: 20px; }
                    .title { font-size: 20px; font-weight: bold; color: #db2777; }
                    .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
                    th { background: #f8fafc; padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; }
                    .total { text-align: right; font-size: 16px; font-weight: bold; color: #059669; margin-top: 10px; }
                    .signatures { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
                    .sig-line { border-top: 1px solid #cbd5e1; width: 180px; margin-top: 30px; text-align: center; padding-top: 4px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">S-Market</div>
                        <div style="font-size: 12px; color: #475569;">Торговая точка: <b>${escapeHtml(inv.store || 'Магазин')}</b></div>
                    </div>
                    <div style="text-align: right; font-size: 12px;">
                        <div><b>№:</b> ${inv.id}</div>
                        <div><b>Дата:</b> ${date}</div>
                    </div>
                </div>

                <div class="meta">
                    <b>Заказчик (Покупатель):</b> ${escapeHtml(inv.userName || '—')}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">№</th>
                            <th>Наименование товара</th>
                            <th style="text-align: right;">Кол-во</th>
                            <th style="text-align: right;">Цена</th>
                            <th style="text-align: right;">Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="total">Итого к оплате: ${fmt(inv.total || 0)}</div>

                <div class="signatures">
                    <div>
                        <div>Отпустил:</div>
                        <div class="sig-line">Подпись</div>
                    </div>
                    <div>
                        <div>Принял:</div>
                        <div class="sig-line">Подпись</div>
                    </div>
                </div>

                <script>
                    window.onload = function() { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    window.B2B_PrintReport = function() {
        const filteredInvoices = filterInvoicesByPeriod();
        
        let totalRevenue = 0;
        let totalCost = 0;

        filteredInvoices.forEach(inv => {
            totalRevenue += inv.total || 0;
            (inv.items || []).forEach(item => {
                const product = state.products.find(p => p.id === item.productId);
                const costPrice = item.costPrice || product?.costPrice || 0;
                totalCost += costPrice * item.qty;
            });
        });

        const grossProfit = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
        const markupPercent = totalCost > 0 ? ((grossProfit / totalCost) * 100).toFixed(1) : 0;

        const periodTitle = {
            today: 'За сегодня',
            week: 'За последние 7 дней',
            month: 'За текущий месяц',
            all: 'За всё время',
            custom: `С ${state.reportDateFrom || '...'} по ${state.reportDateTo || '...'}`
        }[state.reportPeriod] || 'За выбранный период';

        const rowsHtml = filteredInvoices.map((inv, idx) => {
            let invCost = 0;
            (inv.items || []).forEach(item => {
                const product = state.products.find(p => p.id === item.productId);
                invCost += (item.costPrice || product?.costPrice || 0) * item.qty;
            });
            const invProfit = (inv.total || 0) - invCost;
            const invMargin = inv.total > 0 ? ((invProfit / inv.total) * 100).toFixed(1) : 0;

            return `
            <tr>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee;">${escapeHtml(inv.store || 'Магазин')}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee;">${inv.createdAt ? new Date(inv.createdAt).toLocaleString('ru-RU') : '—'}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${fmt(invCost)}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${fmt(inv.total || 0)}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; color: #059669; font-weight: bold;">${fmt(invProfit)}</td>
                <td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${invMargin}%</td>
            </tr>`;
        }).join('');

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Финансовый отчет — B2B Trade</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; line-height: 1.4; }
                    .header { border-bottom: 2px solid #db2777; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .title { font-size: 22px; font-weight: bold; color: #db2777; }
                    .period { font-size: 13px; color: #64748b; font-weight: 600; }
                    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
                    .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
                    .stat-label { font-size: 10px; uppercase; font-weight: bold; color: #64748b; margin-bottom: 4px; }
                    .stat-val { font-size: 16px; font-weight: 800; color: #0f172a; }
                    .stat-val.profit { color: #059669; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th { background: #f1f5f9; padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">B2B Trade — Финансовый отчет по продажам</div>
                        <div class="period">Период: ${periodTitle}</div>
                    </div>
                    <div style="font-size: 11px; color: #64748b;">Дата формирования: ${new Date().toLocaleString('ru-RU')}</div>
                </div>

                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-label">Общий оборот (Выручка)</div>
                        <div class="stat-val">${fmt(totalRevenue)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Себестоимость (Закуп)</div>
                        <div class="stat-val">${fmt(totalCost)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Чистая прибыль</div>
                        <div class="stat-val profit">${fmt(grossProfit)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Маржа / Наценка</div>
                        <div class="stat-val">${marginPercent}% / ${markupPercent}%</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px; text-align: center;">№</th>
                            <th>Магазин / Точка</th>
                            <th>Дата выписки</th>
                            <th style="text-align: right;">Закуп</th>
                            <th style="text-align: right;">Продажа</th>
                            <th style="text-align: right;">Прибыль</th>
                            <th style="text-align: right;">Маржа %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <script>
                    window.onload = function() { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // ========== GLOBAL PRODUCT ACTIONS ==========
    window.B2B_EditProduct = function(id) {
        const product = state.products.find(p => p.id === id);
        if (!product) return;
        
        if ($('#productId')) $('#productId').value = product.id;
        if ($('#prodName')) $('#prodName').value = product.name;
        if ($('#prodPrice')) $('#prodPrice').value = product.price;
        if ($('#prodCostPrice')) $('#prodCostPrice').value = product.costPrice || 0;
        if ($('#prodStock')) $('#prodStock').value = product.stock;
        if ($('#prodImageUrl')) $('#prodImageUrl').value = product.image || '';
        fillCategorySelects();
        if ($('#prodCategory')) $('#prodCategory').value = product.category || '';
        
        if ($('#formTitle')) $('#formTitle').textContent = 'Редактирование товара';
        if ($('#saveProdBtn')) $('#saveProdBtn').textContent = 'Сохранить изменения';
        if ($('#resetFormBtn')) $('#resetFormBtn').classList.remove('hidden');
        
        window.scrollTo({ top: $('#addProductForm').offsetTop - 100, behavior: 'smooth' });
    };

    window.B2B_DeleteProduct = async function(id) {
        if (!confirm('Вы действительно хотите удалить этот товар?')) return;
        try {
            await deleteProductFromDb(id);
            renderAdminProducts();
            renderCatalog();
            renderCarousel();
            renderAdminStats();
            toast('Товар успешно удален', 'success');
        } catch (e) {
            toast('Ошибка при удалении товара', 'error');
        }
    };

    function resetProductForm() {
        if ($('#addProductForm')) $('#addProductForm').reset();
        if ($('#productId')) $('#productId').value = '';
        if ($('#formTitle')) $('#formTitle').textContent = 'Добавление товара';
        if ($('#saveProdBtn')) $('#saveProdBtn').textContent = 'Сохранить товар в базе';
        if ($('#resetFormBtn')) $('#resetFormBtn').classList.add('hidden');
    }

    // ========== IMPORT FEATURE ==========
    function downloadSampleCSV() {
        // Колонки: Название; Категория; Продажная цена; Закупочная цена; Количество; Ссылка на фото
        const headers = ["Название", "Категория", "Продажная цена", "Закупочная цена", "Количество", "Ссылка на фото"];
        const rows = [
            ["Чай KARAK Tea", "Напитки", 1500, 1000, 50, "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500"],
            ["Кофе Арабика 250г", "Напитки", 3200, 2100, 30, "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500"],
            ["Чипсы Lays 150г", "Снэки", 320, 200, 95, ""],
            ["Шоколад Nestle", "Сладости", 450, 300, 60, ""],
            ["Йогурт Danone", "Молочное", 210, 140, 150, ""],
            ["Футболка базовая", "Одежда", 3990, 2000, 40, ""],
            ["Смартфон чехол", "Техника", 2500, 1200, 80, ""]
        ];

        let csvString = "\uFEFF" + headers.join(";") + "\n";
        rows.forEach(row => {
            csvString += row.join(";") + "\n";
        });

        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "sample_products_s-market.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast('Скачан пример CSV с категориями', 'success');
    }

    function parseImportRow(obj) {
        // Поддержка разных ключей (RU/EN) для JSON и нормализация
        const name = (obj.name || obj.Название || obj.title || '').toString().trim() || 'Без названия';
        const category = (obj.category || obj.Категория || obj.categoryName || '').toString().trim() || null;
        const price = Number(obj.price ?? obj['Продажная цена'] ?? obj.salePrice ?? 0) || 0;
        const costPrice = Number(obj.costPrice ?? obj['Закупочная цена'] ?? obj.cost ?? 0) || 0;
        const stock = Number(obj.stock ?? obj['Количество'] ?? obj.qty ?? obj.quantity ?? 0) || 0;
        const image = (obj.image || obj['Ссылка на фото'] || obj.imageUrl || obj.photo || '').toString().trim() || null;
        return { name, category, price, costPrice, stock, image };
    }

    function parseCsvProducts(text) {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) return [];

        const delim = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));

        // Индексы колонок по заголовкам (гибко)
        const idx = {
            name: headers.findIndex(h => /назван|name|title|товар/.test(h)),
            category: headers.findIndex(h => /категор|category/.test(h)),
            price: headers.findIndex(h => /продаж|price|цена$|sale/.test(h) && !/закуп|cost/.test(h)),
            cost: headers.findIndex(h => /закуп|cost/.test(h)),
            stock: headers.findIndex(h => /количест|stock|остаток|qty|quantity/.test(h)),
            image: headers.findIndex(h => /ссылк|фото|image|photo|url|картинк/.test(h))
        };
        // Старый формат без категории: Название; Цена; Закуп; Кол-во; Фото
        if (idx.name < 0) idx.name = 0;
        if (idx.price < 0) idx.price = idx.category >= 0 ? 2 : 1;
        if (idx.cost < 0) idx.cost = idx.category >= 0 ? 3 : 2;
        if (idx.stock < 0) idx.stock = idx.category >= 0 ? 4 : 3;
        if (idx.image < 0) idx.image = idx.category >= 0 ? 5 : 4;

        return lines.slice(1).map(line => {
            const parts = line.split(delim).map(p => p.trim().replace(/^"|"$/g, ''));
            const category = idx.category >= 0 ? (parts[idx.category] || '').trim() : '';
            return {
                name: (parts[idx.name] || 'Без названия').trim(),
                category: category || null,
                price: Number(parts[idx.price]) || 0,
                costPrice: Number(parts[idx.cost]) || 0,
                stock: Number(parts[idx.stock]) || 0,
                image: (parts[idx.image] || '').trim() || null
            };
        }).filter(p => p.name && p.name !== 'Без названия' || p.price > 0);
    }

    async function handleFileImport(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            let importedProducts = [];

            try {
                if (file.name.toLowerCase().endsWith('.json')) {
                    const raw = JSON.parse(text);
                    const arr = Array.isArray(raw) ? raw : (raw.products || raw.items || []);
                    importedProducts = arr.map(parseImportRow);
                } else {
                    importedProducts = parseCsvProducts(text);
                }

                if (!importedProducts.length) {
                    toast('Файл пуст или содержит неверные данные', 'warn');
                    return;
                }

                // Собираем категории из импорта и добавляем в список
                const catsFromFile = [...new Set(
                    importedProducts.map(p => p.category).filter(Boolean)
                )];
                let addedCats = 0;
                for (const c of catsFromFile) {
                    if (!state.categories.some(x => x.toLowerCase() === c.toLowerCase())) {
                        state.categories.push(c);
                        addedCats++;
                    }
                }
                if (addedCats || catsFromFile.length) {
                    state.categories.sort((a, b) => a.localeCompare(b, 'ru'));
                    persistCategories();
                }

                for (const prod of importedProducts) {
                    await saveProduct(prod);
                }

                await loadProducts();
                loadCategories();
                fillCategorySelects();
                renderCategoryChips();
                renderCatalog();
                renderAdminProducts();
                renderAdminCategories();
                renderCarousel();
                renderAdminStats();

                const withCat = importedProducts.filter(p => p.category).length;
                toast(
                    `Импорт: ${importedProducts.length} товаров` +
                    (catsFromFile.length ? `, категорий: ${catsFromFile.length}` : '') +
                    (withCat ? ` (с категорией: ${withCat})` : ''),
                    'success'
                );
            } catch (err) {
                console.error(err);
                toast('Ошибка разбора файла импорта', 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    // ========== TABS ==========

    // ========== DELIVERY MAP (Leaflet / OSM) ==========
    function initDeliveryMap() {
        const el = document.getElementById('deliveryMap');
        if (!el || typeof L === 'undefined') return;
        if (state.deliveryMap) {
            setTimeout(() => state.deliveryMap.invalidateSize(), 100);
            return;
        }
        // Центр — Алматы (как Kaspi/OLX KZ)
        const defaultLat = 43.238949;
        const defaultLng = 76.945465;
        state.deliveryMap = L.map('deliveryMap', { zoomControl: true }).setView([defaultLat, defaultLng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(state.deliveryMap);
        state.deliveryMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(state.deliveryMap);
        const setCoords = (lat, lng) => {
            if ($('#deliveryLat')) $('#deliveryLat').value = lat.toFixed(6);
            if ($('#deliveryLng')) $('#deliveryLng').value = lng.toFixed(6);
        };
        setCoords(defaultLat, defaultLng);
        state.deliveryMap.on('click', (e) => {
            state.deliveryMarker.setLatLng(e.latlng);
            setCoords(e.latlng.lat, e.latlng.lng);
        });
        state.deliveryMarker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            setCoords(pos.lat, pos.lng);
        });
        setTimeout(() => state.deliveryMap.invalidateSize(), 200);
    }

    function switchTab(tabId) {
        $$('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-gradient-to-r', 'from-blue-600', 'to-blue-700', 'bg-blue-600', 'text-white', 'shadow-md', 'shadow-sm');
            btn.classList.add('bg-white', 'text-slate-500');
        });
        $$('.tab-content').forEach(v => v.classList.add('hidden'));
        
        const btn = $(`#tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        const view = $(`#view${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        
        if (btn) {
            btn.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-white', 'text-slate-500');
        }
        if (view) view.classList.remove('hidden');
        
        if (tabId === 'favorites') {
            renderFavorites();
        }
        if (tabId === 'invoice') {
            renderInvoice();
            setTimeout(initDeliveryMap, 50);
        }
        if (tabId === 'admin') {
            renderAdminProducts();
            renderAdminCategories();
            fillCategorySelects();
            loadInvoices().then(renderAdminStats);
        }
        if (window.lucide) lucide.createIcons();
    }

    // ========== HELPERS ==========
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== INIT DATA ==========
    async function initAppData() {
        loadFavorites();
        await loadProducts();
        loadCategories();
        await loadInvoices();
        fillCategorySelects();
        renderCategoryChips();
        renderCatalog();
        renderFavorites();
        renderCarousel();
        updateCartUI();
        updateFavUI();
        renderAdminProducts();
        renderAdminCategories();
        renderAdminStats();
        
        setInterval(() => {
            if ($('#appScreen')?.classList.contains('hidden')) return;
            state.carouselIndex++;
            updateCarousel();
        }, 5000);
    }

    // ========== EVENT BINDINGS ==========
    function bindEvents() {
        // Tabs
        $('#tabCatalog')?.addEventListener('click', () => switchTab('catalog'));
        $('#catShowAllBtn')?.addEventListener('click', () => {
            state.activeCategory = 'all';
            renderCategoryChips();
            renderCatalog();
            toast('Показаны все категории');
        });
        $('#tabFavorites')?.addEventListener('click', () => switchTab('favorites'));
        $('#tabInvoice')?.addEventListener('click', () => switchTab('invoice'));
        $('#tabAdmin')?.addEventListener('click', () => switchTab('admin'));

        $('#addCategoryBtn')?.addEventListener('click', () => {
            addCategory($('#newCategoryInput')?.value);
            if ($('#newCategoryInput')) $('#newCategoryInput').value = '';
        });
        $('#adminAddCategoryBtn')?.addEventListener('click', () => {
            addCategory($('#adminNewCategory')?.value);
            if ($('#adminNewCategory')) $('#adminNewCategory').value = '';
        });
        $('#adminNewCategory')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCategory($('#adminNewCategory')?.value);
                $('#adminNewCategory').value = '';
            }
        });
        
        // Logout
        $('#logoutBtn')?.addEventListener('click', logout);
        
        // Reset form
        $('#resetFormBtn')?.addEventListener('click', resetProductForm);
        
        // Import & Export Sample
        $('#downloadSampleBtn')?.addEventListener('click', downloadSampleCSV);
        $('#importFileInput')?.addEventListener('change', (e) => {
            if (e.target.files?.[0]) handleFileImport(e.target.files[0]);
        });

        // Print Report
        $('#printReportBtn')?.addEventListener('click', window.B2B_PrintReport);

        // Period filter buttons
        $$('.report-period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.report-period-btn').forEach(b => {
                    b.classList.remove('active', 'bg-blue-100', 'text-blue-700', 'border', 'border-blue-200');
                    b.classList.add('bg-slate-100', 'text-slate-600');
                });
                btn.classList.add('active', 'bg-blue-100', 'text-blue-700', 'border', 'border-blue-200');
                btn.classList.remove('bg-slate-100', 'text-slate-600');
                
                state.reportPeriod = btn.dataset.period;
                renderAdminStats();
            });
        });

        $('#reportDateFrom')?.addEventListener('change', (e) => {
            state.reportDateFrom = e.target.value;
            state.reportPeriod = 'custom';
            renderAdminStats();
        });
        $('#reportDateTo')?.addEventListener('change', (e) => {
            state.reportDateTo = e.target.value;
            state.reportPeriod = 'custom';
            renderAdminStats();
        });

        // ─── Google Sign-In ───
        $('#googleAuthBtn')?.addEventListener('click', async () => {
            if (window.B2B && window.B2B.USE_DEMO) {
                demoLogin(!!window.event?.shiftKey);
                return;
            }
            if (!window.B2B || !window.B2B.auth) {
                toast('Firebase не инициализирован', 'error');
                return;
            }
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const result = await window.B2B.auth.signInWithPopup(provider);
                await handleAuthSuccess(result.user);
            } catch (err) {
                toast(err.message || 'Ошибка входа Google', 'error');
            }
        });
        
        // ─── Phone OTP ───
        $('#sendOtpBtn')?.addEventListener('click', async () => {
            let phone = $('#phoneNumber').value.trim().replace(/[\s\-()]/g, '');
            if (/^[78]\d{10}$/.test(phone)) {
                phone = '+' + (phone.startsWith('8') ? '7' + phone.slice(1) : phone);
            }
            if (!phone.startsWith('+')) phone = '+7' + phone.replace(/^0+/, '');
            
            if (!/^\+[1-9]\d{10,14}$/.test(phone)) {
                toast('Введите номер в формате +77001234567', 'warn');
                return;
            }
            
            if (window.B2B && window.B2B.USE_DEMO) {
                $('#phoneAuthContainer')?.classList.add('hidden');
                $('#otpContainer')?.classList.remove('hidden');
                toast('Код отправлен (демо: 123456)', 'info');
                return;
            }
        });

        $('#verifyOtpBtn')?.addEventListener('click', () => {
            const code = $('#otpCode')?.value.trim();
            if (window.B2B && window.B2B.USE_DEMO) {
                if (code === '123456') demoLogin(false);
                else toast('Неверный код. Демо-код: 123456', 'error');
            }
        });
        
        // Search & Sort
        $('#searchInput')?.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderCatalog();
        });
        $('#sortSelect')?.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderCatalog();
        });
        
        // Store select
        
        // Submit Invoice
        $('#submitInvoiceBtn')?.addEventListener('click', async () => {
            const store = $('#selectStore').value;
            if (!store) {
                toast('Выберите способ получения', 'warn');
                return;
            }
            if (getCartCount() === 0) {
                toast('Корзина пуста', 'warn');
                return;
            }
            const isDelivery = store.includes('Доставка');
            const address = ($('#deliveryAddress')?.value || '').trim();
            const exactNote = ($('#deliveryExactNote')?.value || '').trim();
            if (isDelivery && address.length < 4) {
                toast('Укажите адрес доставки', 'warn');
                return;
            }
            
            const items = Object.entries(state.cart).map(([productId, qty]) => {
                const p = state.products.find(x => x.id === productId);
                return { 
                    productId, 
                    name: p?.name, 
                    price: p?.price || 0,
                    costPrice: p?.costPrice || 0,
                    qty 
                };
            });
            
            const invoice = {
                store,
                items,
                total: getCartTotal(),
                userId: state.user?.uid || 'demo',
                userName: state.user?.displayName || 'Покупатель',
                role: state.role || 'buyer',
                delivery: {
                    address: address || null,
                    exactNote: exactNote || null,
                    lat: $('#deliveryLat')?.value || null,
                    lng: $('#deliveryLng')?.value || null,
                    type: isDelivery ? 'courier' : 'pickup'
                },
                status: 'new',
                adminNote: null
            };
            
            try {
                await saveInvoice(invoice);
                state.cart = {};
                if ($('#deliveryAddress')) $('#deliveryAddress').value = '';
                if ($('#deliveryExactNote')) $('#deliveryExactNote').value = '';
                updateCartUI();
                renderInvoice();
                renderCatalog();
                toast('Заказ оформлен успешно!', 'success');
                switchTab('catalog');
            } catch (e) {
                console.error(e);
                toast('Ошибка сохранения заказа', 'error');
            }
        });
        
        // Live-check address for submit enable
        $('#deliveryAddress')?.addEventListener('input', updateCartUI);
        $('#selectStore')?.addEventListener('change', () => {
            updateCartUI();
            const isDelivery = ($('#selectStore')?.value || '').includes('Доставка');
            const block = $('#deliveryBlock');
            if (block) block.style.opacity = isDelivery ? '1' : '0.65';
        });
        
        // Save / Edit Product Form
        $('#addProductForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = $('#productId').value;
            const name = $('#prodName').value.trim();
            const price = +$('#prodPrice').value;
            const costPrice = +$('#prodCostPrice').value || 0;
            const stock = +$('#prodStock').value;
            const imageUrlInput = $('#prodImageUrl')?.value.trim();
            const fileInput = $('#prodImage');
            
            if (!name || price < 0 || stock < 0) {
                toast('Заполните все поля корректно', 'warn');
                return;
            }
            
            let image = imageUrlInput || null;
            if (fileInput?.files?.[0]) {
                image = URL.createObjectURL(fileInput.files[0]);
            }
            
            const category = ($('#prodCategory')?.value || '').trim() || null;
            const product = {
                ...(id ? { id } : {}),
                name,
                price,
                costPrice,
                stock,
                image,
                category
            };
            
            try {
                await saveProduct(product);
                resetProductForm();
                await loadProducts();
                renderCatalog();
                renderCarousel();
                renderAdminProducts();
                renderAdminStats();
                toast(id ? 'Товар обновлен' : 'Товар добавлен', 'success');
            } catch (err) {
                toast('Ошибка сохранения товара', 'error');
            }
        });
        
        // Carousel controls
        $('#carouselPrev')?.addEventListener('click', () => {
            state.carouselIndex--;
            updateCarousel();
        });
        $('#carouselNext')?.addEventListener('click', () => {
            state.carouselIndex++;
            updateCarousel();
        });
    }

    // ========== BOOT ==========
    document.addEventListener('DOMContentLoaded', () => {
        if (window.lucide) lucide.createIcons();
        bindEvents();
        
        if (window.B2B && window.B2B.USE_DEMO) {
            $('#demoNotice')?.classList.remove('hidden');
            const saved = window.B2B.DemoStore.get('user');
            if (saved) showApp(saved, saved.role || 'buyer');
        } else if (window.B2B && window.B2B.auth) {
            window.B2B.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    if (!state.user || state.user.uid !== user.uid) {
                        const role = await window.B2B.resolveUserRole(user);
                        await window.B2B.ensureUserProfile(user, role);
                        await showApp(user, role);
                    }
                }
            });
        }
    });
})();
