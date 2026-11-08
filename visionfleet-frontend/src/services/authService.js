// These relative API URLs work with the Vite development proxy,
// and later with a production server routing /api to ASP.NET Core.
const options = { credentials: "include", cache: "no-store" };

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", options);

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to check your login session.");
  }

  return response.json();
}

export async function getCsrfToken() {
  const response = await fetch("/api/security/csrf-token", options);

  if (!response.ok) {
    throw new Error("Unable to get security token.");
  }

  const data = await response.json();
  if (!data.csrfToken) {
    throw new Error("Security token is missing.");
  }

  return data.csrfToken;
}

export async function login(email, password) {
  const csrfToken = await getCsrfToken();

  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Incorrect email address or password.");
    }
    if (response.status === 400) {
      throw new Error("Login request was rejected. Please try again.");
    }
    throw new Error("Unable to sign in. Please try again.");
  }

  // The cookie is set after login. /me supplies the trusted role.
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Signed in, but unable to load account details.");
  }
  return user;
}

export async function logout() {
  // Obtain a new token for the authenticated identity.
  const csrfToken = await getCsrfToken();

  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-TOKEN": csrfToken },
  });

  if (!response.ok) {
    throw new Error("Unable to sign out. Please try again.");
  }
}
