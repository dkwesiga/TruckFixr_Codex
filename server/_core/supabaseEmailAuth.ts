import { ENV } from "./env";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type SupabaseAuthResponse = {
  user?: SupabaseAuthUser | null;
  error?: {
    message?: string;
    status?: number;
  } | null;
  error_description?: string;
};

function getAuthBaseUrl() {
  return ENV.supabaseUrl.replace(/\/$/, "");
}

export function hasSupabaseEmailAuth() {
  return Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
}

function getPreferredName(user: SupabaseAuthUser, fallbackEmail: string) {
  const metadata = user.user_metadata ?? {};
  const candidate =
    metadata.full_name ??
    metadata.name ??
    metadata.display_name ??
    fallbackEmail.split("@")[0];

  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : fallbackEmail.split("@")[0];
}

async function requestSupabaseAuth(
  path: string,
  init: RequestInit
): Promise<SupabaseAuthResponse> {
  if (!hasSupabaseEmailAuth()) {
    return {
      error: {
        message: "Supabase email auth is not configured",
        status: 500,
      },
    };
  }

  const response = await fetch(`${getAuthBaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: ENV.supabaseAnonKey,
      Authorization: `Bearer ${ENV.supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as SupabaseAuthResponse | null;
  if (response.ok) {
    return payload ?? {};
  }

  return {
    error: {
      message: payload?.error?.message ?? payload?.error_description ?? "Supabase auth failed",
      status: response.status,
    },
  };
}

export async function signInWithSupabaseEmail(input: {
  email: string;
  password: string;
}) {
  const payload = await requestSupabaseAuth("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    }),
  });

  const user = payload.user;
  if (!user?.id) {
    return null;
  }

  return {
    id: user.id,
    email: (user.email ?? input.email).trim().toLowerCase(),
    name: getPreferredName(user, input.email),
  };
}

export async function signUpWithSupabaseEmail(input: {
  email: string;
  password: string;
  name: string;
}) {
  const payload = await requestSupabaseAuth("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      data: {
        name: input.name.trim(),
        full_name: input.name.trim(),
      },
    }),
  });

  const user = payload.user;
  if (!user?.id) {
    const message = payload.error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return { conflict: true as const };
    }

    return null;
  }

  return {
    conflict: false as const,
    id: user.id,
    email: (user.email ?? input.email).trim().toLowerCase(),
    name: getPreferredName(user, input.email) || input.name.trim(),
  };
}
