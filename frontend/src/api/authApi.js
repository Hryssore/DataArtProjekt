import { apiClient } from "./client.js";

export const authApi = {
  login(payload) {
    return apiClient.post("/auth/login", payload);
  },
  register(payload) {
    return apiClient.post("/auth/register", payload);
  },
  me() {
    return apiClient.get("/auth/me");
  },
  logout() {
    return apiClient.post("/auth/logout");
  },
  forgotPassword(payload) {
    return apiClient.post("/auth/forgot-password", payload);
  },
  resetPassword(payload) {
    return apiClient.post("/auth/reset-password", payload);
  },
  changePassword(payload) {
    return apiClient.post("/auth/change-password", payload);
  },
  deleteAccount() {
    return apiClient.delete("/auth/account");
  },
};
