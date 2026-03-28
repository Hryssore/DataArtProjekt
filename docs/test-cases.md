# Destructive and Access-Flow Test Cases

## Permission checks that must always hold

- room message history requires active room membership
- room attachment download requires active room membership and non-deleted message
- private dialog history requires dialog participation
- private dialog sending requires friendship, no user ban, and non-frozen dialog
- room moderation actions require admin or owner role
- owner-only room deletion and owner-only protection against leaving own room
- active session revoke may target one remote session or the current session only

## Account deletion

1. Create user A, user B, and a room owned by user A with attachments.
2. Add user A to a different room owned by user B.
3. Delete account A.
4. Verify:
   - user A can no longer authenticate
   - rooms owned by A are deleted
   - room messages and attachments from deleted rooms are inaccessible
   - files for deleted rooms are removed from filesystem volume
   - membership of A in rooms owned by B is removed
   - A no longer appears in member lists
   - A sessions are revoked

## Room access loss

1. Add user A to a room and upload an attachment.
2. Ban or remove user A from the room.
3. Verify:
   - room history request returns forbidden or inaccessible
   - attachment download returns forbidden or inaccessible
   - unread counts no longer include that room for A

## Room deletion

1. Owner creates room and sends messages with attachments.
2. Owner deletes the room.
3. Verify:
   - room endpoint returns not found
   - room messages are deleted from the database
   - attachment metadata is deleted from the database
   - attachment files are removed from the filesystem volume

## User ban and frozen dialogs

1. Create friendship and exchange personal messages.
2. User A bans user B.
3. Verify:
   - friendship is removed
   - new personal messages are rejected
   - existing dialog history is still readable
   - dialog reports `canWrite = false`
   - friend requests in either direction are blocked while ban exists

## Session isolation

1. Log the same user in from two browsers.
2. Logout current session in browser 1.
3. Verify browser 2 stays authenticated.
4. Revoke browser 2 remotely from browser 1.
5. Verify browser 2 loses access while browser 1 stays authenticated.
