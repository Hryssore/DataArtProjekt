import { apiClient } from "./client.js";

export const sessionsApi = {
  list() {
    return apiClient.get("/sessions");
  },
  revoke(sessionId) {
    return apiClient.delete(`/sessions/${sessionId}`);
  },
};
