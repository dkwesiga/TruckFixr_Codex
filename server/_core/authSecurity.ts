import { PASSWORD_OBVIOUS_ERROR, splitFullName, validateTruckFixrPassword } from "../../shared/passwordPolicy";

export const GENERIC_LOGIN_ERROR = "Invalid email or password. Please try again or reset your password.";
export const GENERIC_RESET_SUCCESS = "If an account exists for this email, a password reset link has been sent.";
export const LOGIN_COOLDOWN_ERROR =
  "Too many failed login attempts. Please try again in 15 minutes or reset your password.";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 15 * 60 * 1000;

type FailedLoginState = {
  count: number;
  lockedUntil?: number;
};

const failedLoginAttempts = new Map<string, FailedLoginState>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertNotInLoginCooldown(email: string) {
  const key = normalizeEmail(email);
  const state = failedLoginAttempts.get(key);
  if (!state?.lockedUntil) return;

  if (state.lockedUntil <= Date.now()) {
    failedLoginAttempts.delete(key);
    return;
  }

  throw new Error(LOGIN_COOLDOWN_ERROR);
}

export function recordFailedLogin(email: string) {
  const key = normalizeEmail(email);
  const current = failedLoginAttempts.get(key);
  const nextCount = (current?.count ?? 0) + 1;
  failedLoginAttempts.set(key, {
    count: nextCount,
    lockedUntil: nextCount >= MAX_FAILED_LOGIN_ATTEMPTS ? Date.now() + LOGIN_COOLDOWN_MS : current?.lockedUntil,
  });
}

export function clearFailedLogin(email: string) {
  failedLoginAttempts.delete(normalizeEmail(email));
}

export function assertTruckFixrPassword(input: {
  password: string;
  confirmPassword?: string;
  email?: string | null;
  name?: string | null;
  companyName?: string | null;
  phone?: string | null;
}) {
  const nameParts = splitFullName(input.name);
  const validation = validateTruckFixrPassword({
    password: input.password,
    confirmPassword: input.confirmPassword,
    email: input.email,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    companyName: input.companyName,
    phone: input.phone,
  });

  if (validation.isValid) return;

  if (!validation.checks.notCommon || !validation.checks.notProfileDerived) {
    throw new Error(PASSWORD_OBVIOUS_ERROR);
  }

  throw new Error(validation.errors[0] ?? "Password does not meet TruckFixr security requirements.");
}
