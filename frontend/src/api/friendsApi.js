import { apiClient } from "./client.js";

export const friendsApi = {
  list() {
    return apiClient.get("/friends");
  },
  listRequests() {
    return apiClient.get("/friends/requests");
  },
  createRequest(payload) {
    return apiClient.post("/friends/requests", payload);
  },
  acceptRequest(requestId) {
    return apiClient.post(`/friends/requests/${requestId}/accept`);
  },
  rejectRequest(requestId) {
    return apiClient.post(`/friends/requests/${requestId}/reject`);
  },
  cancelRequest(requestId) {
    return apiClient.delete(`/friends/requests/${requestId}`);
  },
  remove(userId) {
    return apiClient.delete(`/friends/${userId}`);
  },
  ban(userId) {
    return apiClient.post(`/friends/bans/${userId}`);
  },
  unban(userId) {
    return apiClient.delete(`/friends/bans/${userId}`);
  },
};
