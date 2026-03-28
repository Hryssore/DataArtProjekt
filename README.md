# Classic Web Chat

Classic Web Chat is a workshop-ready web chat application built as a monorepo with:

- React frontend
- Node.js + Express backend
- PostgreSQL persistence
- Socket.IO realtime delivery and presence
- local filesystem uploads
- Docker Compose startup from the repository root

The project is designed so the whole stack starts with `docker compose up`.

## Setup

1. Copy the root environment template if you want to override defaults:

```bash
cp .env.example .env
```

2. Start everything from the repository root:

```bash
docker compose up --build
```

3. Open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend healthcheck: [http://localhost:3000/health](http://localhost:3000/health)

## Project Structure

```text
.
|-- backend/
|   |-- Dockerfile
|   |-- package.json
|   `-- src/
|       |-- config/
|       |-- db/
|       |-- middlewares/
|       |-- modules/
|       |-- sockets/
|       `-- utils/
|-- docs/
|   |-- api-notes.md
|   |-- architecture.md
|   `-- test-cases.md
|-- frontend/
|   |-- Dockerfile
|   |-- package.json
|   `-- src/
|       |-- api/
|       |-- app/
|       |-- components/
|       |-- hooks/
|       |-- pages/
|       |-- socket/
|       `-- styles/
|-- infra/
|   `-- postgres/
|-- docker-compose.yml
`-- README.md
```

## Feature Checklist

### Authentication and account access

- [x] Registration with unique email and immutable username
- [x] Login with persistent cookie-based sessions
- [x] Logout current session only
- [x] Active sessions listing with revoke support
- [x] Password change
- [x] Password reset token flow placeholder
- [x] Account deletion

### Rooms and moderation

- [x] Public/private rooms
- [x] Unique room names
- [x] Public room catalog with search
- [x] Private room invitations
- [x] Room members and admin roles
- [x] Room bans and unbans
- [x] Owner-only room deletion
- [x] Room moderation modals in frontend

### Social and personal messaging

- [x] Friend requests by username
- [x] Accept and reject friend requests
- [x] Friend list
- [x] Remove friend
- [x] User-to-user bans
- [x] Personal dialogs with fixed two participants
- [x] Frozen read-only dialogs after user ban

### Messaging and files

- [x] Persistent room and personal messages
- [x] Reply support
- [x] Edit and delete flows
- [x] Infinite history pagination
- [x] Typing indicators
- [x] Message reactions
- [x] User main language preference
- [x] On-demand message translation into the user's selected language
- [x] Attachment upload and protected download
- [x] Paste or picker-based attachment input in UI
- [x] Room access loss blocks room files/messages

### Realtime and presence

- [x] Socket.IO authentication
- [x] Low-latency message events
- [x] Multiple-tab connection tracking
- [x] Online / AFK / offline presence model
- [x] Unread refresh events

### Submission and operations

- [x] `docker compose up` from repository root
- [x] Persistent PostgreSQL volume
- [x] Persistent upload volume
- [x] Root README and startup instructions

## Environment Notes

- Root defaults live in [`.env.example`](./.env.example)
- Backend-specific variables live in [`backend/.env.example`](./backend/.env.example)
- Frontend-specific variables live in [`frontend/.env.example`](./frontend/.env.example)

The Compose setup already provides working defaults, so copying env files is optional unless you want custom ports or credentials.

On the first start, the bundled translation service can take extra time to warm up and download language models. If the first translation attempt returns a temporary unavailable message, wait a bit and try again.

## Verification

After the stack is running, these commands are useful for a quick submission check:

```bash
docker compose exec backend node src/scripts/requirementsSmoke.mjs
docker compose exec frontend npm run build
docker compose ps
```

Expected result:

- the backend smoke script prints `SMOKE_OK`
- the frontend build completes successfully
- compose shows `frontend`, `backend`, `postgres`, and `translator` as running

## Known Limitations and Future Improvements

- Password reset uses a returned token instead of real email delivery.
- Frontend uses safe refreshes after some moderation actions instead of full optimistic reconciliation.
- Search indexing and notification preferences are not implemented yet.
- Uploads are stored locally only; there is no object storage backend.
- Presence is derived from socket heartbeat timing and can be less precise if the browser heavily suspends background tabs.

## Supporting Docs

- Architecture plan: [docs/architecture.md](./docs/architecture.md)
- Schema and business-rule notes: [docs/api-notes.md](./docs/api-notes.md)
- Destructive-flow test checklist: [docs/test-cases.md](./docs/test-cases.md)

## Submission Checklist

- [ ] Push the finished repository to a public GitHub or GitLab repository
- [ ] Verify `docker compose up` works from the repository root
- [ ] Prepare the Word document with full name and repository link
