# Laylak Cargo Kassa

Laylak Cargo uchun kunlik kassa, toʻlovlar va hisobotlar tizimi. Barcha xodimlar bitta umumiy server bazasi (Neon PostgreSQL) bilan ishlaydi: bir xodim kiritgan toʻlov boshqa barcha qurilmalarda bir necha soniyada koʻrinadi.

## Imkoniyatlar

- **Dashboard**: tanlangan davr tushumi (naqd + karta + Yandex + Pochta = jami), operatsiyalar soni, oldingi davr bilan solishtirish, kunlar boʻyicha grafik, ishchilar tushumi, oxirgi operatsiyalar.
- **Kassa**: mijoz ID, ism, summa, toʻlov turi (naqd, karta, Yandex, Pochta), izoh, sana va vaqt, kiritgan ishchi. Saqlashdan oldin tekshiruv va tasdiqlash oynasi.
- **Operatsiyalar**: qidiruv, sana/tur/ishchi/holat filtrlari, sahifalash, CSV (Excel) eksport, admin uchun bekor qilish.
- **Kunlik**, **haftalik va oylik hisobotlar**: ishchilar kesimi, grafik, chop etish, CSV.
- **Ishchilar** (faqat admin): xodim qoʻshish, rol, parolni tiklash, oʻchirish, koʻrsatkichlar.
- **Kassa balansi** (faqat admin): naqd, karta, Yandex va Pochta hisoblarida hozir qancha pul borligi, kunlik harakat (kun boshida, tushum, rasxod, tuzatish, kun oxirida), kunlik rasxodlar va oxirgi 14 kun. Qoldiq = tushumlar − rasxodlar ± tuzatishlar. Boshlangʻich qoldiqni “Qoldiqni tuzatish” orqali kiriting.
- **Mijozlar**: ID boʻyicha qidiruv va toʻlovlar tarixi.
- **Sozlamalar**: profil, parol, yorugʻ/qorongʻi rejim, tizim holati va faoliyat jurnali (admin).

## Rollar

| | Kassir | Admin |
|---|---|---|
| Toʻlov kiritish | ✓ (vaqt avtomatik) | ✓ (oʻtgan sanani ham) |
| Operatsiyalar va hisobotlarni koʻrish | ✓ | ✓ |
| Toʻlovni bekor qilish | — | ✓ (sabab bilan) |
| Xodimlarni boshqarish, jurnal | — | ✓ |

Huquqlar serverda tekshiriladi. Toʻlovlarni oʻchirib yoki summasini oʻzgartirib boʻlmaydi (bazadagi trigger ham taqiqlaydi), faqat admin bekor qila oladi va bekor qilingan yozuv tarixda qoladi.

## Arxitektura

- `src/` — React + Vite + Tailwind interfeys. Brauzer bazaga toʻgʻridan-toʻgʻri ulanmaydi va hech qanday maxfiy kalit saqlamaydi.
- `api/index.ts` — Vercel serverless funksiyasi, barcha `/api/*` soʻrovlari shu yerga keladi (`vercel.json`).
- `server/` — API marshrutlari, sessiyalar (httpOnly cookie, scrypt parollar, login urinishlarini cheklash), PostgreSQL sxema va migratsiya.
- `server.ts` — lokal ishga tushirish uchun Express server.

Sxema birinchi soʻrovda avtomatik yaratiladi (`server/db.ts`). Jadvallar: `app_users`, `app_sessions`, `clients`, `payments`, `audit_log`, `expenses`, `balance_adjustments`, `legacy_import`, `app_meta`.

### Eski maʼlumotlar

Oldingi versiya har bir akkaunt maʼlumotini `kassa_app_data` jadvalida alohida saqlardi, shuning uchun xodimlar bir-birining yozuvlarini koʻrmasdi. Yangi versiya birinchi ishga tushganda:

1. `kassa_app_data` dagi har bir yozuvni oʻzgarishsiz `legacy_import` jadvaliga nusxalaydi;
2. eski otchyotlardagi naqd, karta, Yandex va Pochta summalarini umumiy `payments` jadvaliga koʻchiradi (reyslar soni izohda saqlanadi, demo va oʻchirilgan yozuvlar koʻchirilmaydi; Yandex va Pochta 2-migratsiyada qoʻshiladi);
3. `kassa_app_data` jadvalini **oʻzgartirmaydi va oʻchirmaydi**.

## Vercel’ga joylash

1. Vercel loyihasida **Settings → Environment Variables**:
   - `DATABASE_URL` — Neon ulanish satri (Neon integratsiyasi buni allaqachon qoʻyadi; Production uchun ham borligini tekshiring);
   - `ADMIN_SETUP_KEY` — uzun tasodifiy maxfiy soʻz (birinchi admin yaratish uchun bir marta kerak).
2. Deploy qilishdan oldin Neon konsolida bazaning zaxira nusxasini (branch) oling.
3. Deploy qiling, saytni oching, sozlash oynasida `ADMIN_SETUP_KEY`, ismingiz, login va parolni kiriting.
4. **Ishchilar** sahifasida har bir xodimga login va parol yarating.

Eski Neon Auth akkauntlari endi ishlatilmaydi, xodimlar admin bergan yangi login bilan kiradi.

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env   # DATABASE_URL va ADMIN_SETUP_KEY ni toʻldiring
npm run dev            # http://localhost:3000
```

## Tekshiruvlar

```bash
npm run lint    # TypeScript
npm run build   # production build
DATABASE_URL=postgres://.../test_db npm test   # API integratsion testlari (faqat test bazada!)
```
