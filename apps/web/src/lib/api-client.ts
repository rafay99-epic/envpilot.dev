/**
 * Typed API client for REST endpoint calls.
 *
 * Replaces ad-hoc `fetch` + `response.json()` + error-checking patterns
 * scattered across components. Used by TanStack Query hooks.
 *
 * Error reporting strategy:
 * - Network errors (offline, DNS, timeout) → captured here (server never sees these)
 * - JSON parse errors (proxy/CDN returning HTML) → captured here
 * - HTTP 4xx/5xx → breadcrumb/warning context here; server-side handlers own primary reporting
 */
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/api-client");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (networkError) {
    // Network-level failure: offline, DNS, CORS, timeout
    // Server never sees these, so we must report them
    log.error(
      "request_network_failed",
      { url, method: options.method ?? "GET" },
      networkError
    );
    throw new ApiError("Network error — please check your connection", 0);
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    // Non-JSON response (e.g., HTML error page from proxy/CDN)
    const error =
      parseError instanceof Error
        ? parseError
        : new Error(`Non-JSON response from ${options.method ?? "GET"} ${url}`);
    log.error(
      "request_parse_failed",
      { url, method: options.method ?? "GET", status: response.status },
      error
    );
    throw new ApiError(
      `Request failed with status ${response.status}`,
      response.status
    );
  }

  if (!response.ok) {
    // HTTP errors — server-side handleApiError already reports 500s to Sentry.
    // We only add a breadcrumb here for client-side debugging context.
    const level = response.status >= 500 ? "error" : "warn";
    log[level]("request_http_failed", {
      url,
      method: options.method ?? "GET",
      status: response.status,
      code: data?.code,
      error: data?.error,
    });
    throw new ApiError(
      data?.error || `Request failed with status ${response.status}`,
      response.status,
      data?.code
    );
  }

  return data as T;
}

export const api = {
  get<T>(url: string): Promise<T> {
    return request<T>(url);
  },

  post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  del<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    });
  },
};
