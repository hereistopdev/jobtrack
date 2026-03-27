# JobTrack (MERN)

Team dashboard to manage job links with:
- company
- role (stored as `title` in the API)
- country (optional; used with role to detect duplicate postings)
- link
- date
- status
- notes

## 1) Backend setup

```bash
cd backend
npm install
copy .env.example .env
```

Edit `backend/.env` and set **`JWT_SECRET`** to a long random string (required for login).

```bash
npm run dev
```

Backend runs at `http://localhost:5000`.

### Accounts

- **Register** the first user from the app (Create account), or use **Sign in** after that.
- Users sign in with **email + password** (passwords are hashed with bcrypt; API uses **JWT** bearer tokens).
- Each job link stores **`createdBy`** (who added it). Only that user (or an **admin**) can edit or delete a link.
- To make a user an admin in MongoDB: set `role` to `"admin"` on that user document (then they can edit/delete any link).

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

Auth (no bearer token):

- `POST /api/auth/register` - body `{ "email", "password", "name?" }` → `{ token, user }`
- `POST /api/auth/login` - body `{ "email", "password" }` → `{ token, user }`

Auth required (`Authorization: Bearer <token>`):

- `GET /api/auth/me` - current user profile
- `POST /api/job-links/parse` - body `{ "url": "https://..." }` returns `{ company, title, link, date }` (server fetches the page and reads meta tags; falls back to URL patterns when blocked)
- `GET /api/job-links` - list all links (includes `createdBy`)
- `POST /api/job-links` - create a link (sets `createdBy` from the token). Returns **409** if the URL matches an existing posting (normalized) or if **country + role** match another row that already has a country set (includes `addedByLabel` / `duplicateReason`).
- `PUT /api/job-links/:id` - update (creator or admin only)
- `DELETE /api/job-links/:id` - delete (creator or admin only)

## MongoDB

Make sure MongoDB is running locally, or set your Atlas URI in `backend/.env`:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/jobtrack
```
