# LLM Fine-Tuning Platform — Setup Guide

## Architecture

```
User → Next.js (Vercel) → FastAPI (Render) → Modal (GPU training)
                              ↕                      ↓
                         Supabase              HuggingFace Hub
                     (auth + DB + storage)
```

## Step 1: Supabase

1. Create project at https://supabase.com (free)
2. Go to **SQL Editor** → paste contents of `supabase/schema.sql` → Run
3. Go to **Storage** → create bucket named `datasets` (private)
4. Note from **Settings → API**:
   - Project URL
   - anon/public key
   - service_role key
   - JWT Secret

## Step 2: Modal

1. Sign up at https://modal.com (free — $30/mo credits)
2. Install CLI: `pip install modal`
3. Auth: `modal token new`
4. Create secret in Modal dashboard named `finetune-platform-secrets`:
   - (Leave empty for now — secrets added via env vars)
5. Deploy training script:
   ```bash
   cd training
   modal deploy modal_app.py
   ```
6. Note the webhook URL printed after deploy:
   ```
   Created web endpoint => https://your-app--training-webhook.modal.run
   ```

## Step 3: Backend (FastAPI on Render)

1. Push code to GitHub
2. Create account at https://render.com (free)
3. New → Web Service → connect repo → select `backend/` directory
4. Settings:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `backend/.env.example`
6. Note your Render URL: `https://your-app.onrender.com`

## Step 4: Frontend (Next.js on Vercel)

1. Create account at https://vercel.com (free)
2. Import GitHub repo → select `frontend/` as root directory
3. Add environment variables from `frontend/.env.example`
4. Deploy

## Step 5: Wire everything together

Update env vars with real URLs:
- Backend `FRONTEND_URL` = your Vercel URL
- Backend `BACKEND_URL` = your Render URL
- Backend `MODAL_WEBHOOK_URL` = your Modal webhook URL
- Frontend `NEXT_PUBLIC_API_URL` = your Render URL

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env.local   # fill in values
npm run dev

# Training (test Modal locally)
cd training
modal run modal_app.py
```

## Dataset format

JSON array of objects with `instruction` and `output` fields:

```json
[
  {
    "instruction": "How do you rollback a Kubernetes deployment?",
    "input": "",
    "output": "Use kubectl rollout undo deployment/<name>"
  }
]
```

`input` field is optional. Minimum 50 examples recommended, 500+ for good results.

## Free tier limits

| Service | Free Limit | Notes |
|---------|-----------|-------|
| Supabase | 500MB DB, 1GB storage | Plenty for datasets |
| Render | 750h/mo, sleeps after 15min | Cold start ~30s |
| Vercel | Unlimited hobby | No limits for this use |
| Modal | $30/mo credits | ~10-15 training runs on T4 |
| HuggingFace | Unlimited public repos | Private = 1 free |

## File structure

```
finetune-platform/
├── supabase/
│   └── schema.sql          # Run in Supabase SQL editor
├── backend/
│   ├── main.py             # FastAPI app
│   ├── models.py           # Pydantic schemas
│   ├── database.py         # Supabase client
│   ├── requirements.txt
│   └── .env.example
├── training/
│   └── modal_app.py        # Modal GPU training script
└── frontend/
    ├── app/
    │   ├── page.tsx             # Login
    │   ├── dashboard/page.tsx   # Job list
    │   ├── new-job/page.tsx     # Create job (3-step form)
    │   └── jobs/[id]/page.tsx   # Job status + logs
    ├── lib/
    │   └── api.ts               # API client + types
    ├── package.json
    └── .env.example
```
