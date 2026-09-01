# Camera Stream

Real-time mobile camera streaming prototype using WebRTC with Socket.io signaling.

Mobile phone streams its camera to an Admin dashboard. The video travels directly between browsers via WebRTC — the server only relays signaling messages.

## Architecture

```
Mobile Browser ──WebRTC MediaStream──▶ Admin Browser
      │                                      │
      └──Socket.io signaling──▶ Server ◀─────┘
```

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS, Socket.io Client
- **Backend**: Node.js, Express, Socket.io
- **Streaming**: WebRTC (peer-to-peer)

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
npm run install:all
```

### Configure Environment

Copy the example files and adjust if needed:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Default values work for local development.

### Run

```bash
npm run dev
```

This starts both the frontend (http://localhost:3000) and the backend (http://localhost:4000).

### Test Locally

1. Open http://localhost:3000/admin in one browser tab
2. Open http://localhost:3000 in another tab
3. Click **Start Camera** on the mobile page
4. The admin page should display the camera stream

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_SIGNALING_URL` | Backend signaling server URL | `http://localhost:4000` |
| `NEXT_PUBLIC_TURN_URL` | TURN server URL (optional) | — |
| `NEXT_PUBLIC_TURN_USERNAME` | TURN server username (optional) | — |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | TURN server credential (optional) | — |

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `4000` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `http://localhost:3000` |

## Deployment

### Frontend → Vercel

1. Push this repository to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Set **Root Directory** to `frontend`
4. Add environment variables:
   - `NEXT_PUBLIC_SIGNALING_URL` = your Railway backend URL (e.g. `https://your-backend.up.railway.app`)
   - `NEXT_PUBLIC_TURN_URL` (optional)
   - `NEXT_PUBLIC_TURN_USERNAME` (optional)
   - `NEXT_PUBLIC_TURN_CREDENTIAL` (optional)
5. Deploy

### Backend → Railway

1. Create a new project in [Railway](https://railway.com)
2. Connect your GitHub repository
3. Set **Root Directory** to `backend`
4. Add environment variables:
   - `CLIENT_URL` = your Vercel frontend URL (e.g. `https://your-app.vercel.app`)
5. Railway automatically provides the `PORT` variable
6. Make sure the start command is `npm start`
7. Deploy
8. Copy the Railway service URL

### Post-Deployment

After both services are deployed:

1. Copy the Railway backend URL
2. In Vercel, add/update `NEXT_PUBLIC_SIGNALING_URL` with the Railway URL
3. Redeploy the frontend on Vercel
4. Open `https://your-app.vercel.app/admin` on desktop
5. Open `https://your-app.vercel.app` on your phone
6. Click **Start Camera** and verify the stream appears on the admin page

## Project Structure

```
├── frontend/
│   ├── app/
│   │   ├── page.js              Mobile camera page
│   │   ├── admin/page.jsx       Admin dashboard
│   │   ├── layout.js            Root layout
│   │   └── globals.css          Global styles
│   ├── components/
│   │   └── StatusBadge.jsx      Connection status indicator
│   ├── hooks/
│   │   └── useSocket.js         Socket.io React hook
│   ├── lib/
│   │   ├── socket.js            Socket.io client singleton
│   │   └── webrtc.js            WebRTC peer connection factory
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── server.js            Express + Socket.io server
│   │   └── socket/
│   │       └── signaling.js     WebRTC signaling handler
│   └── package.json
│
├── package.json                 Root scripts (dev, install)
└── .gitignore
```
