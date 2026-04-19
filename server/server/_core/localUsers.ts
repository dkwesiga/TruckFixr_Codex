import type { InsertUser, User } from "../../drizzle/schema";

type LocalUserRecord = User;

const DEFAULT_DEMO_EMAIL = "demo@truckfixr.com";
const DEFAULT_DEMO_PASSWORD = "Demo123!";
const DEFAULT_DEMO_NAME = "TruckFixr Demo Owner";

const usersByEmail = new Map<string, LocalUserRecord>();
const usersByOpenId = new Map<string, LocalUserRecord>();

let nextLocalUserId = 1;
let seedPromise: Promise<void> | null = null;

function now() {
  return new Date();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isLocalAuthEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function shouldUseLocalUsers(db: unknown) {
  return !db && isLocalAuthEnvironment();
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

function storeUser(user: LocalUserRecord) {
  if (user.email) {
    usersByEmail.set(normalizeEmail(user.email), user);
  }
  usersByOpenId.set(user.openId, user);
  nextLocalUserId = Math.max(nextLocalUserId, user.id + 1);
}

async function ensureSeededUsers() {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    if (usersByOpenId.size > 0) return;

    const createdAt = now();
    const demoEmail = normalizeEmail(process.env.DEMO_EMAIL ?? DEFAULT_DEMO_EMAIL);
    const demoUser: LocalUserRecord = {
      id: nextLocalUserId++,
      openId: `email_${demoEmail}`,
      name: process.env.DEMO_NAME ?? DEFAULT_DEMO_NAME,
      email: demoEmail,
      passwordHash: await hashPassword(process.env.DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD),
      loginMethod: "email",
      role: "owner",
      managerEmail: null,
      managerUserId: null,
      subscriptionTier: "fleet",
      billingStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt,
      updatedAt: createdAt,
      lastSignedIn: createdAt,
    };

    storeUser(demoUser);
  })();

  await seedPromise;
}

export async function findLocalUserByEmail(email: string) {
  await ensureSeededUsers();
  return usersByEmail.get(normalizeEmail(email));
}

export async function findLocalUserByOpenId(openId: string) {
  await ensureSeededUsers();
  return usersByOpenId.get(openId);
}

export async function createLocalEmailUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role?: User["role"];
}) {
  await ensureSeededUsers();

  const normalizedEmail = normalizeEmail(input.email);
  if (usersByEmail.has(normalizedEmail)) {
    return null;
  }

  const timestamp = now();
  const user: LocalUserRecord = {
    id: nextLocalUserId++,
    openId: `email_${normalizedEmail}`,
    name: input.name,
    email: normalizedEmail,
    passwordHash: input.passwordHash,
    loginMethod: "email",
    role: input.role ?? "driver",
    managerEmail: null,
    managerUserId: null,
    subscriptionTier: "free",
    billingStatus: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSignedIn: timestamp,
  };

  storeUser(user);
  return user;
}

export async function touchLocalUserSignin(openId: string) {
  const user = await findLocalUserByOpenId(openId);
  if (!user) return undefined;

  user.lastSignedIn = now();
  user.updatedAt = now();
  storeUser(user);
  return user;
}

export async function verifyLocalCredentials(email: string, password: string) {
  const user = await findLocalUserByEmail(email);
  if (!user?.passwordHash) return undefined;
  if (!(await verifyPassword(password, user.passwordHash))) return undefined;
  return touchLocalUserSignin(user.openId);
}

export async function upsertLocalUser(user: InsertUser) {
  await ensureSeededUsers();

  const existing =
    (user.openId ? usersByOpenId.get(user.openId) : undefined) ??
    (user.email ? usersByEmail.get(normalizeEmail(user.email)) : undefined);

  const timestamp = now();
  const nextUser: LocalUserRecord = {
    id: existing?.id ?? nextLocalUserId++,
    openId: user.openId ?? existing?.openId ?? `local_${nextLocalUserId}`,
    name: user.name ?? existing?.name ?? null,
    email: user.email ? normalizeEmail(user.email) : (existing?.email ?? null),
    passwordHash: user.passwordHash ?? existing?.passwordHash ?? null,
    loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
    role: user.role ?? existing?.role ?? "driver",
    managerEmail: user.managerEmail ? normalizeEmail(user.managerEmail) : (user.managerEmail === null ? null : (existing?.managerEmail ?? null)),
    managerUserId: user.managerUserId ?? (user.managerUserId === null ? null : (existing?.managerUserId ?? null)),
    subscriptionTier: user.subscriptionTier ?? existing?.subscriptionTier ?? "free",
    billingStatus: user.billingStatus ?? existing?.billingStatus ?? "active",
    stripeCustomerId: user.stripeCustomerId ?? existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: user.stripeSubscriptionId ?? existing?.stripeSubscriptionId ?? null,
    currentPeriodStart: user.currentPeriodStart ?? existing?.currentPeriodStart ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastSignedIn: user.lastSignedIn ?? existing?.lastSignedIn ?? timestamp,
  };

  storeUser(nextUser);
  return nextUser;
}
