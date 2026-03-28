import { apiClient } from "./client.js";

export const roomsApi = {
  listCatalog(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || value === false) {
        return;
      }
      params.set(key, String(value));
    });

    const suffix = params.toString();
    return apiClient.get(`/rooms/catalog${suffix ? `?${suffix}` : ""}`);
  },
  listMine() {
    return apiClient.get("/rooms/mine");
  },
  listInvitations() {
    return apiClient.get("/rooms/invitations/mine");
  },
  getById(roomId) {
    return apiClient.get(`/rooms/${roomId}`);
  },
  create(payload) {
    return apiClient.post("/rooms", payload);
  },
  join(roomId) {
    return apiClient.post(`/rooms/${roomId}/join`);
  },
  leave(roomId) {
    return apiClient.post(`/rooms/${roomId}/leave`);
  },
  remove(roomId) {
    return apiClient.delete(`/rooms/${roomId}`);
  },
  listMembers(roomId) {
    return apiClient.get(`/rooms/${roomId}/members`);
  },
  listGoals(roomId) {
    return apiClient.get(`/rooms/${roomId}/goals`);
  },
  createGoal(roomId, payload) {
    return apiClient.post(`/rooms/${roomId}/goals`, payload);
  },
  updateGoal(roomId, goalId, payload) {
    return apiClient.patch(`/rooms/${roomId}/goals/${goalId}`, payload);
  },
  deleteGoal(roomId, goalId) {
    return apiClient.delete(`/rooms/${roomId}/goals/${goalId}`);
  },
  suggestGoal(roomId, title) {
    return apiClient.post(`/rooms/${roomId}/goals/suggest`, { title });
  },
  addGoalStep(roomId, goalId, title) {
    return apiClient.post(`/rooms/${roomId}/goals/${goalId}/steps`, { title });
  },
  toggleGoalStep(roomId, goalId, stepId) {
    return apiClient.post(`/rooms/${roomId}/goals/${goalId}/steps/${stepId}/toggle`);
  },
  activateGoalInChat(roomId, goalId) {
    return apiClient.post(`/rooms/${roomId}/goals/${goalId}/activate`);
  },
  clearActiveTopic(roomId) {
    return apiClient.delete(`/rooms/${roomId}/active-topic`);
  },
  listAdmins(roomId) {
    return apiClient.get(`/rooms/${roomId}/admins`);
  },
  invite(roomId, userId) {
    return apiClient.post(`/rooms/${roomId}/invitations`, { userId });
  },
  acceptInvitation(invitationId) {
    return apiClient.post(`/rooms/invitations/${invitationId}/accept`);
  },
};
