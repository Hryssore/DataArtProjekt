import { apiClient } from "./client.js";

export const presenceApi = {
  self() {
    return apiClient.get("/presence/self");
  },
  listRoom(roomId) {
    return apiClient.get(`/presence/rooms/${roomId}`);
  },
  listDialog(dialogId) {
    return apiClient.get(`/presence/dialogs/${dialogId}`);
  },
};
