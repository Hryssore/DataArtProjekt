# Backend Rules and Notes

## SQL-backed guarantees

- unique email via `users.email`
- unique immutable username via `users.username`
- unique room name via `rooms.name`
- personal dialog uniqueness via `personal_dialogs(user_low_id, user_high_id)`
- attachment ownership via `attachments.message_id`
- one-context message rule via `messages` room/dialog check constraint
- session tracking via per-row `sessions`
- room-owned message and attachment cascade via foreign keys from `rooms` to `messages` to `attachments`

## Business rules still enforced in application logic

- usernames are immutable because no update route is exposed
- personal messaging write access requires friendship and no user ban
- existing personal history becomes read-only when a user ban freezes the dialog
- public rooms can be joined directly, private rooms only by invitation
- owner cannot leave their own room
- removing a member is treated as a room ban
- only room owner may remove or ban another admin
- room history and attachments become inaccessible immediately after membership loss
- protected attachment downloads re-check room or dialog access on every request
- account deletion removes owned rooms, memberships elsewhere, sessions, and filesystem files tied to deleted rooms/dialogs
- room deletion removes database records and filesystem uploads
- online/AFK/offline state is derived from active tab connections and heartbeat timestamps

## Session and auth notes

- auth uses an opaque, hashed session token stored in an `httpOnly` cookie
- current-session logout deletes only the current session row
- remote logout deletes only the selected session row
- password reset is workshop-friendly: reset token is returned in the API response instead of email delivery

## Pagination strategy

- room and dialog history use cursor-based pagination with `before=<created_at>`
- API returns chronological messages plus `nextCursor` and `hasMore`
- frontend keeps infinite scroll stable and only autoscrolls if the user was already near the bottom
