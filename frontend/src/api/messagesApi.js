import { apiClient } from "./client.js";

export const messagesApi = {
  listRoom(roomId, query = {}) {
    const params = new URLSearchParams();
    if (query.before) {
      params.set("before", query.before);
    }
    if (query.limit) {
      params.set("limit", String(query.limit));
    }
    return apiClient.get(`/messages/rooms/${roomId}?${params.toString()}`);
  },
  sendRoom(roomId, payload) {
    return apiClient.post(`/messages/rooms/${roomId}`, payload);
  },
  markRoomRead(roomId, payload) {
    return apiClient.post(`/messages/rooms/${roomId}/read`, payload);
  },
  listDialog(dialogId, query = {}) {
    const params = new URLSearchParams();
    if (query.before) {
      params.set("before", query.before);
    }
    if (query.limit) {
      params.set("limit", String(query.limit));
    }
    return apiClient.get(`/messages/dialogs/${dialogId}?${params.toString()}`);
  },
  sendDialog(dialogId, payload) {
    return apiClient.post(`/messages/dialogs/${dialogId}`, payload);
  },
  markDialogRead(dialogId, payload) {
    return apiClient.post(`/messages/dialogs/${dialogId}/read`, payload);
  },
  update(messageId, payload) {
    return apiClient.patch(`/messages/${messageId}`, payload);
  },
  translate(messageId, payload = {}) {
    return apiClient.post(`/messages/${messageId}/translate`, payload);
  },
  addReaction(messageId, reaction) {
    return apiClient.post(`/messages/${messageId}/reactions`, { reaction });
  },
  removeReaction(messageId, reaction) {
    return apiClient.post(`/messages/${messageId}/reactions/remove`, { reaction });
  },
  remove(messageId) {
    return apiClient.delete(`/messages/${messageId}`);
  },
};
