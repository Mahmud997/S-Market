/**
 * Firebase configuration & initialization
 * ======================================
 * 
 * 1. Создайте проект на https://console.firebase.google.com
 * 2. Добавьте веб-приложение и скопируйте конфиг ниже
 * 3. Включите Authentication → Sign-in method:
 *    - Google
 *    - Phone
 * 4. В Authentication → Settings → Authorized domains добавьте ваш домен
 *    (localhost уже есть)
 * 5. Поставьте USE_DEMO = false
 */

// ═══════════════════════════════════════════════════════════
// ★ НАСТРОЙКИ — измените эти значения
// ═══════════════════════════════════════════════════════════

const USE_DEMO = false; // ← false = реальный Firebase

const firebaseConfig = {
  apiKey: "AIzaSyCvjSjUtvq79adrJGTk7YcWRXP6aEe0yh4",
  authDomain: "dealer-8c77e.firebaseapp.com",
  projectId: "dealer-8c77e",
  storageBucket: "dealer-8c77e.firebasestorage.app",
  messagingSenderId: "185020381560",
  appId: "1:185020381560:web:1d4619f46452e0cc80f08d"
};

/**
 * Email-адреса администраторов (временно, пока нет Custom Claims).
 * Можно оставить пустым и выдавать роль через Firestore /users/{uid}.role
 */
const ADMIN_EMAILS = [
    // "admin@yourcompany.com",
    // "boss@gmail.com"
];

// ═══════════════════════════════════════════════════════════

let auth = null;
let db = null;
let storage = null;
let isFirebaseReady = false;
let recaptchaVerifier = null;
let confirmationResult = null; // для Phone Auth

function initFirebase() {
    if (USE_DEMO) {
        console.log('[B2B Trade] DEMO mode (localStorage)');
        return false;
    }

    // Проверка, что конфиг заполнен
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.error('[Firebase] Заполните firebaseConfig в js/firebase.js!');
        alert('Заполните firebaseConfig в js/firebase.js\nСм. README → Подключение Firebase');
        return false;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        isFirebaseReady = true;
        console.log('[Firebase] Ready');
        return true;
    } catch (e) {
        console.error('[Firebase] Init error:', e);
        alert('Ошибка инициализации Firebase: ' + e.message);
        return false;
    }
}

// Demo helpers (localStorage) — используется только при USE_DEMO = true
const DemoStore = {
    get(key, fallback = null) {
        try {
            const raw = localStorage.getItem('b2b_' + key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        localStorage.setItem('b2b_' + key, JSON.stringify(value));
    },
    seed() {
        if (!this.get('products')) {
            const seed = [
                { id: 'p1', name: 'Кола 0.5л', price: 180, stock: 240, image: null, featured: true, category: 'Напитки' },
                { id: 'p2', name: 'Чипсы Lays 150г', price: 320, stock: 95, image: null, featured: true, category: 'Снэки' },
                { id: 'p3', name: 'Вода Asu 1.5л', price: 95, stock: 500, image: null, featured: false, category: 'Напитки' },
                { id: 'p4', name: 'Шоколад Nestle', price: 450, stock: 60, image: null, featured: true, category: 'Сладости' },
                { id: 'p5', name: 'Сок Rich 1л', price: 380, stock: 120, image: null, featured: false, category: 'Напитки' },
                { id: 'p6', name: 'Печенье Oreo', price: 290, stock: 80, image: null, featured: false, category: 'Сладости' },
                { id: 'p7', name: 'Йогурт Danone', price: 210, stock: 150, image: null, featured: false, category: 'Молочное' },
                { id: 'p8', name: 'Энергетик RedBull', price: 650, stock: 45, image: null, featured: true, category: 'Напитки' },
            ];
            this.set('products', seed);
            this.set('categories', ['Напитки', 'Снэки', 'Сладости', 'Молочное']);
        }
        if (!this.get('categories')) this.set('categories', ['Напитки', 'Снэки', 'Сладости', 'Молочное']);
        if (!this.get('invoices')) this.set('invoices', []);
        if (!this.get('user')) this.set('user', null);
    }
};

if (USE_DEMO) {
    DemoStore.seed();
} else {
    initFirebase();
}

/**
 * Определить роль пользователя
 * 1. Custom Claims (лучший способ)
 * 2. ADMIN_EMAILS
 * 3. Документ users/{uid} в Firestore
 */
async function resolveUserRole(user) {
    if (!user) return 'buyer';

    // 1. Custom Claims
    try {
        const token = await user.getIdTokenResult();
        if (token.claims.admin === true || token.claims.role === 'admin') {
            return 'admin';
        }
    } catch (_) {}

    // 2. Список email
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        return 'admin';
    }

    // 3. Firestore users/{uid}
    if (db) {
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists && doc.data().role === 'admin') {
                return 'admin';
            }
        } catch (_) {}
    }

    return 'buyer';
}

/**
 * Создать / обновить профиль пользователя в Firestore
 */
async function ensureUserProfile(user, role) {
    if (!db || !user) return;
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        await ref.set({
            email: user.email || null,
            phone: user.phoneNumber || null,
            displayName: user.displayName || null,
            role: role || 'buyer',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        await ref.update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

window.B2B = {
    USE_DEMO,
    auth,
    db,
    storage,
    isFirebaseReady,
    DemoStore,
    ADMIN_EMAILS,
    resolveUserRole,
    ensureUserProfile,
    // Phone Auth helpers
    getRecaptchaVerifier: () => recaptchaVerifier,
    setRecaptchaVerifier: (v) => { recaptchaVerifier = v; },
    getConfirmationResult: () => confirmationResult,
    setConfirmationResult: (r) => { confirmationResult = r; }
};
