import { apiClient } from "./client.js";

export const dialogsApi = {
  list() {
    return apiClient.get("/dialogs");
  },
  getById(dialogId) {
    return apiClient.get(`/dialogs/${dialogId}`);
  },
  getOrCreateWithUser(userId) {
    return apiClient.post(`/dialogs/with/${userId}`);
  },
  remove(dialogId) {
    return apiClient.delete(`/dialogs/${dialogId}`);
  },
};
