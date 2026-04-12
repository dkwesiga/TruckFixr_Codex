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
  signInWithSupabaseEmail,
  signUpWithSupabaseEmail,
} from "./supabaseEmailAuth";
import { sdk } from "./sdk";

export function registerEmailAuthRoutes(app: Express) {
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
            res.status(401).json({ error: "Invalid email or password" });
            return;
          }

          const openId = `supabase_${supabaseUser.id}`;
          await db.upsertUser({
            openId,
            email: supabaseUser.email,
            name: supabaseUser.name,
            loginMethod: "email",
            role: "driver",
            lastSignedIn: new Date(),
          });

          const sessionToken = await sdk.createSessionToken(openId, {
            name: supabaseUser.name || "",
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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
          res.status(401).json({ error: "Invalid email or password" });
          return;
        }

        const openId = user?.openId ?? `supabase_${supabaseUser.id}`;
        await db.upsertUser({
          openId,
          email: user?.email ?? supabaseUser.email,
          name: user?.name ?? supabaseUser.name,
          loginMethod: "email",
          role: user?.role ?? "driver",
          lastSignedIn: new Date(),
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
      const sessionToken = await sdk.createSessionToken(sessionUser.openId, {
        name: sessionUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update lastSignedIn
      await userDb
        .update(users)
        .set({ lastSignedIn: new Date() })
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
      const { email, password, name } = req.body;
      const normalizedEmail = String(email ?? "").trim().toLowerCase();

      if (!normalizedEmail || !password || !name) {
        res.status(400).json({ error: "email, password, and name are required" });
        return;
      }

      const userDb = await db.getDb();
      if (hasSupabaseEmailAuth()) {
        const supabaseSignup = await signUpWithSupabaseEmail({
          email: normalizedEmail,
          password,
          name,
        });

        if (supabaseSignup?.conflict) {
          res.status(409).json({ error: "Email already registered" });
          return;
        }

        if (supabaseSignup) {
          const openId = `supabase_${supabaseSignup.id}`;
          await db.upsertUser({
            openId,
            email: supabaseSignup.email,
            name: supabaseSignup.name,
            loginMethod: "email",
            role: "driver",
            lastSignedIn: new Date(),
          });

          const sessionToken = await sdk.createSessionToken(openId, {
            name: supabaseSignup.name,
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

          res.json({
            success: true,
            user: {
              email: supabaseSignup.email,
              name: supabaseSignup.name,
              role: "driver",
            },
          });
          return;
        }
      }

      if (shouldUseLocalUsers(userDb)) {
        const passwordHash = await hashPassword(password);
        const user = await createLocalEmailUser({
          email: normalizedEmail,
          name,
          passwordHash,
        });

        if (!user) {
          res.status(409).json({ error: "Email already registered" });
          return;
        }

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

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

      // Check if user already exists
      const existingUser = await userDb
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingUser.length > 0) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user with email-based openId
      const openId = `email_${normalizedEmail}`;
      const result = await userDb.insert(users).values({
        email: normalizedEmail,
        name,
        passwordHash,
        loginMethod: "email",
        role: "driver",
        openId,
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          email: normalizedEmail,
          name,
          role: "driver",
        },
      });
    } catch (error) {
      console.error("[Email Auth] Signup failed", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });
}
