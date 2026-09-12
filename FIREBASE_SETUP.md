# Настройка реальной авторизации Firebase

Пошаговая инструкция для Google Sign-In и Phone (SMS) Auth.

---

## 1. Создать проект Firebase

1. Перейдите на [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → укажите название (например `b2b-trade`)
3. Google Analytics можно отключить
4. После создания проекта нажмите **</> Web** (добавить веб-приложение)
5. Зарегистрируйте приложение, скопируйте `firebaseConfig`

---

## 2. Вставить конфиг в код

Откройте `js/firebase.js` и замените:

```js
const USE_DEMO = false;   // ← обязательно false

const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ваш-проект.firebaseapp.com",
  projectId: "ваш-проект",
  storageBucket: "ваш-проект.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

---

## 3. Включить методы входа

В Firebase Console → **Authentication** → **Sign-in method**:

### Google
1. Нажмите **Google** → Enable
2. Укажите Support email
3. Save

### Phone
1. Нажмите **Phone** → Enable
2. Save

> Для тестирования без реальных SMS можно добавить тестовые номера:
> Authentication → Sign-in method → Phone → Phone numbers for testing  
> Пример: `+77001234567` → код `123456`

---

## 4. Authorized domains

Authentication → **Settings** → **Authorized domains**

Добавьте:
- `localhost` (уже есть)
- ваш домен (например `b2b-trade.web.app` или кастомный)

Без этого Google-вход выдаст ошибку `auth/unauthorized-domain`.

---

## 5. Firestore (база данных)

1. **Build** → **Firestore Database** → Create database
2. Выберите режим **production** (или test на 30 дней)
3. Регион: `eur3` (Europe) или ближайший

### Правила безопасности (минимальные)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Пользователи — читать/писать только свой документ
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Товары — читать все авторизованные, писать только админы
    match /products/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Накладные — создавать все, читать все (или только свои)
    match /invoices/{id} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if false; // нельзя менять проведённые
    }
  }
}
```

---

## 6. Storage (фото товаров)

1. **Build** → **Storage** → Get started
2. Правила:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /products/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 7. Роли администраторов

В `js/firebase.js` есть массив:

```js
const ADMIN_EMAILS = [
  "admin@yourcompany.com",
  "boss@gmail.com"
];
```

Добавьте email администраторов.  
Либо создайте документ вручную:

```
users/{uid}
  role: "admin"
```

**Лучший способ (продакшен)** — Custom Claims через Cloud Functions:

```js
// Cloud Function
admin.auth().setCustomUserClaims(uid, { admin: true });
```

---

## 8. Hosting (опционально)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Public directory: .  (или dist)
firebase deploy
```

После деплоя добавьте домен `*.web.app` / `*.firebaseapp.com` в Authorized domains (обычно добавляется автоматически).

---

## 9. Проверка

1. Откройте сайт
2. Нажмите **Войти через Google** → должно открыться окно Google
3. Для телефона: введите `+7...` → придёт SMS (или используйте тестовый номер)
4. В консоли браузера (F12) не должно быть ошибок Firebase

---

## Частые ошибки

| Ошибка | Решение |
|--------|---------|
| `auth/unauthorized-domain` | Добавьте домен в Authorized domains |
| `auth/invalid-api-key` | Проверьте `apiKey` в конфиге |
| `auth/operation-not-allowed` | Включите Google / Phone в Sign-in method |
| `auth/quota-exceeded` | SMS-квота. Включите Blaze plan или используйте тестовые номера |
| reCAPTCHA не появляется | Убедитесь, что `div#recaptcha-container` есть в HTML |
| CORS / blocked | Открывайте через `http://localhost` или HTTPS, не `file://` |

---

## Тестовые номера (без SMS)

Authentication → Phone → **Phone numbers for testing**:

```
+77001112233    →  123456
+77009998877    →  654321
```

Эти номера не тратят квоту и работают мгновенно.

---

Готово! После настройки `USE_DEMO = false` приложение использует реальный Firebase Auth.


## Настройки магазина и доставки
Администратор в разделе «Админ» задаёт название, адрес, стоимость доставки, порог бесплатной доставки и точку магазина на карте. Эти данные сохраняются в `settings/shop`.

Рекомендуемый дополнительный блок Firestore Rules для настроек:

```
match /settings/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```
