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
        cart: {},          // { productId: qty }
        invoices: [],
        carouselIndex: 0,
        searchQuery: '',
        sortBy: 'name',
        category: 'all',
        favorites: JSON.parse(localStorage.getItem('smarket_favorites') || '[]'),
        categories: [],
        reportPeriod: 'today', // 'today' | 'week' | 'month' | 'all' | 'custom'
        reportDateFrom: null,
        reportDateTo: null,
        shopSettings: { name: 'S-Market', address: '', deliveryPrice: 500, freeDeliveryFrom: 10000, notice: '', lat: 43.2627, lng: 76.9345 },
        deliveryMap: null,
        adminMap: null,
        deliveryMarker: null,
        adminMarker: null
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
            info: 'bg-white border-pink-200 text-slate-700 shadow-lg shadow-pink-500/5',
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

    // ========== CATEGORIES & FAVORITES ==========
    async function loadCategories() {
        const fallback = ['Такси', 'Мастера', 'Скот / Агро', 'Авто', 'Жильё', 'Одежда', 'Техника', 'Еда / Кафе'];
        try {
            if (window.B2B?.USE_DEMO) state.categories = window.B2B.DemoStore.get('categories', fallback);
            else {
                const db = window.db || window.B2B?.db || firebase.firestore();
                const snap = await db.collection('settings').doc('shop').get();
                state.categories = snap.exists && Array.isArray(snap.data().categories) ? snap.data().categories : fallback;
            }
        } catch { state.categories = fallback; }
        renderCategoryControls();
    }
    async function saveCategories() {
        if (window.B2B?.USE_DEMO) window.B2B.DemoStore.set('categories', state.categories);
        else await (window.db || window.B2B?.db || firebase.firestore()).collection('settings').doc('shop').set({ categories: state.categories }, { merge: true });
        renderCategoryControls();
    }
    function categoryIcon(name) {
        const n = String(name || '').toLowerCase();
        if (/такси|транспорт|достав/.test(n)) return 'car-front';
        if (/мастер|услуг|ремонт|стро|электрик|сантех/.test(n)) return 'wrench';
        if (/скот|агро|ферм|живот/.test(n)) return 'tractor';
        if (/авто|машин|запчаст/.test(n)) return 'car';
        if (/жиль|кварт|дом|недвиж/.test(n)) return 'house';
        if (/одеж|обув|мод|аксесс/.test(n)) return 'shirt';
        if (/техник|телефон|смартф|компьют|электрон/.test(n)) return 'smartphone';
        if (/еда|кафе|ресторан|продукт|напит/.test(n)) return 'utensils';
        if (/красот|космет|здоров/.test(n)) return 'sparkles';
        if (/мебел/.test(n)) return 'armchair';
        if (/дет|игр|ребен/.test(n)) return 'baby';
        if (/работ|ваканс/.test(n)) return 'briefcase-business';
        if (/услуг/.test(n)) return 'hand-helping';
        return 'shopping-bag';
    }

    function renderCategoryGrid() {
        const grid = $('#categoryGrid');
        if (!grid) return;
        const visible = state.categories.slice(0, 7);
        const all = [{ name: 'Все', value: 'all', icon: 'grid-2x2' }, ...visible.map(c => ({ name: c, value: c, icon: categoryIcon(c) }))];
        grid.innerHTML = all.map(c => {
            const active = state.category === c.value;
            return `<button type="button" class="category-card ${active ? 'active' : ''}" data-show-category="${escapeHtml(c.value)}" aria-label="${escapeHtml(c.name)}">
                <span class="category-icon"><i data-lucide="${c.icon}"></i></span>
                <span class="category-name">${escapeHtml(c.name)}</span>
            </button>`;
        }).join('');
        grid.querySelectorAll('[data-show-category]').forEach(btn => btn.addEventListener('click', () => {
            state.category = btn.dataset.showCategory;
            renderCategoryControls();
            renderCatalog();
            document.getElementById('viewCatalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        if (window.lucide) lucide.createIcons();
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#allCategoriesBtn')) {
            state.category = 'all';
            renderCategoryControls();
            renderCatalog();
            document.getElementById('viewCatalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    function renderCategoryControls() {
        const chips = $('#categoryChips');
        if (chips) chips.innerHTML = ['all', ...state.categories].map(c => {
            const label = c === 'all' ? 'Все' : c;
            const active = state.category === c;
            return `<button class="category-chip px-4 py-2 rounded-full text-xs font-semibold border ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}" data-category="${escapeHtml(c)}">${escapeHtml(label)}</button>`;
        }).join('');
        chips?.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', () => { state.category=b.dataset.category; renderCategoryControls(); renderCatalog(); }));
        renderCategoryGrid();
        const select = $('#prodCategory');
        if (select) { const current=select.value; select.innerHTML='<option value="">Без категории</option>'+state.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(''); select.value=current; }
        const admin = $('#adminCategoriesList');
        if (admin) admin.innerHTML = state.categories.map(c => `<span class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold"><span>${escapeHtml(c)}</span><button data-remove-category="${escapeHtml(c)}" class="text-slate-400 hover:text-rose-500">×</button></span>`).join('');
        admin?.querySelectorAll('[data-remove-category]').forEach(b=>b.addEventListener('click', async()=>{ const c=b.dataset.removeCategory; state.categories=state.categories.filter(x=>x!==c); state.products.forEach(p=>{if(p.category===c)p.category='';}); await saveCategories(); renderCatalog(); renderAdminProducts(); }));
    }
    function toggleFavorite(id) {
        const set = new Set(state.favorites);
        set.has(id) ? set.delete(id) : set.add(id);
        state.favorites = [...set]; localStorage.setItem('smarket_favorites', JSON.stringify(state.favorites));
        renderCatalog(); renderFavorites();
    }
    function renderFavorites() {
        const list=$('#favoriteList'), empty=$('#emptyFavorites'); if(!list)return;
        const items=state.products.filter(p=>state.favorites.includes(p.id));
        empty?.classList.toggle('hidden', items.length>0);
        list.innerHTML=items.map(p=>productCard(p)).join(''); bindProductActions(list);
    }
    function productCard(p) {
        const qty=state.cart[p.id]||0, fav=state.favorites.includes(p.id);
        const img=p.image||`https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=eff6ff&color=2563eb&size=200`;
        return `<div class="marketplace-card bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col">
          <div class="aspect-square bg-slate-50 relative overflow-hidden"><img src="${img}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=eff6ff&color=2563eb&size=200'">
          <button class="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 shadow flex items-center justify-center ${fav?'text-rose-500':'text-slate-400'}" data-action="fav" data-id="${p.id}" aria-label="Избранное"><i data-lucide="heart" class="w-4 h-4 ${fav?'fill-current':''}"></i></button>
          ${p.category?`<span class="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-white/90 text-[10px] font-semibold text-slate-600">${escapeHtml(p.category)}</span>`:''}</div>
          <div class="p-4 flex flex-col flex-1"><h4 class="font-bold text-slate-800 text-sm leading-tight line-clamp-2 mb-2">${escapeHtml(p.name)}</h4><div class="text-blue-600 font-extrabold text-lg">${fmt(p.price)}</div><div class="text-xs text-slate-400 mt-1 mb-4">В наличии: ${p.stock} шт.</div><div class="mt-auto">${qty>0?`<div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-1"><button class="w-8 h-8 rounded-xl bg-white shadow font-bold" data-action="dec" data-id="${p.id}">−</button><span class="font-bold text-sm">${qty}</span><button class="w-8 h-8 rounded-xl bg-white shadow font-bold" data-action="inc" data-id="${p.id}">+</button></div>`:`<button class="w-full py-3 bg-slate-900 hover:bg-blue-700 text-white text-xs font-semibold rounded-2xl" data-action="add" data-id="${p.id}">В корзину</button>`}</div></div></div>`;
    }
    function bindProductActions(list) { list.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const a=btn.dataset.action,id=btn.dataset.id;if(a==='fav')toggleFavorite(id);if(a==='add'||a==='inc')addToCart(id,1);if(a==='dec')addToCart(id,-1);})); if(window.lucide)lucide.createIcons(); }

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
            let query = db.collection('invoices');
            if (state.role !== 'admin' && state.user?.uid) query = query.where('userId', '==', state.user.uid);
            const snap = await query.orderBy('createdAt', 'desc').limit(100).get();
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

    // ========== SHOP / DELIVERY SETTINGS ==========
    async function loadShopSettings() {
        const fallback = { name: 'S-Market', address: '', deliveryPrice: 500, freeDeliveryFrom: 10000, notice: '', lat: 43.2627, lng: 76.9345, categories: ['Все товары'] };
        if (window.B2B && window.B2B.USE_DEMO) {
            state.shopSettings = { ...fallback, ...(window.B2B.DemoStore.get('shopSettings', {}) || {}) };
            return;
        }
        try {
            const db = window.B2B?.db || window.db;
            if (!db) { state.shopSettings = fallback; return; }
            const snap = await db.collection('settings').doc('shop').get();
            state.shopSettings = snap.exists ? { ...fallback, ...snap.data() } : fallback;
        } catch (e) { console.warn('settings:', e); state.shopSettings = fallback; }
    }

    async function saveShopSettings() {
        const data = {
            name: $('#shopName')?.value.trim() || 'Senimdi Sapa',
            address: $('#shopAddress')?.value.trim() || '',
            deliveryPrice: Number($('#deliveryPrice')?.value || 0),
            freeDeliveryFrom: Number($('#freeDeliveryFrom')?.value || 0),
            notice: $('#shopNotice')?.value.trim() || '',
            lat: state.shopSettings.lat,
            lng: state.shopSettings.lng,
            updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date().toISOString()
        };
        if (window.B2B && window.B2B.USE_DEMO) window.B2B.DemoStore.set('shopSettings', data);
        else await (window.B2B?.db || window.db).collection('settings').doc('shop').set(data, { merge: true });
        state.shopSettings = { ...state.shopSettings, ...data };
        renderDeliveryMap(); renderAdminMap(); updateCartUI();
        toast('Настройки магазина сохранены', 'success');
    }

    function calculateDelivery(subtotal) {
        if ($('#deliveryMethod')?.value === 'pickup') return 0;
        const s = state.shopSettings || {};
        return Number(s.freeDeliveryFrom) > 0 && subtotal >= Number(s.freeDeliveryFrom) ? 0 : Number(s.deliveryPrice || 0);
    }

    function renderDeliveryMap() {
        const el = $('#deliveryMap');
        if (!el || typeof L === 'undefined') return;
        const lat = state.shopSettings.lat || 43.2627, lng = state.shopSettings.lng || 76.9345;
        if (!state.deliveryMap) {
            state.deliveryMap = L.map(el).setView([lat, lng], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.deliveryMap);
            state.deliveryMap.on('click', e => setDeliveryPoint(e.latlng.lat, e.latlng.lng));
        } else state.deliveryMap.setView([lat, lng], 13);
        if (state.deliveryMarker) state.deliveryMarker.remove();
        state.deliveryMarker = L.marker([lat, lng]).addTo(state.deliveryMap).bindPopup('Точка доставки').openPopup();
        setTimeout(() => state.deliveryMap.invalidateSize(), 150);
    }

    function setDeliveryPoint(lat, lng) {
        if (state.deliveryMarker) state.deliveryMarker.remove();
        state.deliveryMarker = L.marker([lat, lng]).addTo(state.deliveryMap);
        state.deliveryMap?.setView([lat, lng], 15);
        const address = $('#deliveryAddress');
        if (address) address.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        toast('Точка доставки выбрана', 'success');
    }

    function renderAdminMap() {
        const el = $('#adminMap');
        if (!el || typeof L === 'undefined') return;
        const lat = state.shopSettings.lat || 43.2627, lng = state.shopSettings.lng || 76.9345;
        if (!state.adminMap) {
            state.adminMap = L.map(el).setView([lat, lng], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.adminMap);
            state.adminMap.on('click', e => {
                state.shopSettings.lat = e.latlng.lat; state.shopSettings.lng = e.latlng.lng;
                if (state.adminMarker) state.adminMarker.remove();
                state.adminMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(state.adminMap);
            });
        } else state.adminMap.setView([lat, lng], 13);
        if (state.adminMarker) state.adminMarker.remove();
        state.adminMarker = L.marker([lat, lng]).addTo(state.adminMap).bindPopup(state.shopSettings.name || 'Магазин');
        setTimeout(() => state.adminMap.invalidateSize(), 150);
    }

    function fillShopSettingsForm() {
        const s = state.shopSettings || {};
        if ($('#shopName')) $('#shopName').value = s.name || '';
        if ($('#shopAddress')) $('#shopAddress').value = s.address || '';
        if ($('#deliveryPrice')) $('#deliveryPrice').value = s.deliveryPrice ?? 500;
        if ($('#freeDeliveryFrom')) $('#freeDeliveryFrom').value = s.freeDeliveryFrom ?? 10000;
        if ($('#shopNotice')) $('#shopNotice').value = s.notice || '';
    }

    function renderBuyerOrders() {
        const list = $('#buyerOrdersList'); if (!list) return;
        const mine = state.invoices.filter(x => !state.user?.uid || x.userId === state.user.uid);
        if (!mine.length) { list.innerHTML = '<div class="text-center py-10 text-slate-400">У вас пока нет заказов.</div>'; return; }
        list.innerHTML = mine.map(inv => `
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="flex justify-between gap-3"><div><b class="text-slate-800">Заказ #${escapeHtml(String(inv.id).slice(-8))}</b><div class="text-xs text-slate-400 mt-1">${inv.createdAt ? new Date(inv.createdAt).toLocaleString('ru-RU') : '—'}</div></div><span class="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">${escapeHtml(inv.status || 'Новый')}</span></div>
                <div class="text-sm text-slate-600 mt-3">${(inv.items||[]).map(i => `${escapeHtml(i.name)} × ${i.qty}`).join(', ')}</div>
                <div class="flex flex-wrap gap-3 mt-3 text-xs"><span>Товары: <b>${fmt(inv.subtotal ?? inv.total)}</b></span><span>Доставка: <b>${fmt(inv.deliveryFee || 0)}</b></span><span class="text-pink-600">Итого: <b>${fmt(inv.total)}</b></span></div>
                ${inv.deliveryAddress ? `<div class="text-xs text-slate-500 mt-2">${escapeHtml(inv.deliveryAddress)}</div>` : ''}
            </div>`).join('');
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
                badge.className = 'text-xs px-3 py-1 rounded-full font-semibold bg-violet-100 text-violet-700 border border-violet-200';
                $('#tabAdmin')?.classList.remove('hidden');
            } else {
                badge.textContent = 'Покупатель';
                badge.className = 'text-xs px-3 py-1 rounded-full font-semibold bg-pink-100 text-pink-700 border border-pink-200';
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
        
        const subtotal = getCartTotal();
        const delivery = calculateDelivery(subtotal);
        const total = subtotal + delivery;
        if ($('#invoiceTotal')) $('#invoiceTotal').textContent = fmt(total);
        if ($('#deliverySummary')) $('#deliverySummary').textContent = delivery === 0 ? 'Доставка бесплатно' : `Доставка: ${fmt(delivery)}`;
        if ($('#submitInvoiceBtn')) {
            $('#submitInvoiceBtn').disabled = count === 0 || !$('#selectStore')?.value;
        }
    }

    // ========== RENDER CATALOG ==========
    function renderCatalog() {
        const list=$('#productList'), empty=$('#emptyCatalog'); if(!list)return;
        let items=[...state.products];
        if(state.category!=='all') items=items.filter(p=>(p.category||'')===state.category);
        if(state.searchQuery){const q=state.searchQuery.toLowerCase();items=items.filter(p=>(p.name||'').toLowerCase().includes(q));}
        switch(state.sortBy){case 'price-asc':items.sort((a,b)=>a.price-b.price);break;case 'price-desc':items.sort((a,b)=>b.price-a.price);break;case 'stock':items.sort((a,b)=>b.stock-a.stock);break;default:items.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru'));}
        empty?.classList.toggle('hidden',items.length>0); list.innerHTML=items.map(productCard).join(''); bindProductActions(list);
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
                <div class="font-bold text-pink-600 text-sm whitespace-nowrap">${fmt(p.price * qty)}</div>
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
            const img = p.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=fce7f3&color=db2777&size=400`;
            return `
            <div class="carousel-slide flex items-center justify-between px-8 py-4 bg-gradient-to-r from-pink-500/10 to-violet-500/10 w-full shrink-0">
                <div class="max-w-xs">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-pink-600 bg-pink-100 px-2.5 py-1 rounded-full">Рекомендуемый товар</span>
                    <h3 class="text-lg font-bold text-slate-800 mt-2 line-clamp-1">${escapeHtml(p.name)}</h3>
                    <div class="text-xl font-extrabold text-pink-600 mt-1">${fmt(p.price)}</div>
                </div>
                <img src="${img}" alt="${escapeHtml(p.name)}" class="w-28 h-28 object-cover rounded-2xl shadow-md border-2 border-white shrink-0">
            </div>`;
        }).join('');
        
        dots.innerHTML = featured.map((_, i) => 
            `<button class="w-2 h-2 rounded-full transition-all ${i === 0 ? 'bg-pink-500 w-5' : 'bg-slate-300'}" data-idx="${i}"></button>`
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
            btn.className = `w-2 h-2 rounded-full transition-all ${i === state.carouselIndex ? 'bg-pink-500 w-5' : 'bg-slate-300'}`;
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

        container.innerHTML = state.products.map(p => `
            <div class="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl transition-all hover:bg-white hover:shadow-sm">
                <div class="flex items-center space-x-3 min-w-0">
                    <img src="${p.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name)}" class="w-10 h-10 rounded-xl object-cover shrink-0 border">
                    <div class="min-w-0">
                        <p class="font-bold text-slate-800 text-sm truncate">${escapeHtml(p.name)}</p>
                        <p class="text-xs text-slate-400 font-medium">
                            Продажа: <span class="text-pink-600 font-bold">${fmt(p.price)}</span> 
                            | Закуп: <span class="text-slate-600 font-semibold">${fmt(p.costPrice || 0)}</span> 
                            | Склад: ${p.stock} шт
                        </p>
                    </div>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                    <button onclick="window.B2B_EditProduct('${p.id}')" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-xl border border-amber-200 transition-colors">Изменить</button>
                    <button onclick="window.B2B_DeleteProduct('${p.id}')" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 transition-colors">Удалить</button>
                </div>
            </div>
        `).join('');
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
                    </div>
                    <select onchange="window.B2B_UpdateOrderStatus('${inv.id}', this.value)" class="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                        ${['Новый','Подтверждён','Собирается','В доставке','Доставлен','Отменён'].map(st => `<option ${inv.status===st?'selected':''}>${st}</option>`).join('')}
                    </select>
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
                        <div class="title">Senimdi Sapa</div>
                        <div style="font-size: 12px; color: #475569;">Торговая точка: <b>${escapeHtml(inv.store || 'Магазин')}</b></div>
                    </div>
                    <div style="text-align: right; font-size: 12px;">
                        <div><b>№:</b> ${inv.id}</div>
                        <div><b>Дата:</b> ${date}</div>
                    </div>
                </div>

                <div class="meta">
                    <b>Отпустил (Продавец):</b> ${escapeHtml(inv.userName || '—')}
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

    async function updateOrderStatus(orderId, status) {
        const inv = state.invoices.find(i => i.id === orderId);
        if (!inv || state.role !== 'admin') return;
        try {
            if (window.B2B?.USE_DEMO) {
                const list = window.B2B.DemoStore.get('invoices', []);
                const item = list.find(x => x.id === orderId); if (item) item.status = status;
                window.B2B.DemoStore.set('invoices', list);
            } else {
                await (window.B2B?.db || window.db).collection('invoices').doc(orderId).update({ status });
            }
            inv.status = status; renderAdminStats(); renderBuyerOrders();
            toast('Статус заказа обновлён', 'success');
        } catch (e) { toast('Не удалось изменить статус заказа', 'error'); }
    }
    window.B2B_UpdateOrderStatus = updateOrderStatus;

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
    // 1. Используем разделитель точку с запятой (;)
    const headers = ["Название", "Продажная цена", "Закупочная цена", "Количество", "Ссылка на фото"];
    const rows = [
        ["Чай KARAK Tea", 1500, 1000, 50, "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500"],
        ["Кофе Арабика 250г", 3200, 2100, 30, "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500"]
    ];

    // 2. Добавляем BOM (\uFEFF) в начало, чтобы Excel правильно понял UTF-8
    let csvString = "\uFEFF" + headers.join(";") + "\n";
    rows.forEach(row => {
        csvString += row.join(";") + "\n";
    });

    // 3. Создаем Blob с явным указанием кодировки UTF-8
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sample_products.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

    async function handleFileImport(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            let importedProducts = [];

            try {
                if (file.name.endsWith('.json')) {
                    importedProducts = JSON.parse(text);
                } else {
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    const dataLines = lines.slice(1);
                    importedProducts = dataLines.map(line => {
                        const parts = line.split(/[,;]/);
                        return {
                            name: parts[0]?.trim() || 'Без названия',
                            price: Number(parts[1]) || 0,
                            costPrice: Number(parts[2]) || 0,
                            stock: Number(parts[3]) || 0,
                            image: parts[4]?.trim() || ''
                        };
                    });
                }

                if (!importedProducts.length) {
                    toast('Файл пуст или содержит неверные данные', 'warn');
                    return;
                }

                for (const prod of importedProducts) {
                    await saveProduct(prod);
                }

                await loadProducts();
                renderCatalog();
                renderAdminProducts();
                renderCarousel();
                renderAdminStats();
                toast(`Успешно импортировано товаров: ${importedProducts.length}`, 'success');
            } catch (err) {
                console.error(err);
                toast('Ошибка разбора файла импорта', 'error');
            }
        };
        reader.readAsText(file);
    }

    // ========== TABS ==========
    function switchTab(tabId) {
        $$('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-gradient-to-r', 'from-pink-500', 'to-violet-500', 'text-white', 'shadow-md');
            btn.classList.add('bg-white', 'text-slate-500');
        });
        $$('.tab-content').forEach(v => v.classList.add('hidden'));
        
        const btn = $(`#tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        const view = $(`#view${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        
        if (btn) {
            btn.classList.add('active', 'bg-gradient-to-r', 'from-pink-500', 'to-violet-500', 'text-white', 'shadow-md');
            btn.classList.remove('bg-white', 'text-slate-500');
        }
        if (view) view.classList.remove('hidden');
        
        if (tabId === 'invoice') { renderInvoice(); setTimeout(renderDeliveryMap, 100); }
        if (tabId === 'orders') renderBuyerOrders();
        if (tabId === 'admin') {
            renderAdminProducts();
            fillShopSettingsForm();
            setTimeout(renderAdminMap, 100);
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
        await loadProducts();
        await loadInvoices();
        await loadShopSettings();
        await loadCategories();
        renderCatalog();
        renderCarousel();
        updateCartUI();
        renderAdminProducts();
        renderAdminStats();
        renderBuyerOrders();
        renderFavorites();
        fillShopSettingsForm();
        
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
        $('#tabInvoice')?.addEventListener('click', () => switchTab('invoice'));
        $('#tabFavorites')?.addEventListener('click', () => switchTab('favorites'));
        $('#tabOrders')?.addEventListener('click', () => switchTab('orders'));
        $('#deliveryMethod')?.addEventListener('change', updateCartUI);
        $('#deliveryAddress')?.addEventListener('input', updateCartUI);
        $('#locateMeBtn')?.addEventListener('click', () => {
            if (!navigator.geolocation) return toast('Геолокация недоступна в браузере', 'warn');
            navigator.geolocation.getCurrentPosition(pos => setDeliveryPoint(pos.coords.latitude, pos.coords.longitude), () => toast('Не удалось получить местоположение', 'warn'), { enableHighAccuracy: true, timeout: 10000 });
        });
        $('#addCategoryBtn')?.addEventListener('click', async () => { const name=$('#newCategoryName')?.value.trim(); if(!name)return toast('Введите название категории','warn'); if(state.categories.includes(name))return toast('Такая категория уже есть','warn'); state.categories.push(name); $('#newCategoryName').value=''; await saveCategories(); toast('Категория добавлена','success'); });
        $('#saveShopSettingsBtn')?.addEventListener('click', saveShopSettings);
        $('#tabAdmin')?.addEventListener('click', () => switchTab('admin'));
        
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
                    b.classList.remove('active', 'bg-pink-100', 'text-pink-700', 'border', 'border-pink-200');
                    b.classList.add('bg-slate-100', 'text-slate-600');
                });
                btn.classList.add('active', 'bg-pink-100', 'text-pink-700', 'border', 'border-pink-200');
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
        $('#selectStore')?.addEventListener('change', updateCartUI);
        
        // Submit buyer order
        $('#submitInvoiceBtn')?.addEventListener('click', async () => {
            if (getCartCount() === 0) return toast('Корзина пуста', 'warn');
            const deliveryAddress = $('#deliveryAddress')?.value.trim();
            const deliveryMethod = $('#deliveryMethod')?.value || 'delivery';
            if (deliveryMethod === 'delivery' && !deliveryAddress) return toast('Укажите адрес доставки или точку на карте', 'warn');
            const items = Object.entries(state.cart).map(([productId, qty]) => {
                const p = state.products.find(x => x.id === productId);
                return { productId, name: p?.name, price: p?.price || 0, costPrice: p?.costPrice || 0, qty };
            });
            const subtotal = getCartTotal();
            const deliveryFee = calculateDelivery(subtotal);
            const invoice = {
                store: state.shopSettings.name || 'Магазин', items, subtotal, deliveryFee,
                total: subtotal + deliveryFee, deliveryMethod,
                deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress : (state.shopSettings.address || 'Самовывоз'),
                deliveryNote: $('#deliveryNote')?.value.trim() || '',
                deliveryLat: state.deliveryMarker?.getLatLng?.().lat || state.shopSettings.lat || null,
                deliveryLng: state.deliveryMarker?.getLatLng?.().lng || state.shopSettings.lng || null,
                status: 'Новый', userId: state.user?.uid || 'demo', userName: state.user?.displayName || 'Покупатель'
            };
            try {
                await saveInvoice(invoice);
                state.cart = {}; updateCartUI(); renderInvoice(); renderCatalog(); renderBuyerOrders();
                $('#deliveryAddress').value = ''; $('#deliveryNote').value = '';
                toast('Заказ оформлен успешно!', 'success'); switchTab('orders');
            } catch (e) { console.error(e); toast('Ошибка сохранения заказа: ' + (e.message || ''), 'error'); }
        });
        
        // Save / Edit Product Form
        $('#addProductForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = $('#productId').value;
            const name = $('#prodName').value.trim();
            const price = +$('#prodPrice').value;
            const costPrice = +$('#prodCostPrice').value || 0;
            const stock = +$('#prodStock').value;
            const category = $('#prodCategory')?.value || '';
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
            
            const product = {
                ...(id ? { id } : {}),
                name,
                price,
                costPrice,
                stock,
                category,
                image
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
