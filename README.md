# JobTrack (MERN)

Team dashboard to manage job links with:
- company
- title
- link
- date
- status
- notes

## 1) Backend setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Backend runs at `http://localhost:5000`.

## 2) Frontend setup

Open a second terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Frontend runs at `http://localhost:5173`.

## API Endpoints

- `GET /api/job-links` - list all links
- `POST /api/job-links` - create a link
- `PUT /api/job-links/:id` - update a link
- `DELETE /api/job-links/:id` - delete a link

## MongoDB

Make sure MongoDB is running locally, or set your Atlas URI in `backend/.env`:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/jobtrack
```
