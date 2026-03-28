import { readdir, readFile } from "node:fs/promises";

const API_BASE = "http://127.0.0.1:3000/api";
const MAILBOX_DIR = new URL("../storage/mailbox/", import.meta.url);

function fail(message, extra = null) {
  const details = extra ? `\n${JSON.stringify(extra, null, 2)}` : "";
  throw new Error(`${message}${details}`);
}

async function request(path, { method = "GET", cookie = "", json, formData } = {}) {
  const headers = {};
  let body;

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    fail(`${label} expected ${expected} but got ${result.status}`, result.data);
  }
}

function expect(condition, label, extra = null) {
  if (!condition) {
    fail(label, extra);
  }
}

function cookieFrom(result, label) {
  const cookie = result.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    fail(`${label} did not return a session cookie`, result.data);
  }
  return cookie;
}

async function waitForPasswordResetMail(afterTimestamp, email) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entries = await readdir(MAILBOX_DIR, { withFileTypes: true }).catch(() => []);
    const matchingFiles = entries
      .filter(entry => entry.isFile() && entry.name.endsWith("password-reset.json"))
      .map(entry => entry.name)
      .sort()
      .reverse();

    for (const fileName of matchingFiles) {
      const fileTimestamp = Number(fileName.split("-")[0]);
      if (!Number.isFinite(fileTimestamp) || fileTimestamp < afterTimestamp) {
        continue;
      }

      const payload = JSON.parse(
        await readFile(new URL(fileName, MAILBOX_DIR), "utf8"),
      );

      if (payload.to === email && payload.resetUrl) {
        return payload;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  fail("password reset email was not written to the local mailbox");
}

async function registerUser({ stamp, suffix, password = "Password123!" }) {
  const result = await request("/auth/register", {
    method: "POST",
    json: {
      email: `${suffix}-${stamp}@example.com`,
      username: `${suffix}${stamp}`,
      password,
    },
  });

  expectStatus(result, 201, `register ${suffix}`);

  return {
    cookie: cookieFrom(result, `register ${suffix}`),
    user: result.data.user,
    session: result.data.session,
    email: `${suffix}-${stamp}@example.com`,
    username: `${suffix}${stamp}`,
    password,
  };
}

async function main() {
  const stamp = Date.now();
  const userA = await registerUser({ stamp, suffix: "alpha" });
  const userB = await registerUser({ stamp, suffix: "beta" });

  const secondLoginA = await request("/auth/login", {
    method: "POST",
    json: {
      email: userA.email,
      password: userA.password,
    },
  });
  expectStatus(secondLoginA, 200, "login second session");
  const secondCookieA = cookieFrom(secondLoginA, "login second session");

  const sessionsBefore = await request("/sessions", { cookie: userA.cookie });
  expectStatus(sessionsBefore, 200, "list sessions before revoke");
  expect(
    (sessionsBefore.data.sessions ?? []).length >= 2,
    "expected at least two active sessions after second login",
    sessionsBefore.data,
  );

  const remoteSession = (sessionsBefore.data.sessions ?? []).find(
    session => session.id !== userA.session.id,
  );
  expect(remoteSession, "expected a remote session to revoke", sessionsBefore.data);

  const revokeRemote = await request(`/sessions/${remoteSession.id}`, {
    method: "DELETE",
    cookie: userA.cookie,
  });
  expectStatus(revokeRemote, 200, "revoke remote session");

  const changePassword = await request("/auth/change-password", {
    method: "POST",
    cookie: userA.cookie,
    json: {
      currentPassword: userA.password,
      nextPassword: "Password123!new",
    },
  });
  expectStatus(changePassword, 200, "change password");
  userA.password = "Password123!new";

  const loginWithNewPassword = await request("/auth/login", {
    method: "POST",
    json: {
      email: userA.email,
      password: userA.password,
    },
  });
  expectStatus(loginWithNewPassword, 200, "login with changed password");

  const forgotPasswordStartedAt = Date.now();
  const forgotPassword = await request("/auth/forgot-password", {
    method: "POST",
    json: { email: userB.email },
  });
  expectStatus(forgotPassword, 200, "forgot password");
  const resetMail = await waitForPasswordResetMail(forgotPasswordStartedAt, userB.email);
  const resetToken = new URL(resetMail.resetUrl).searchParams.get("token");
  expect(resetToken, "password reset email should contain a tokenized reset link");

  const resetPassword = await request("/auth/reset-password", {
    method: "POST",
    json: {
      token: resetToken,
      nextPassword: "Password123!reset",
    },
  });
  expectStatus(resetPassword, 200, "reset password");
  userB.password = "Password123!reset";

  const loginWithResetPassword = await request("/auth/login", {
    method: "POST",
    json: {
      email: userB.email,
      password: userB.password,
    },
  });
  expectStatus(loginWithResetPassword, 200, "login with reset password");
  userB.cookie = cookieFrom(loginWithResetPassword, "login with reset password");

  const createPublicRoom = await request("/rooms", {
    method: "POST",
    cookie: userA.cookie,
    json: {
      name: `public-room-${stamp}`,
      description: "Public smoke room",
      visibility: "public",
      category: "general",
      maxMembers: 1000,
      levelRequirement: 1,
      voiceEnabled: false,
      videoEnabled: false,
      isListed: true,
    },
  });
  expectStatus(createPublicRoom, 201, "create public room");
  const publicRoom = createPublicRoom.data.room;
  expect(publicRoom.maxMembers === 1000, "public room should allow 1000 participants", publicRoom);

  const publicCatalog = await request("/rooms/catalog?search=public-room", { cookie: userB.cookie });
  expectStatus(publicCatalog, 200, "public room catalog");
  expect(
    (publicCatalog.data.rooms ?? []).some(room => room.id === publicRoom.id),
    "public room should appear in catalog",
    publicCatalog.data,
  );

  const joinPublicRoom = await request(`/rooms/${publicRoom.id}/join`, {
    method: "POST",
    cookie: userB.cookie,
  });
  expectStatus(joinPublicRoom, 200, "join public room");

  const ownerLeavePublicRoom = await request(`/rooms/${publicRoom.id}/leave`, {
    method: "POST",
    cookie: userA.cookie,
  });
  expect(
    ownerLeavePublicRoom.status === 400,
    "room owner should not be able to leave the room",
    ownerLeavePublicRoom.data,
  );

  const sendRoomMessage = await request(`/messages/rooms/${publicRoom.id}`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      body: "Smoke room message 😂",
    },
  });
  expectStatus(sendRoomMessage, 201, "send room message");
  const roomMessage = sendRoomMessage.data.message;

  const replyRoomMessage = await request(`/messages/rooms/${publicRoom.id}`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      body: "Replying in room",
      replyToMessageId: roomMessage.id,
    },
  });
  expectStatus(replyRoomMessage, 201, "reply in room");

  const roomStateBeforeDelete = await request(`/rooms/${publicRoom.id}`, {
    cookie: userA.cookie,
  });
  expectStatus(roomStateBeforeDelete, 200, "room state before deleting a message");
  expect(
    roomStateBeforeDelete.data.room.messageCount >= 2,
    "room should count both created messages before deletion",
    roomStateBeforeDelete.data,
  );

  const editRoomMessage = await request(`/messages/${roomMessage.id}`, {
    method: "PATCH",
    cookie: userA.cookie,
    json: {
      body: "Edited smoke room message",
    },
  });
  expectStatus(editRoomMessage, 200, "edit room message");
  expect(
    editRoomMessage.data.message.isEdited === true,
    "edited message should report edited state",
    editRoomMessage.data,
  );

  const addReaction = await request(`/messages/${roomMessage.id}/reactions`, {
    method: "POST",
    cookie: userB.cookie,
    json: {
      reaction: "🔥",
    },
  });
  expectStatus(addReaction, 201, "add room reaction");

  const removeReaction = await request(`/messages/${roomMessage.id}/reactions/remove`, {
    method: "POST",
    cookie: userB.cookie,
    json: {
      reaction: "🔥",
    },
  });
  expectStatus(removeReaction, 200, "remove room reaction");

  const addRoomAdmin = await request(`/admin/rooms/${publicRoom.id}/admins`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      userId: userB.user.id,
    },
  });
  expectStatus(addRoomAdmin, 200, "add room admin");

  const listRoomAdmins = await request(`/rooms/${publicRoom.id}/admins`, {
    cookie: userA.cookie,
  });
  expectStatus(listRoomAdmins, 200, "list room admins");
  expect(
    (listRoomAdmins.data.admins ?? []).some(admin => admin.id === userB.user.id),
    "new admin should appear in admin list",
    listRoomAdmins.data,
  );

  const removeRoomAdmin = await request(`/admin/rooms/${publicRoom.id}/admins/${userB.user.id}`, {
    method: "DELETE",
    cookie: userA.cookie,
  });
  expectStatus(removeRoomAdmin, 200, "remove room admin");

  const deleteReplyMessage = await request(`/messages/${replyRoomMessage.data.message.id}`, {
    method: "DELETE",
    cookie: userA.cookie,
  });
  expectStatus(deleteReplyMessage, 200, "delete reply message");

  const roomStateAfterDelete = await request(`/rooms/${publicRoom.id}`, {
    cookie: userA.cookie,
  });
  expectStatus(roomStateAfterDelete, 200, "room state after deleting a message");
  expect(
    roomStateAfterDelete.data.room.messageCount === roomStateBeforeDelete.data.room.messageCount - 1,
    "deleted messages should not be counted in room message totals",
    {
      before: roomStateBeforeDelete.data.room.messageCount,
      after: roomStateAfterDelete.data.room.messageCount,
    },
  );

  const roomHistory = await request(`/messages/rooms/${publicRoom.id}?limit=30`, {
    cookie: userB.cookie,
  });
  expectStatus(roomHistory, 200, "room history");
  expect(
    (roomHistory.data.messages ?? []).length >= 2,
    "room history should include created messages",
    roomHistory.data,
  );

  const roomAttachmentForm = new FormData();
  roomAttachmentForm.append(
    "files",
    new Blob(["room attachment"], { type: "text/plain" }),
    "room-note.txt",
  );
  roomAttachmentForm.append("comment", "Smoke attachment comment");

  const uploadRoomAttachment = await request(`/attachments/messages/${roomMessage.id}`, {
    method: "POST",
    cookie: userA.cookie,
    formData: roomAttachmentForm,
  });
  expectStatus(uploadRoomAttachment, 201, "upload room attachment");
  expect(
    uploadRoomAttachment.data.attachments?.[0]?.comment === "Smoke attachment comment",
    "attachment comment should persist",
    uploadRoomAttachment.data,
  );

  const attachmentId = uploadRoomAttachment.data.attachments[0].id;
  const downloadRoomAttachment = await request(
    `/attachments/${attachmentId}/download`,
    { cookie: userB.cookie },
  );
  expect(
    downloadRoomAttachment.status === 200,
    "room attachment should be downloadable by current room member",
    downloadRoomAttachment.data,
  );

  const friendRequest = await request("/friends/requests", {
    method: "POST",
    cookie: userA.cookie,
    json: {
      username: userB.username,
      message: "Let's connect",
    },
  });
  expectStatus(friendRequest, 201, "create friend request");

  const friendRequestsForB = await request("/friends/requests", { cookie: userB.cookie });
  expectStatus(friendRequestsForB, 200, "list friend requests");
  const incomingForB = (friendRequestsForB.data.requests ?? []).find(
    item => item.sender.username === userA.username && item.status === "pending",
  );
  expect(incomingForB, "expected incoming friend request for user B", friendRequestsForB.data);

  const acceptFriend = await request(`/friends/requests/${incomingForB.id}/accept`, {
    method: "POST",
    cookie: userB.cookie,
  });
  expectStatus(acceptFriend, 200, "accept friend request");

  const friendsForA = await request("/friends", { cookie: userA.cookie });
  expectStatus(friendsForA, 200, "list friends");
  expect(
    (friendsForA.data.friends ?? []).some(friend => friend.id === userB.user.id),
    "friendship should exist after acceptance",
    friendsForA.data,
  );

  const publicProfile = await request(`/users/${userB.user.id}`, {
    cookie: userA.cookie,
  });
  expectStatus(publicProfile, 200, "view another user profile");
  expect(
    publicProfile.data.user.username === userB.username,
    "public profile should expose the requested user",
    publicProfile.data,
  );

  const createDialog = await request(`/dialogs/with/${userB.user.id}`, {
    method: "POST",
    cookie: userA.cookie,
  });
  expectStatus(createDialog, 201, "create or get dialog");
  const dialog = createDialog.data.dialog;

  const sendDialogMessage = await request(`/messages/dialogs/${dialog.id}`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      body: "Private smoke message",
    },
  });
  expectStatus(sendDialogMessage, 201, "send dialog message");

  const dialogAttachmentForm = new FormData();
  dialogAttachmentForm.append(
    "files",
    new Blob(["dialog attachment"], { type: "text/plain" }),
    "dialog-note.txt",
  );
  dialogAttachmentForm.append("comment", "Dialog attachment comment");

  const uploadDialogAttachment = await request(
    `/attachments/messages/${sendDialogMessage.data.message.id}`,
    {
      method: "POST",
      cookie: userA.cookie,
      formData: dialogAttachmentForm,
    },
  );
  expectStatus(uploadDialogAttachment, 201, "upload dialog attachment");

  const hideDialogForB = await request(`/dialogs/${dialog.id}`, {
    method: "DELETE",
    cookie: userB.cookie,
  });
  expectStatus(hideDialogForB, 200, "hide dialog for one participant");

  const dialogsAfterHide = await request("/dialogs", { cookie: userB.cookie });
  expectStatus(dialogsAfterHide, 200, "list dialogs after hide");
  expect(
    !(dialogsAfterHide.data.dialogs ?? []).some(item => item.id === dialog.id),
    "hidden dialog should disappear from the current user's dialog list",
    dialogsAfterHide.data,
  );

  const reopenDialogForB = await request(`/dialogs/with/${userA.user.id}`, {
    method: "POST",
    cookie: userB.cookie,
  });
  expectStatus(reopenDialogForB, 201, "reopen hidden dialog");
  expect(
    reopenDialogForB.data.dialog.id === dialog.id,
    "reopening a hidden dialog should reuse the same dialog",
    reopenDialogForB.data,
  );

  const banUser = await request(`/friends/bans/${userB.user.id}`, {
    method: "POST",
    cookie: userA.cookie,
  });
  expectStatus(banUser, 200, "ban user");

  const friendsAfterBan = await request("/friends", { cookie: userA.cookie });
  expectStatus(friendsAfterBan, 200, "list friends after ban");
  expect(
    !(friendsAfterBan.data.friends ?? []).some(friend => friend.id === userB.user.id),
    "friendship should be terminated after a user ban",
    friendsAfterBan.data,
  );

  const sendFrozenDialogMessage = await request(`/messages/dialogs/${dialog.id}`, {
    method: "POST",
    cookie: userB.cookie,
    json: {
      body: "This should fail",
    },
  });
  expect(
    sendFrozenDialogMessage.status === 403,
    "banned user should not be able to send new dialog messages",
    sendFrozenDialogMessage.data,
  );

  const frozenDialogHistory = await request(`/messages/dialogs/${dialog.id}?limit=30`, {
    cookie: userB.cookie,
  });
  expectStatus(frozenDialogHistory, 200, "read frozen dialog history");
  expect(
    (frozenDialogHistory.data.messages ?? []).length >= 1,
    "existing dialog history should remain visible after ban",
    frozenDialogHistory.data,
  );

  const createPrivateRoom = await request("/rooms", {
    method: "POST",
    cookie: userA.cookie,
    json: {
      name: `private-room-${stamp}`,
      description: "Private smoke room",
      visibility: "private",
      category: "general",
      maxMembers: 50,
      levelRequirement: 1,
      voiceEnabled: false,
      videoEnabled: false,
      isListed: false,
    },
  });
  expectStatus(createPrivateRoom, 201, "create private room");
  const privateRoom = createPrivateRoom.data.room;

  const inviteToPrivateRoom = await request(`/rooms/${privateRoom.id}/invitations`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      userId: userB.user.id,
    },
  });
  expectStatus(inviteToPrivateRoom, 201, "invite to private room");

  const invitationsForB = await request("/rooms/invitations/mine", { cookie: userB.cookie });
  expectStatus(invitationsForB, 200, "list private room invitations");
  const invitation = (invitationsForB.data.invitations ?? []).find(
    item => item.room.id === privateRoom.id,
  );
  expect(invitation, "expected private room invitation for user B", invitationsForB.data);

  const privateCatalogLookup = await request(`/rooms/catalog?search=${privateRoom.name}`, {
    cookie: userB.cookie,
  });
  expectStatus(privateCatalogLookup, 200, "private room must stay hidden from catalog");
  expect(
    !(privateCatalogLookup.data.rooms ?? []).some(room => room.id === privateRoom.id),
    "private room should not appear in public catalog",
    privateCatalogLookup.data,
  );

  const acceptPrivateInvite = await request(`/rooms/invitations/${invitation.id}/accept`, {
    method: "POST",
    cookie: userB.cookie,
  });
  expectStatus(acceptPrivateInvite, 200, "accept private room invitation");

  const privateMessage = await request(`/messages/rooms/${privateRoom.id}`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      body: "Private room message",
    },
  });
  expectStatus(privateMessage, 201, "send private room message");

  const privateAttachmentForm = new FormData();
  privateAttachmentForm.append(
    "files",
    new Blob(["private attachment"], { type: "text/plain" }),
    "private-note.txt",
  );
  privateAttachmentForm.append("comment", "Private attachment comment");

  const uploadPrivateAttachment = await request(
    `/attachments/messages/${privateMessage.data.message.id}`,
    {
      method: "POST",
      cookie: userA.cookie,
      formData: privateAttachmentForm,
    },
  );
  expectStatus(uploadPrivateAttachment, 201, "upload private room attachment");
  const privateAttachmentId = uploadPrivateAttachment.data.attachments[0].id;

  const removeMemberAsBan = await request(
    `/admin/rooms/${privateRoom.id}/members/${userB.user.id}/remove`,
    {
      method: "POST",
      cookie: userA.cookie,
    },
  );
  expectStatus(removeMemberAsBan, 200, "remove member as ban");

  const bannedRoomHistory = await request(`/messages/rooms/${privateRoom.id}?limit=30`, {
    cookie: userB.cookie,
  });
  expect(
    bannedRoomHistory.status === 403,
    "removed member should lose access to private room history",
    bannedRoomHistory.data,
  );

  const deniedPrivateAttachmentAccess = await request(
    `/attachments/${privateAttachmentId}/download`,
    { cookie: userB.cookie },
  );
  expect(
    deniedPrivateAttachmentAccess.status === 403,
    "removed member should lose access to private room files",
    deniedPrivateAttachmentAccess.data,
  );

  const bannedAttachmentAccess = await request(
    `/attachments/${attachmentId}/download`,
    { cookie: userB.cookie },
  );
  expect(
    bannedAttachmentAccess.status === 200,
    "public room attachment should still work while public room membership remains valid",
    bannedAttachmentAccess.data,
  );

  const privateBans = await request(`/admin/rooms/${privateRoom.id}/bans`, {
    cookie: userA.cookie,
  });
  expectStatus(privateBans, 200, "list room bans");
  expect(
    privateBans.data.bans?.[0]?.bannedBy?.username === userA.username,
    "room ban list should include who banned the user",
    privateBans.data,
  );

  const ownedRoomForDelete = await request("/rooms", {
    method: "POST",
    cookie: userA.cookie,
    json: {
      name: `owned-delete-room-${stamp}`,
      description: "Owned room for account deletion test",
      visibility: "public",
      category: "general",
      maxMembers: 1000,
      levelRequirement: 1,
      voiceEnabled: false,
      videoEnabled: false,
      isListed: true,
    },
  });
  expectStatus(ownedRoomForDelete, 201, "create owned room for deletion");

  const roomToDisappear = ownedRoomForDelete.data.room;

  const joinOwnedRoom = await request(`/rooms/${roomToDisappear.id}/join`, {
    method: "POST",
    cookie: userB.cookie,
  });
  expectStatus(joinOwnedRoom, 200, "join owned room before account deletion");

  const promoteOwnedRoomAdmin = await request(`/admin/rooms/${roomToDisappear.id}/admins`, {
    method: "POST",
    cookie: userA.cookie,
    json: {
      userId: userB.user.id,
    },
  });
  expectStatus(promoteOwnedRoomAdmin, 200, "promote admin in owned room before account deletion");

  const deleteAccount = await request("/auth/account", {
    method: "DELETE",
    cookie: userA.cookie,
  });
  expectStatus(deleteAccount, 200, "delete current account");

  const deletedRoomLookup = await request(`/rooms/${roomToDisappear.id}`, {
    cookie: userB.cookie,
  });
  expect(
    deletedRoomLookup.status === 404,
    "owned room should disappear after owner account deletion even if another admin exists",
    deletedRoomLookup.data,
  );

  console.log("SMOKE_OK");
}

main().catch(error => {
  console.error("SMOKE_FAILED");
  console.error(error);
  process.exit(1);
});
