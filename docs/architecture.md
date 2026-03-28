# Architecture Plan

## Goal

Build a classic web chat application with a practical MVP-first architecture that can expand into the full workshop requirements without a rewrite.

## Stack

- Frontend: React
- Backend: Node.js + Express
- Database: PostgreSQL
- Realtime: Socket.IO
- File storage: local filesystem
- Containerization: Docker Compose

## Repository Structure

```text
repo-root/
  docker-compose.yml
  .env.example
  README.md

  frontend/
    Dockerfile
    package.json
    public/
    src/
      app/
        router/
        providers/
        store/
      api/
      socket/
      features/
        auth/
        rooms/
        dialogs/
        friends/
        sessions/
        settings/
        moderation/
      components/
        layout/
        chat/
        forms/
        ui/
      pages/
      styles/

  backend/
    Dockerfile
    package.json
    src/
      server.js
      app.js
      config/
      db/
        pool.js
        migrations/
        queries/
      modules/
        auth/
        users/
        sessions/
        friends/
        bans/
        rooms/
        dialogs/
        messages/
        attachments/
        moderation/
        presence/
        unread/
      middlewares/
      utils/
      validations/
      sockets/
      storage/
        uploads/
    scripts/

  infra/
    postgres/
      init/

  docs/
    architecture.md
    api-notes.md
```

## Main Backend Modules

- `auth`: registration, login, logout, password change, password reset flow
- `users`: account lifecycle and user-level data access
- `sessions`: active session tracking and remote logout
- `friends`: friend requests and friendships
- `bans`: user-to-user bans
- `rooms`: room creation, catalog, invitations, membership, admin roles, bans
- `dialogs`: personal two-user dialogs
- `messages`: text messages, replies, edits, deletes, history pagination
- `attachments`: upload metadata, storage mapping, and protected file access
- `moderation`: admin and owner actions for room management
- `presence`: online, AFK, offline aggregation across tabs and sessions
- `unread`: unread counters and read markers
- `sockets`: Socket.IO authentication and realtime event delivery

## Database Domains

### Users and account access

- `users`
  - `id`
  - `email UNIQUE`
  - `username UNIQUE`
  - `password_hash`
  - `created_at`
  - `deleted_at`
- `sessions`
  - `id`
  - `user_id`
  - `session_token_hash`
  - `ip`
  - `user_agent`
  - `last_seen_at`
  - `expires_at`

### Social graph

- `friend_requests`
  - `id`
  - `sender_id`
  - `receiver_id`
  - `message`
  - `status`
  - `created_at`
- `friendships`
  - `id`
  - `user1_id`
  - `user2_id`
  - `created_at`
- `user_bans`
  - `id`
  - `source_user_id`
  - `target_user_id`
  - `created_at`

### Rooms

- `rooms`
  - `id`
  - `name UNIQUE`
  - `description`
  - `visibility`
  - `owner_id`
  - `created_at`
- `room_members`
  - `id`
  - `room_id`
  - `user_id`
  - `joined_at`
- `room_admins`
  - `id`
  - `room_id`
  - `user_id`
  - `granted_by_user_id`
- `room_bans`
  - `id`
  - `room_id`
  - `user_id`
  - `banned_by_user_id`
  - `reason`
  - `created_at`
- `room_invitations`
  - `id`
  - `room_id`
  - `invited_user_id`
  - `invited_by_user_id`
  - `status`
  - `created_at`

### Messaging

- `personal_dialogs`
  - `id`
  - `user1_id`
  - `user2_id`
  - `is_frozen`
  - `frozen_reason`
- `messages`
  - `id`
  - `room_id NULL`
  - `dialog_id NULL`
  - `sender_id`
  - `body`
  - `reply_to_message_id NULL`
  - `edited_at NULL`
  - `deleted_at NULL`
  - `created_at`
- `attachments`
  - `id`
  - `message_id`
  - `stored_name`
  - `original_name`
  - `mime_type`
  - `size_bytes`
  - `comment`
  - `created_at`

### Activity and unread state

- `message_reads`
  - `id`
  - `message_id`
  - `user_id`
  - `read_at`
- `conversation_reads`
  - `id`
  - `user_id`
  - `room_id NULL`
  - `dialog_id NULL`
  - `last_read_message_id`
  - `updated_at`
- `presence_states`
  - `user_id`
  - `status`
  - `last_activity_at`
  - `last_online_at`
- `presence_connections`
  - `id`
  - `user_id`
  - `session_id`
  - `socket_id`
  - `tab_id`
  - `last_heartbeat_at`

## Core Relationships

- `rooms.owner_id -> users.id`
- `sessions.user_id -> users.id`
- `friend_requests.sender_id -> users.id`
- `friend_requests.receiver_id -> users.id`
- `friendships.user1_id -> users.id`
- `friendships.user2_id -> users.id`
- `user_bans.source_user_id -> users.id`
- `user_bans.target_user_id -> users.id`
- `room_members.room_id -> rooms.id`
- `room_members.user_id -> users.id`
- `room_admins.room_id -> rooms.id`
- `room_admins.user_id -> users.id`
- `room_bans.room_id -> rooms.id`
- `room_bans.user_id -> users.id`
- `room_invitations.room_id -> rooms.id`
- `room_invitations.invited_user_id -> users.id`
- `personal_dialogs.user1_id -> users.id`
- `personal_dialogs.user2_id -> users.id`
- `messages.sender_id -> users.id`
- `messages.room_id -> rooms.id`
- `messages.dialog_id -> personal_dialogs.id`
- `messages.reply_to_message_id -> messages.id`
- `attachments.message_id -> messages.id`

## MVP Scope

- registration and authentication
- persistent sessions
- public and private rooms
- room membership and invitations
- friend requests and friendships
- personal dialogs between friends
- user-to-user bans
- room moderation basics
- text messaging with persistent history
- file attachment support using local storage
- unread indicators
- online and offline presence
- active sessions list
- startup from repository root using Docker Compose

## Later Enhancements

- AFK behavior refinement across multiple tabs
- full password reset email delivery
- richer search and filtering
- typing indicators
- reactions and richer message metadata
- image previews and thumbnail generation
- moderation audit logs
- rate limiting, abuse controls, and observability

## Backend-Enforced Rules

- usernames are unique and immutable after registration
- room names are globally unique
- personal messaging is allowed only when users are friends and no ban exists in either direction
- if one user bans the other, existing personal history remains visible but the dialog becomes read-only
- if room access is lost, room messages and files must immediately become inaccessible
- room owner cannot leave their own room and must delete it instead
- removing a member is treated as a room ban and should be enforced atomically
- deleting an account removes owned rooms only; joined rooms owned by others must remain
- deleting a room must cascade its message records and attachment metadata, and trigger filesystem cleanup
- presence must be aggregated across all open tabs and sessions for a user

## Docker Compose Services

- `frontend`: React client
- `backend`: Express API with Socket.IO
- `postgres`: PostgreSQL database

Expected persistent volumes:

- `postgres_data`
- `backend_uploads`

## Recommended Development Order

1. Establish monorepo structure and shared root conventions
2. Generate backend skeleton with config, database connection, and route placeholders
3. Generate frontend skeleton with routing, layouts, and API/socket placeholders
4. Add root-level Docker Compose and environment files
5. Add PostgreSQL schema and migrations
6. Implement authentication and session management
7. Implement room management and permissions
8. Implement friendships, personal dialogs, and user bans
9. Implement room and personal messaging
10. Implement attachment upload and protected download
11. Implement realtime delivery, presence, and unread updates
12. Integrate frontend screens and chat flows
13. Add moderation UI and advanced admin actions
14. Verify destructive flows and cleanup behavior
15. Prepare README and submission artifacts

## Architectural Note

The key design choice for this project is to centralize permission checks around chat context:

- room context: access depends on membership, invitation state, and room bans
- personal dialog context: access depends on friendship and user-to-user ban state

That keeps business rules consistent for history retrieval, unread counters, attachments, and realtime delivery.
