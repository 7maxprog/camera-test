# Camera Stream

Real-time mobile camera streaming prototype using WebRTC with Socket.io signaling.

Mobile phone streams its camera directly to the Admin dashboard via WebRTC. Socket.io is used only for signaling.

## Project Structure

```text
CAM/
├── frontend/
│   ├── app/
│   │   ├── admin/
│   │   │   └── page.jsx
│   │   ├── page.jsx
│   │   ├── layout.jsx
│   │   └── globals.css
│   ├── public/
│   ├── package.json
│   ├── next.config.mjs
│   └── .env
│
├── backend/
│   ├── src/
│   │   └── server.js
│   ├── package.json
│   └── .env
│
├── .gitignore
└── README.md
```

## Local Development

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

The signaling server will run on `http://localhost:4000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000`.

### 3. Test

1. Open `http://localhost:3000/admin` in one browser window.
2. Open `http://localhost:3000` in another browser window or on your phone.
3. Click **Start Camera** on the mobile page.
4. The admin page will display the live video stream.

## Environment Variables

### Frontend (`frontend/.env`)

```text
NEXT_PUBLIC_SIGNALING_URL=http://localhost:4000
```

### Backend (`backend/.env`)

```text
PORT=4000
CLIENT_URL=http://localhost:3000
```

## Deployment

### Frontend (Vercel)

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Set **Root Directory** to `frontend`.
4. Add environment variable:
   - `NEXT_PUBLIC_SIGNALING_URL`: your Railway backend URL (e.g. `https://your-backend.up.railway.app`)
5. Deploy.

### Backend (Railway)

1. Create a project on Railway and connect your GitHub repository.
2. Set **Root Directory** to `backend`.
3. Add environment variable:
   - `CLIENT_URL`: your Vercel frontend URL (e.g. `https://your-frontend.vercel.app`)
4. Ensure the start command is `npm start`.
5. Deploy.
6. Copy the Railway public domain and set it as `NEXT_PUBLIC_SIGNALING_URL` in Vercel.
