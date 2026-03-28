import { apiClient } from "./client.js";

export const usersApi = {
  me() {
    return apiClient.get("/users/me");
  },
  getById(userId) {
    return apiClient.get(`/users/${userId}`);
  },
  updateProfile(payload) {
    return apiClient.patch("/users/me", payload);
  },
  search(query) {
    return apiClient.get(`/users/search?query=${encodeURIComponent(query)}`);
  },
  unread() {
    return apiClient.get("/users/me/unread");
  },
  leaderboard(period = "week") {
    return apiClient.get(`/users/leaderboard?period=${encodeURIComponent(period)}`);
  },
  sendHeart(userId) {
    return apiClient.post(`/users/${userId}/hearts`);
  },
};
