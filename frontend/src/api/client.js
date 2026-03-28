const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

async function request(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type": "application/json",
          }),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error?.message ?? "Request failed");
    error.details = data?.error?.details ?? null;
    error.status = response.status;
    throw error;
  }

  return data;
}

export const apiClient = {
  get(pathname) {
    return request(pathname);
  },
  post(pathname, body) {
    return request(pathname, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    });
  },
  patch(pathname, body) {
    return request(pathname, {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    });
  },
  delete(pathname) {
    return request(pathname, {
      method: "DELETE",
    });
  },
};
