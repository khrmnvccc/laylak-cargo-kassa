# 🚚 CargoGo Kassa & Hisobot Boshqaruv Tizimi

CargoGo uchun professional, mobile-first, kassa zanjirini avtomatik hisoblovchi va Excel integratsiyasiga ega shaxsiy boshqaruv web-sayti.

---

## 📌 1. Loyiha Strukturasi

```text
/
├── index.html                   # Asosiy HTML kirish fayli (O'zbek tilida, viewport optimallashtirilgan)
├── metadata.json                # Ilova metama'lumotlari
├── package.json                 # Bog'liqliklar va skriptlar
├── tsconfig.json                # TypeScript konfiguratsiyasi
├── vite.config.ts               # Vite va Tailwind konfiguratsiyasi
├── server.ts                    # Local Express/Vite development server
├── api/                         # Neon Auth proxy and authenticated data API
├── src/
│   ├── main.tsx                 # React dasturi nuqtasi
│   ├── App.tsx                  # Boshqaruvchi asosiy komponent, holatlar va navigatsiya
│   ├── index.css                # TailwindCSS v4 va dizayn stillari
│   ├── types.ts                 # TypeScript modellar va interfeyslar
│   ├── services/
│   │   └── storage.ts           # Avtomatik kassa zanjiri va mahalliy saqlash xizmati
│   ├── utils/
│   │   ├── formatters.ts        # Valyuta (so'm), sana va 10 kunlik dekada formatlagichlari
│   │   ├── calculations.ts      # Bosh sahifa, 10 kunlik va oylik ko'rsatkichlar formulalari
│   │   └── excelHelper.ts       # XLSX eksport, import tahlili va namuna shablon generatori
│   └── components/
│       ├── Navbar.tsx           # Kassa qoldig'i, qidiruv va tezkor harakatlar yuqori paneli
│       ├── BottomNav.tsx        # Telefon (iPhone/Android) uchun pastki menyu paneli
│       ├── QuickAddModal.tsx    # 10-15 soniyada yangi yozuv qo'shish modali (Kalkulyatorsiz)
│       ├── DashboardView.tsx    # Bosh sahifa: KPI kartalari, to'lov turlari taqsimoti, grafiklar
│       ├── KassaView.tsx        # CargoGo Kassa: Bor bo'lgan, Tushgan, Ishlatilgan, Qolgan, Izoh
│       ├── OtchyotlarView.tsx   # Reyslar va ID lar hisoboti jadvali, filtrlari bilan
│       ├── CashCardView.tsx     # Naqd / Karta kunlik taqsimoti va foizlari
│       ├── DecadeView.tsx       # 10 kunlik alohida kartochkali hisobotlar (1-10, 11-20, 21-31)
│       ├── MonthlyView.tsx      # Oylik umumiy tushum, xarajat va reyslar arxivi
│       ├── ExpensesView.tsx     # Xarajatlar toifalari (Tovar, Paket, Registrator, Ijara...)
│       ├── SearchView.tsx       # Kuchli ID va sana bo'yicha qidiruv moduli
│       ├── ExcelModal.tsx       # Excel import/export va namunani yuklab olish
│       ├── SettingsView.tsx     # Database strukturasi, xavfsizlik va sozlamalar
│       ├── LoginModal.tsx       # Shaxsiy login va parol sahifasi
│       └── DeleteConfirmModal.tsx # Tasodifiy o'chirishning oldini oluvchi tasdiqlash oynasi
```

---

## 🧮 2. Asosiy Formulalar va Hisoblash Mantiqi

### 1. Kassa Zanjiri (Chained Balance):
```text
Qolgan summa = Bor bo‘lgan summa + Tushgan summa - Ishlatilgan summa
```
* Keyingi kunning **“Bor bo‘lgan summasi”** avtomatik ravishda oldingi kunning **“Qolgan summasi”**dan olinadi. Hech qanday qo'lda hisoblash talab qilinmaydi!

### 2. Otchyotlar (Umumiy Kassa):
```text
Umumiy kassa = Naqd + Karta + Yandex + Pochta
```

### 3. Naqd / Karta Moduli:
```text
Umumiy tushum = Naqd tushum + Karta tushumi
```

---

## 🗄️ 3. Database Strukturasi (SQL Schema)

Ushbu schema PostgreSQL, Supabase yoki SQLite bilan 100% mos keladi:

```sql
-- 1. Foydalanuvchilar (users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Kunlik Reyslar va Otchyotlar (reports)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    id_number VARCHAR(50) NOT NULL,
    trips_count INTEGER DEFAULT 0,
    cash NUMERIC(15, 2) DEFAULT 0,
    card NUMERIC(15, 2) DEFAULT 0,
    yandex NUMERIC(15, 2) DEFAULT 0,
    pochta NUMERIC(15, 2) DEFAULT 0,
    total NUMERIC(15, 2) GENERATED ALWAYS AS (cash + card + yandex + pochta) STORED,
    period_10_days VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Kassa Zanjiri va Harakatlari (cash_transactions)
CREATE TABLE IF NOT EXISTS cash_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    starting_balance NUMERIC(15, 2) DEFAULT 0,
    income NUMERIC(15, 2) DEFAULT 0,
    expense NUMERIC(15, 2) DEFAULT 0,
    balance NUMERIC(15, 2) NOT NULL,
    category VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Xarajatlar Tarixi (expenses)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES cash_transactions(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Kunlik Naqd / Karta Jamlamasi (cash_daily)
CREATE TABLE IF NOT EXISTS cash_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    cash_total NUMERIC(15, 2) DEFAULT 0,
    card_total NUMERIC(15, 2) DEFAULT 0,
    trips_total INTEGER DEFAULT 0,
    grand_total NUMERIC(15, 2) GENERATED ALWAYS AS (cash_total + card_total) STORED,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. To'lov Turlari Konfiguratsiyasi (payment_methods)
CREATE TABLE IF NOT EXISTS payment_methods (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO payment_methods (id, name, icon) VALUES 
('cash', 'Naqd pul', '💵'),
('card', 'Plastik karta', '💳'),
('yandex', 'Yandex', '🟢'),
('pochta', 'Pochta', '📦')
ON CONFLICT (id) DO NOTHING;
```

---

## 🚀 4. Ishga Tushirish Yo'riqnomasi

### Kompyuterda yoki Claude Code orqali:

```bash
# 1. Kerakli paketlarni o'rnatish
npm install

# 2. Dasturni ishga tushirish (Port 3000)
npm run dev

# 3. Brauzerda ochish:
# http://localhost:3000
```

### Ma’lumotlar va akkauntlar

Kirish Neon Auth orqali, hisobot/kassa/xarajatlar Neon PostgreSQL’da saqlanadi. Bir xil akkaunt bilan kirgan qurilmalar ma’lumotlarni sinxronlaydi. `.env.example` kerakli o‘zgaruvchi nomlarini ko‘rsatadi; haqiqiy qiymatlar `.env` yoki Vercel Environment Variables’da turishi kerak. Standart login/parol yo‘q: sayt orqali alohida akkaunt ochiladi.

Vercel’dagi Neon integratsiyasi Preview muhitiga kerakli o‘zgaruvchilarni beradi. Production’ga chiqarishdan avval Production environment variables’ni alohida sozlab, preview’ni tekshiring. Firestore endi ilova tomonidan ishlatilmaydi; `firestore.rules` barcha kirishni rad etadi, lekin Firebase Console’dagi mavjud qoidalar bu faylni alohida deploy qilmaguncha o‘zgarmaydi.

---

## 🌐 5. GitHub va Deploy Qilish Yo'li

### 1-qadam: GitHub'ga joylash
```bash
git init
git add .
git commit -m "CargoGo Kassa va Hisobot Tizimi"
git branch -M main
git remote add origin https://github.com/SIZNING_PROFILINGIZ/cargogo-kassa.git
git push -u origin main
```

### 2-qadam: Vercel yoki Render'da tekinga Deploy qilish
1. [Vercel.com](https://vercel.com) ga kiring va GitHub orqali kiring.
2. **"Add New Project"** tugmasini bosing va `cargogo-kassa` repozitoriyasini tanlang.
3. Framework Preset: **Vite** ni tanlang va **Deploy** tugmasini bosing.
4. 1 daqiqa ichida sizga butun dunyodan, jumladan iPhone'ingizdan kirish uchun bepul HTTPS domen beriladi!
