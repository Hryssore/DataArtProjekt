# Classic Web Chat

Classic Web Chat is a workshop-ready web chat application built as a monorepo with:

- React frontend
- Node.js + Express backend
- PostgreSQL persistence
- Socket.IO realtime delivery and presence
- local filesystem attachment storage
- Docker Compose startup from the repository root

The project follows a classic web chat model: rooms, personal dialogs, contacts, moderation, history, unread indicators, and presence.

## Run The Project

1. Optional: copy the root environment template.

```bash
cp .env.example .env
```

2. Start the full stack from the repository root.

```bash
docker compose up --build
```

3. Open the app and health endpoint.

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend health: [http://localhost:3000/health](http://localhost:3000/health)

## Services

`docker-compose.yml` starts these services:

- `frontend` on port `5173`
- `backend` on port `3000`
- `postgres` on port `5432`
- `translator` for on-demand message translation
- `mailpit` on port `8025` for local email testing

Persistent Docker volumes:

- `postgres_data`
- `backend_uploads`
- `backend_mailbox`

## Password Reset And Email

Password reset is email-based.

Two practical modes are supported:

1. Local development mailbox
   - leave the default Mailpit settings
   - open [http://localhost:8025](http://localhost:8025) to see reset emails locally

2. Real SMTP mailbox
   - configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in the root `.env`
   - for Gmail, use a Google App Password, not the normal account password

The reset link points to `http://localhost:5173/reset-password` by default, so it should be opened on the same machine where the stack is running.

## Main Features

### Accounts and sessions

- registration with unique email
- immutable unique username
- login with persistent session cookies
- logout for the current session only
- active sessions list with revoke support
- password change
- password reset through email
- account deletion

### Presence

- online / AFK / offline states
- multi-tab presence handling
- low-latency presence updates through Socket.IO

### Contacts and personal dialogs

- friend requests by username
- friend requests from room member lists
- accept / reject / cancel request
- remove friend
- user-to-user ban
- personal dialogs allowed only between friends when neither side banned the other
- frozen read-only personal history after a user ban

### Rooms and moderation

- public rooms with searchable catalog
- private rooms by invitation only
- unique room names
- owner / admin / member model
- room bans and unbans
- remove member as a ban action
- view who banned a user in the ban list
- manage admins
- delete room

### Messaging

- room messages and personal messages
- multiline text
- UTF-8 text and emoji
- replies
- edit own message with edited indicator
- delete by author or room moderators
- persistent ordered history
- infinite scroll for older messages
- typing indicators
- message reactions

### Files and images

- upload button
- paste support
- images and arbitrary files
- original file name preservation
- optional attachment comment
- protected download by room membership / dialog authorization
- loss of room access blocks room message and file access

### UI and realtime

- classic side navigation with rooms and contacts
- unread indicators for rooms and personal dialogs
- room member presence
- moderation actions through modal dialogs
- automatic scroll to new messages when already at the bottom
- no forced autoscroll when reading older history

## Additional UI Extensions

The current build also includes a few optional extras on top of the core assignment flow:

- profile customization with generated looks
- hearts / profile likes
- weekly leaderboard view
- daily app activity quests
- discussion / goals / voice panes inside rooms

These are additions around the chat experience; the core required chat flows remain available.

## Verification

Useful checks after startup:

```bash
docker compose exec backend node src/scripts/requirementsSmoke.mjs
docker compose exec frontend npm run build
docker compose ps
```

Expected result:

- backend smoke script prints `SMOKE_OK`
- frontend build finishes successfully
- `frontend`, `backend`, `postgres`, `translator`, and `mailpit` are running

## Project Structure

```text
.
|-- backend/
|   |-- Dockerfile
|   |-- package.json
|   |-- .env.example
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
|   |-- .env.example
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
|-- .env.example
|-- docker-compose.yml
`-- README.md
```

## Environment Notes

The main shared template is:

- [`./.env.example`](./.env.example)

Additional local templates are available in:

- [`./backend/.env.example`](./backend/.env.example)
- [`./frontend/.env.example`](./frontend/.env.example)

For most local runs, the root `.env.example` is enough.

## Supporting Docs

- Architecture notes: [docs/architecture.md](./docs/architecture.md)
- API and schema notes: [docs/api-notes.md](./docs/api-notes.md)
- Manual destructive-flow test cases: [docs/test-cases.md](./docs/test-cases.md)

## Submission Checklist

- [ ] Push the repository to a public GitHub or GitLab repository
- [ ] Verify `docker compose up` works from the repository root
- [ ] Verify `SMOKE_OK` and frontend build before submission
- [ ] Prepare the Word document with full name and repository link
