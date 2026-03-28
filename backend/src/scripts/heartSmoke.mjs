const BASE_URL = "http://127.0.0.1:3000/api";
const PASSWORD = "Password123";

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

async function register(email, username) {
  const response = await request("/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      username,
      password: PASSWORD,
    }),
  });

  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  return { response, cookie };
}

async function run() {
  const stamp = Date.now();
  const userA = {
    email: `heart-a-${stamp}@example.com`,
    username: `hearta${stamp}`,
  };
  const userB = {
    email: `heart-b-${stamp}@example.com`,
    username: `heartb${stamp}`,
  };

  const registrationA = await register(userA.email, userA.username);
  const registrationB = await register(userB.email, userB.username);

  console.log("REGISTER_A", registrationA.response.status);
  console.log("REGISTER_B", registrationB.response.status);

  const requestResponse = await request("/friends/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: registrationA.cookie,
    },
    body: JSON.stringify({
      username: userB.username,
    }),
  });

  console.log("REQUEST", requestResponse.status);

  const acceptResponse = await request(
    `/friends/requests/${requestResponse.data.request.id}/accept`,
    {
      method: "POST",
      headers: {
        Cookie: registrationB.cookie,
      },
    },
  );

  console.log("ACCEPT", acceptResponse.status);

  const heartResponse = await request(
    `/users/${requestResponse.data.request.receiver.id}/hearts`,
    {
      method: "POST",
      headers: {
        Cookie: registrationA.cookie,
      },
    },
  );

  console.log("HEART", heartResponse.status, JSON.stringify(heartResponse.data));

  const senderFriends = await request("/friends", {
    headers: {
      Cookie: registrationA.cookie,
    },
  });

  const recipientFriends = await request("/friends", {
    headers: {
      Cookie: registrationB.cookie,
    },
  });

  console.log("SENDER_FRIENDS", JSON.stringify(senderFriends.data));
  console.log("RECIPIENT_FRIENDS", JSON.stringify(recipientFriends.data));
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
