export const PASSWORD_OBVIOUS_ERROR =
  "Please choose a less obvious password. Avoid using your name, email, company name, TruckFixr, Mr Diesel, or common passwords.";

export type TruckFixrPasswordValidationInput = {
  password: string;
  confirmPassword?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
};

export type TruckFixrPasswordValidationResult = {
  isValid: boolean;
  checks: {
    minLength: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
    passwordsMatch: boolean;
    notCommon: boolean;
    notProfileDerived: boolean;
  };
  errors: string[];
};

const blockedPasswords = new Set(
  [
    "password",
    "password123",
    "12345678",
    "123456789",
    "qwerty123",
    "admin123",
    "welcome123",
    "letmein123",
    "truckfixr",
    "truckfixr123",
    "truckfixr123!",
    "mrdiesel",
    "mrdiesel123",
    "mrdiesel123!",
    "aaaaaaaa",
    "11111111",
    "abcdefgh",
    "abcd1234",
    "1234abcd",
  ].map(normalizeComparable)
);

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function normalizeProfileToken(value?: string | null) {
  return normalizeComparable(String(value ?? "")).replace(/[^a-z0-9]/g, "");
}

function getNameParts(value?: string | null) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
}

function hasRepeatedPattern(value: string) {
  return value.length >= 8 && /^(.)(\1)+$/.test(value);
}

function hasSimpleSequence(value: string) {
  const normalized = normalizeProfileToken(value);
  const sequences = [
    "abcdefghijklmnopqrstuvwxyz",
    "zyxwvutsrqponmlkjihgfedcba",
    "0123456789",
    "9876543210",
  ];

  return sequences.some((sequence) => {
    for (let length = 8; length <= Math.min(normalized.length, sequence.length); length += 1) {
      for (let start = 0; start <= sequence.length - length; start += 1) {
        if (normalized.includes(sequence.slice(start, start + length))) return true;
      }
    }
    return false;
  });
}

function isCommonOrObvious(password: string) {
  const normalized = normalizeComparable(password);
  const alphaNumeric = normalized.replace(/[^a-z0-9]/g, "");
  return (
    blockedPasswords.has(normalized) ||
    blockedPasswords.has(alphaNumeric) ||
    hasRepeatedPattern(normalized) ||
    hasSimpleSequence(normalized)
  );
}

function isProfileDerived(input: TruckFixrPasswordValidationInput) {
  const normalizedPassword = normalizeProfileToken(input.password);
  if (!normalizedPassword) return false;

  const emailUsername = String(input.email ?? "").split("@")[0] ?? "";
  const nameParts = [
    ...getNameParts(input.firstName),
    ...getNameParts(input.lastName),
    ...getNameParts(input.companyName),
  ];
  const tokens = [emailUsername, input.firstName, input.lastName, input.companyName, ...nameParts]
    .map(normalizeProfileToken)
    .filter((token) => token.length >= 3);

  const phoneDigits = String(input.phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length >= 4) {
    tokens.push(phoneDigits);
  }

  return tokens.some((token) => normalizedPassword.includes(token));
}

export function splitFullName(fullName?: string | null) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

export function validateTruckFixrPassword(
  input: TruckFixrPasswordValidationInput
): TruckFixrPasswordValidationResult {
  const password = input.password ?? "";
  const checks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    passwordsMatch:
      typeof input.confirmPassword === "undefined" || password === input.confirmPassword,
    notCommon: !isCommonOrObvious(password),
    notProfileDerived: !isProfileDerived(input),
  };

  const errors: string[] = [];
  if (!checks.minLength) errors.push("Password must be at least 8 characters.");
  if (!checks.uppercase) errors.push("Password must contain at least one uppercase letter.");
  if (!checks.lowercase) errors.push("Password must contain at least one lowercase letter.");
  if (!checks.number) errors.push("Password must contain at least one number.");
  if (!checks.special) errors.push("Password must contain at least one special character.");
  if (!checks.passwordsMatch) errors.push("Passwords do not match.");
  if (!checks.notCommon || !checks.notProfileDerived) errors.push(PASSWORD_OBVIOUS_ERROR);

  return {
    isValid: Object.values(checks).every(Boolean),
    checks,
    errors,
  };
}
