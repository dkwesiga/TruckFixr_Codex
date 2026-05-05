import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  createLocalEmailUser,
  hashPassword,
  shouldUseLocalUsers,
  verifyPassword,
  verifyLocalCredentials,
} from "./localUsers";
import {
  hasSupabaseEmailAuth,
  sendPasswordResetWithSupabaseEmail,
  signInWithSupabaseEmail,
  signUpWithSupabaseEmail,
  resendSupabaseVerificationEmail,
  updateSupabasePasswordWithAccessToken,
} from "./supabaseEmailAuth";
import { ENV } from "./env";
import { sdk } from "./sdk";
import {
  assertNotInLoginCooldown,
  assertTruckFixrPassword,
  clearFailedLogin,
  GENERIC_LOGIN_ERROR,
  GENERIC_RESET_SUCCESS,
  LOGIN_COOLDOWN_ERROR,
  recordFailedLogin,
} from "./authSecurity";
import {
  acceptInvitationByToken,
  createPendingTrialFleet,
  markPendingAccessVerified,
} from "../services/access";
import { redeemPilotAccessCode } from "../services/pilotAccess";

function getSessionDurationMs(role?: string | null) {
  if (role === "owner" || role === "manager") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function sendGenericLoginFailure(res: Response, email: string) {
  recordFailedLogin(email);
  res.status(401).json({ error: GENERIC_LOGIN_ERROR });
}

export function registerEmailAuthRoutes(app: Express) {
  const adoptInvitedDriverAccount = async (input: {
    email: string;
    openId: string;
    name: string;
    loginMethod: string;
    passwordHash?: string;
  }) => {
    const userDb = await db.getDb();
    if (!userDb) return null;

    const { users } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const existingUser = await userDb
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    const invitedUser = existingUser[0];
    if (!invitedUser || !String(invitedUser.openId ?? "").startsWith("invite_")) {
      return null;
    }

    await userDb
      .update(users)
      .set({
        openId: input.openId,
        name: input.name,
        loginMethod: input.loginMethod,
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
      .where(eq(users.id, invitedUser.id));

    const refreshedUser = await userDb
      .select()
      .from(users)
      .where(eq(users.id, invitedUser.id))
      .limit(1);

    return refreshedUser[0] ?? null;
  };

  /**
   * Email signin endpoint that creates a session cookie
   * POST /api/email/signin
   * Body: { email, password }
   */
  app.post("/api/email/signin", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = String(email ?? "").trim().toLowerCase();

      if (!normalizedEmail || !password) {
        res.status(400).json({ error: "email and password are required" });
        return;
      }

      try {
        assertNotInLoginCooldown(normalizedEmail);
      } catch {
        res.status(429).json({ error: LOGIN_COOLDOWN_ERROR });
        return;
      }

      // Find user by email
      const userDb = await db.getDb();
      if (shouldUseLocalUsers(userDb)) {
        const user = await verifyLocalCredentials(normalizedEmail, password);
        if (!user) {
          const supabaseUser = hasSupabaseEmailAuth()
            ? await signInWithSupabaseEmail({
                email: normalizedEmail,
                password,
              })
            : null;

          if (!supabaseUser) {
            sendGenericLoginFailure(res, normalizedEmail);
            return;
          }

          const openId = `supabase_${supabaseUser.id}`;
          await db.upsertUser({
            openId,
            email: supabaseUser.email,
            name: supabaseUser.name,
            loginMethod: "email",
            role: "driver",
            emailVerified: true,
            lastSignedIn: new Date(),
            lastAuthAt: new Date(),
          });

          const sessionDurationMs = getSessionDurationMs("driver");
          const sessionToken = await sdk.createSessionToken(openId, {
            name: supabaseUser.name || "",
            expiresInMs: sessionDurationMs,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });
          clearFailedLogin(normalizedEmail);

          res.json({
            success: true,
            user: {
              id: 0,
              email: supabaseUser.email,
              name: supabaseUser.name,
              role: "driver",
            },
          });
          return;
        }

        if (!user.emailVerified) {
          res.status(403).json({ error: "Please verify your email before signing in.", requiresVerification: true });
          return;
        }

        const sessionDurationMs = getSessionDurationMs(user.role);
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: sessionDurationMs,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });
        clearFailedLogin(normalizedEmail);

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        });
        return;
      }

      if (!userDb) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const userRecord = await userDb
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      const user = userRecord[0];

      let sessionUser = user;

      if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        const supabaseUser = hasSupabaseEmailAuth()
          ? await signInWithSupabaseEmail({
              email: normalizedEmail,
              password,
            })
          : null;

        if (!supabaseUser) {
          sendGenericLoginFailure(res, normalizedEmail);
          return;
        }

        const openId = user?.openId ?? `supabase_${supabaseUser.id}`;
        await db.upsertUser({
          openId,
          email: user?.email ?? supabaseUser.email,
          name: user?.name ?? supabaseUser.name,
          loginMethod: "email",
          role: user?.role ?? "driver",
          emailVerified: true,
          lastSignedIn: new Date(),
          lastAuthAt: new Date(),
        });

        const refreshedUser = await userDb
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        sessionUser =
          refreshedUser[0] ?? {
            id: 0,
            email: supabaseUser.email,
            name: supabaseUser.name,
            role: user?.role ?? "driver",
            openId,
            passwordHash: null,
            loginMethod: "email",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          };
      }

      // Create session token using the SDK
      if (!sessionUser.emailVerified) {
        res.status(403).json({ error: "Please verify your email before signing in.", requiresVerification: true });
        return;
      }

      const sessionDurationMs = getSessionDurationMs(sessionUser.role);
      const sessionToken = await sdk.createSessionToken(sessionUser.openId, {
        name: sessionUser.name || "",
        expiresInMs: sessionDurationMs,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });
      clearFailedLogin(normalizedEmail);

      // Update lastSignedIn
      await userDb
        .update(users)
        .set({ lastSignedIn: new Date(), lastAuthAt: new Date() })
        .where(eq(users.id, sessionUser.id));

      res.json({
        success: true,
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name,
          role: sessionUser.role,
        },
      });
    } catch (error) {
      console.error("[Email Auth] Signin failed", error);
      res.status(500).json({ error: "Signin failed" });
    }
  });

  /**
   * Email signup endpoint that creates a session cookie
   * POST /api/email/signup
   * Body: { email, password, name }
   */
  app.post("/api/email/signup", async (req: Request, res: Response) => {
    try {
      const {
        email,
        password,
        name,
        accessMode,
        companyName,
        companyPhone,
        fleetSize,
        biggestMaintenanceChallenge,
        vehicleTypes,
        location,
        pilotCode,
        inviteToken,
      } = req.body ?? {};
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      const normalizedName = String(name ?? "").trim();
      const normalizedCompanyName = String(companyName ?? "").trim();
      const mode = String(accessMode ?? "").trim();
      const isTrialMode = mode === "trial";
      const isPilotMode = mode === "pilot";
      const isDriverInviteMode = mode === "driver_invite";
      const effectiveCompanyName = normalizedCompanyName || normalizedName;

      if (!normalizedEmail || !password || !normalizedName) {
        res.status(400).json({ error: "email, password, and name are required" });
        return;
      }

      if ((isTrialMode || isPilotMode) && !effectiveCompanyName) {
        res.status(400).json({ error: "companyName is required" });
        return;
      }

      try {
        assertTruckFixrPassword({ password, email: normalizedEmail, name: normalizedName, companyName: effectiveCompanyName });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Password rejected" });
        return;
      }

      const userDb = await db.getDb();
      if (hasSupabaseEmailAuth()) {
        const supabaseSignup = await signUpWithSupabaseEmail({
          email: normalizedEmail,
          password,
          name: normalizedName,
        });

        if (supabaseSignup?.conflict) {
          res.status(409).json({ error: "Email already registered" });
          return;
        }

        if (supabaseSignup) {
          const openId = `supabase_${supabaseSignup.id}`;
          const adoptedUser = await adoptInvitedDriverAccount({
            email: supabaseSignup.email,
            openId,
            name: supabaseSignup.name,
            loginMethod: "email",
            emailVerified: supabaseSignup.emailVerified,
          });

          if (!adoptedUser) {
            await db.upsertUser({
              openId,
              email: supabaseSignup.email,
              name: supabaseSignup.name,
              loginMethod: "email",
              role: isTrialMode || isPilotMode ? "owner" : "driver",
              emailVerified: supabaseSignup.emailVerified,
              lastSignedIn: new Date(),
            });
          }

          const activeUserDb = await db.getDb();
          const { users } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const [activeUser] =
            activeUserDb
              ? await activeUserDb.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
              : [];

          if (activeUser && isTrialMode) {
            await createPendingTrialFleet({
              userId: activeUser.id,
              companyName: effectiveCompanyName,
              companyEmail: normalizedEmail,
              companyPhone: String(companyPhone ?? "").trim() || null,
              location: String(location ?? "").trim() || null,
              fleetSize: String(fleetSize ?? "").trim() || null,
              biggestMaintenanceChallenge: String(biggestMaintenanceChallenge ?? "").trim() || null,
              vehicleTypes: String(vehicleTypes ?? "").trim() || null,
            });
          }

          if (activeUser && isPilotMode && pilotCode) {
            await redeemPilotAccessCode({
              userId: activeUser.id,
              currentTier: "free",
              code: String(pilotCode),
              companyName: effectiveCompanyName,
            });

            if (!supabaseSignup.emailVerified) {
              const accessDb = await db.getDb();
              const { fleets } = await import("../../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              await accessDb
                ?.update(fleets)
                .set({ salesStatus: "pilot_pending_email_verification", updatedAt: new Date() })
                .where(eq(fleets.ownerId, activeUser.id));
            }
          }

          if (activeUser && inviteToken) {
            await acceptInvitationByToken({
              token: String(inviteToken),
              userId: activeUser.id,
              email: normalizedEmail,
            }).catch(() => null);
          }

          if (!supabaseSignup.emailVerified) {
            res.json({
              success: true,
              requiresVerification: true,
              message: isPilotMode
                ? "Please verify your email to unlock full pilot access."
                : isTrialMode
                  ? "Please verify your email to activate your trial."
                  : "Check your email to verify your account before signing in.",
            });
            return;
          }

          if (activeUser) {
            await markPendingAccessVerified({ userId: activeUser.id, emailVerified: true }).catch(() => null);
          }

          const sessionDurationMs = getSessionDurationMs(isTrialMode || isPilotMode ? "owner" : "driver");
          const sessionToken = await sdk.createSessionToken(openId, {
            name: supabaseSignup.name,
            expiresInMs: sessionDurationMs,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });

          res.json({
            success: true,
            user: {
              email: supabaseSignup.email,
              name: supabaseSignup.name,
              role: isTrialMode || isPilotMode ? "owner" : "driver",
            },
          });
          return;
        }
      }

      if (shouldUseLocalUsers(userDb)) {
        const passwordHash = await hashPassword(password);
        const adoptedUser = await adoptInvitedDriverAccount({
          email: normalizedEmail,
          openId: `email_${normalizedEmail}`,
          name: normalizedName,
          loginMethod: "email",
          passwordHash,
        });
        const user =
          adoptedUser ??
          (await createLocalEmailUser({
            email: normalizedEmail,
            name: normalizedName,
            passwordHash,
          }));

        if (!user) {
          res.status(409).json({ error: "Email already registered" });
          return;
        }

        if (isTrialMode) {
          await createPendingTrialFleet({
            userId: user.id,
            companyName: effectiveCompanyName,
            companyEmail: normalizedEmail,
            companyPhone: String(companyPhone ?? "").trim() || null,
            location: String(location ?? "").trim() || null,
            fleetSize: String(fleetSize ?? "").trim() || null,
            biggestMaintenanceChallenge: String(biggestMaintenanceChallenge ?? "").trim() || null,
            vehicleTypes: String(vehicleTypes ?? "").trim() || null,
          });
        }

        if (isPilotMode && pilotCode) {
          await redeemPilotAccessCode({
            userId: user.id,
            currentTier: "free",
            code: String(pilotCode),
            companyName: effectiveCompanyName,
          });
        }

        if (inviteToken) {
          await acceptInvitationByToken({
            token: String(inviteToken),
            userId: user.id,
            email: normalizedEmail,
          }).catch(() => null);
        }

        await markPendingAccessVerified({ userId: user.id, emailVerified: true }).catch(() => null);

        const sessionDurationMs = getSessionDurationMs(isTrialMode || isPilotMode ? "owner" : user.role);
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: sessionDurationMs,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: isTrialMode || isPilotMode ? "owner" : user.role,
          },
        });
        return;
      }

      if (!userDb) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Check if user already exists
      const existingUser = await userDb
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingUser.length > 0 && !String(existingUser[0].openId ?? "").startsWith("invite_")) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user with email-based openId
      const openId = `email_${normalizedEmail}`;
      if (existingUser.length > 0) {
        await userDb
          .update(users)
          .set({
            email: normalizedEmail,
            name: normalizedName,
            passwordHash,
            loginMethod: "email",
            openId,
            emailVerified: true,
            updatedAt: new Date(),
            lastSignedIn: new Date(),
            lastAuthAt: new Date(),
          })
          .where(eq(users.id, existingUser[0].id));
      } else {
        await userDb.insert(users).values({
          email: normalizedEmail,
          name: normalizedName,
          passwordHash,
          loginMethod: "email",
          role: isTrialMode || isPilotMode ? "owner" : "driver",
          openId,
          emailVerified: true,
        });
      }

      const activeUserDb = await db.getDb();
      const { users: userTable } = await import("../../drizzle/schema");
      const { eq: equals } = await import("drizzle-orm");
      const [currentUser] =
        activeUserDb ? await activeUserDb.select().from(userTable).where(equals(userTable.email, normalizedEmail)).limit(1) : [];

      if (currentUser && isTrialMode) {
        await createPendingTrialFleet({
          userId: currentUser.id,
          companyName: effectiveCompanyName,
          companyEmail: normalizedEmail,
          companyPhone: String(companyPhone ?? "").trim() || null,
          location: String(location ?? "").trim() || null,
          fleetSize: String(fleetSize ?? "").trim() || null,
          biggestMaintenanceChallenge: String(biggestMaintenanceChallenge ?? "").trim() || null,
          vehicleTypes: String(vehicleTypes ?? "").trim() || null,
        });
      }

      if (currentUser && isPilotMode && pilotCode) {
        await redeemPilotAccessCode({
          userId: currentUser.id,
          currentTier: "free",
          code: String(pilotCode),
          companyName: effectiveCompanyName,
        });

        await markPendingAccessVerified({ userId: currentUser.id, emailVerified: true }).catch(() => null);
      }

      if (currentUser && inviteToken) {
        await acceptInvitationByToken({
          token: String(inviteToken),
          userId: currentUser.id,
          email: normalizedEmail,
        }).catch(() => null);
      }

      await markPendingAccessVerified({ userId: currentUser?.id ?? 0, emailVerified: true }).catch(() => null);

      // Create session token
      const sessionDurationMs = getSessionDurationMs(isTrialMode || isPilotMode ? "owner" : "driver");
      const sessionToken = await sdk.createSessionToken(openId, {
        name: normalizedName,
        expiresInMs: sessionDurationMs,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });

      res.json({
        success: true,
        user: {
          email: normalizedEmail,
          name: normalizedName,
          role: isTrialMode || isPilotMode ? "owner" : "driver",
        },
      });
    } catch (error) {
      console.error("[Email Auth] Signup failed", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/email/forgot-password", async (req: Request, res: Response) => {
    try {
      const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();

      if (!normalizedEmail) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      if (!hasSupabaseEmailAuth()) {
        res.json({
          success: true,
          message: GENERIC_RESET_SUCCESS,
        });
        return;
      }

      const success = await sendPasswordResetWithSupabaseEmail({
        email: normalizedEmail,
        redirectTo: `${ENV.appBaseUrl.replace(/\/$/, "")}/auth/email`,
      });

      if (!success) {
        console.warn("[Email Auth] Supabase password reset returned false");
      }

      res.json({
        success: true,
        message: GENERIC_RESET_SUCCESS,
      });
    } catch (error) {
      console.error("[Email Auth] Forgot password failed", error);
      res.status(500).json({ error: "Unable to process password reset request" });
    }
  });

  app.post("/api/email/resend-verification", async (req: Request, res: Response) => {
    try {
      const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();
      if (!normalizedEmail) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      if (hasSupabaseEmailAuth()) {
        await resendSupabaseVerificationEmail({ email: normalizedEmail }).catch((error) => {
          console.warn("[Email Auth] Verification resend failed:", error);
        });
      }

      res.json({
        success: true,
        message: "If verification is required for this email, a verification link has been sent.",
      });
    } catch (error) {
      console.error("[Email Auth] Resend verification failed", error);
      res.status(500).json({ error: "Unable to process verification request" });
    }
  });

  app.post("/api/email/reset-password", async (req: Request, res: Response) => {
    try {
      const accessToken = String(req.body?.accessToken ?? "").trim();
      const password = String(req.body?.password ?? "");

      if (!accessToken || !password) {
        res.status(400).json({ error: "accessToken and password are required" });
        return;
      }

      try {
        assertTruckFixrPassword({ password });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Password rejected" });
        return;
      }

      const result = await updateSupabasePasswordWithAccessToken({
        accessToken,
        password,
      });

      if (!result.success) {
        res.status(400).json({ error: result.error ?? "Unable to reset password" });
        return;
      }

      res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      console.error("[Email Auth] Reset password failed", error);
      res.status(500).json({ error: "Unable to reset password" });
    }
  });

  app.post("/api/email/change-password", async (req: Request, res: Response) => {
    try {
      const currentPassword = String(req.body?.currentPassword ?? "");
      const newPassword = String(req.body?.newPassword ?? "");
      const confirmPassword = String(req.body?.confirmPassword ?? "");

      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({ error: "Current password, new password, and confirmation are required" });
        return;
      }

      const authUser = await sdk.authenticateRequest(req);
      if (!authUser?.id || !authUser.email) {
        res.status(401).json({ error: "Sign in before changing your password." });
        return;
      }

      try {
        assertTruckFixrPassword({
          password: newPassword,
          confirmPassword,
          email: authUser.email,
          name: authUser.name,
        });
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Password rejected" });
        return;
      }

      if (currentPassword === newPassword) {
        res.status(400).json({ error: "Choose a new password that is different from your current password." });
        return;
      }

      const userDb = await db.getDb();
      if (!userDb) {
        res.status(503).json({ error: "Password changes are unavailable in this environment." });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await userDb
        .select()
        .from(users)
        .where(eq(users.id, authUser.id))
        .limit(1);

      if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
        res.status(400).json({ error: "Current password is incorrect." });
        return;
      }

      await userDb
        .update(users)
        .set({
          passwordHash: await hashPassword(newPassword),
          lastAuthAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      res.json({
        success: true,
        message: "Your password has been updated successfully.",
      });
    } catch (error) {
      console.error("[Email Auth] Change password failed", error);
      res.status(500).json({ error: "Unable to update password" });
    }
  });
}
