import { apiClient } from "./client.js";

export const attachmentsApi = {
  upload(messageId, files, comment = "") {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));
    if (comment) {
      formData.append("comment", comment);
    }

    return apiClient.post(`/attachments/messages/${messageId}`, formData);
  },
  downloadUrl(attachmentId) {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
    return `${apiUrl}/attachments/${attachmentId}/download`;
  },
  previewUrl(attachmentId) {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
    return `${apiUrl}/attachments/${attachmentId}/download?inline=1`;
  },
  async fetchPreviewBlob(attachmentId) {
    const response = await fetch(this.previewUrl(attachmentId), {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Preview unavailable");
    }

    return response.blob();
  },
};
