import { apiClient } from "./client.js";

export const adminApi = {
  listBans(roomId) {
    return apiClient.get(`/admin/rooms/${roomId}/bans`);
  },
  removeMember(roomId, userId) {
    return apiClient.post(`/admin/rooms/${roomId}/members/${userId}/remove`);
  },
  ban(roomId, payload) {
    return apiClient.post(`/admin/rooms/${roomId}/bans`, payload);
  },
  unban(roomId, userId) {
    return apiClient.delete(`/admin/rooms/${roomId}/bans/${userId}`);
  },
  addAdmin(roomId, userId) {
    return apiClient.post(`/admin/rooms/${roomId}/admins`, { userId });
  },
  removeAdmin(roomId, userId) {
    return apiClient.delete(`/admin/rooms/${roomId}/admins/${userId}`);
  },
  deleteMessage(roomId, messageId) {
    return apiClient.delete(`/admin/rooms/${roomId}/messages/${messageId}`);
  },
  deleteRoom(roomId) {
    return apiClient.delete(`/admin/rooms/${roomId}`);
  },
};
