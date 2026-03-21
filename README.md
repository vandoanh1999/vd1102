# vd1102

AI chat với multi-candidate judging. Free tier 50 tin/ngày. Pro $7/tháng.

## Stack
- Next.js 14 + TypeScript
- Groq API (Llama 3.3 70B judge + Llama 3.1 8B primary)
- PostgreSQL (Neon)
- Stripe billing
- Railway deployment

## Deploy nhanh

```bash
# 1. Clone
git clone https://github.com/vandoanh1999/vd1102.git
cd vd1102

# 2. Cài dependencies
npm install

# 3. Config
cp .env.example .env.local
# Điền DATABASE_URL, NEXTAUTH_SECRET, GROQ_API_KEY

# 4. Push DB schema
npx prisma db push

# 5. Chạy
npm run dev
```

## Environment Variables

| Biến | Bắt buộc | Lấy ở đâu |
|---|---|---|
| `DATABASE_URL` | ✅ | neon.tech |
| `NEXTAUTH_SECRET` | ✅ | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `NEXTAUTH_URL` | ✅ | Domain của bạn |
| `GROQ_API_KEY` | ✅ | console.groq.com |
| `STRIPE_SECRET_KEY` | Để nhận tiền | dashboard.stripe.com |
| `STRIPE_PRICE_ID` | Để nhận tiền | Tạo product $7/tháng |
| `STRIPE_WEBHOOK_SECRET` | Để nhận tiền | Stripe webhook |
