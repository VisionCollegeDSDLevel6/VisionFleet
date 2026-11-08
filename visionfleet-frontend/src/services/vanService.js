
const API_URL = "/api/vans";

// ========================================
// GET: Load all vans
// ========================================

export async function getVans() {
  const response = await fetch(API_URL, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  if (response.status === 403) {
    throw new Error(
      "You do not have permission to view vehicles."
    );
  }

  if (!response.ok) {
    throw new Error(
      "Unable to load vehicles. Please try again."
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "The server returned an unexpected response."
    );
  }

  return data;
}

// ========================================
// POST: Add a new van (Admin)
// ========================================

export async function addVan(vanData) {
  // Get the CSRF token before changing data
  const csrfResponse = await fetch(
    "/api/security/csrf-token",
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!csrfResponse.ok) {
    throw new Error(
      "Unable to get security token. Please try again."
    );
  }

  const csrfData = await csrfResponse.json();

  if (!csrfData.csrfToken) {
    throw new Error("Security token is missing.");
  }

  // Send van information to ASP.NET Core
  const response = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrfData.csrfToken,
    },
    body: JSON.stringify({
      registration: vanData.registration.trim(),
      makeModel: vanData.makeModel.trim(),
      capacity: Number(vanData.capacity),
    }),
  });

  if (response.status === 401) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Only administrators can add vehicles."
    );
  }

  if (response.status === 409) {
    throw new Error(
      "This registration already exists. Please use another registration."
    );
  }

  if (response.status === 400) {
    throw new Error(
      "Invalid vehicle details. Please check all fields."
    );
  }

  if (!response.ok) {
    throw new Error(
      "Unable to add this vehicle. Please try again."
    );
  }

  return await response.json();
}
