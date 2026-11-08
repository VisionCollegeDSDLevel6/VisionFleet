
const API_URL = "/api/maintenance-records";
const PLANNING_URL = "/api/maintenance-planning";

// ========================================
// Read API error messages
// ========================================

async function checkResponse(response) {
  if (response.ok) {
    return;
  }

  if (response.status === 401) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Only administrators can manage maintenance."
    );
  }

  let message = `Request failed (HTTP ${response.status}).`;

  try {
    const text = await response.text();

    if (text) {
      try {
        const data = JSON.parse(text);

        if (typeof data === "string") {
          message = data;
        } else if (data.message) {
          message = data.message;
        } else if (data.detail) {
          message = data.detail;
        } else if (data.title) {
          message = data.title;
        }
      } catch {
        if (!text.trim().startsWith("<")) {
          message = text;
        }
      }
    }
  } catch {
    // Keep the fallback message.
  }

  throw new Error(message);
}

// ========================================
// Get CSRF token
// ========================================

async function getCsrfToken() {
  const response = await fetch(
    "/api/security/csrf-token",
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

  await checkResponse(response);

  const data = await response.json();

  if (!data.csrfToken) {
    throw new Error("Security token is missing.");
  }

  return data.csrfToken;
}

// ========================================
// Send protected requests
// ========================================

async function sendProtectedRequest(
  url,
  method,
  body = null
) {
  const csrfToken = await getCsrfToken();

  const options = {
    method,
    credentials: "include",
    headers: {
      "X-CSRF-TOKEN": csrfToken,
    },
  };

  if (body !== null) {
    options.headers["Content-Type"] =
      "application/json";

    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  await checkResponse(response);

  return response.json();
}

// ========================================
// GET: Maintenance records
// ========================================

export async function getMaintenanceRecords(signal) {
  const response = await fetch(API_URL, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });

  await checkResponse(response);

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Unexpected maintenance data received."
    );
  }

  return data;
}

// ========================================
// GET: Preview maintenance plan
// ========================================

export async function previewMaintenance({
  vanId,
  startDate,
  endDate,
}) {
  const params = new URLSearchParams({
    vanId: String(vanId),
    startDate,
    endDate,
  });

  const response = await fetch(
    `${PLANNING_URL}/preview?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

  await checkResponse(response);

  const data = await response.json();

  if (!data.plan || !Array.isArray(data.plan.bookings)) {
    throw new Error(
      "The server returned an invalid maintenance plan."
    );
  }

  return data;
}

// ========================================
// POST: Apply maintenance plan
// ========================================

export async function applyMaintenancePlan({
  vanId,
  startDate,
  endDate,
  description,
  cancellationBookingIds = [],
}) {
  return sendProtectedRequest(
    `${PLANNING_URL}/apply`,
    "POST",
    {
      vanId: Number(vanId),
      startDate,
      endDate,
      description: description.trim(),
      cancellationBookingIds,
    }
  );
}

// ========================================
// PUT: Start maintenance
// ========================================

export async function startMaintenance(maintenanceId) {
  return sendProtectedRequest(
    `${API_URL}/${maintenanceId}/start`,
    "PUT"
  );
}

// ========================================
// PUT: Finish maintenance
// ========================================

export async function finishMaintenance(maintenanceId) {
  return sendProtectedRequest(
    `${API_URL}/${maintenanceId}/finish`,
    "PUT"
  );
}
