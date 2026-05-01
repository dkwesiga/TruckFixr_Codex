import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, passwordResetTokens } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createLocalEmailUser,
  hashPassword,
  shouldUseLocalUsers,
  verifyLocalCredentials,
  verifyPassword,
} from "../_core/localUsers";
import {
  hasSupabaseEmailAuth,
  signInWithSupabaseEmail,
  signUpWithSupabaseEmail,
} from "../_core/supabaseEmailAuth";
import { sendPasswordResetEmail } from "../services/email";
import { ENV } from "../_core/env";
import { nanoid } from "nanoid";
import {
  assertNotInLoginCooldown,
  assertTruckFixrPassword,
  clearFailedLogin,
  GENERIC_LOGIN_ERROR,
  GENERIC_RESET_SUCCESS,
  LOGIN_COOLDOWN_ERROR,
  recordFailedLogin,
} from "../_core/authSecurity";

export const emailAuthRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        password: z.string().min(1, "Password is required"),
        name: z.string().min(2, "Name must be at least 2 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();
      assertTruckFixrPassword({
        password: input.password,
        email: normalizedEmail,
        name: input.name,
      });

      if (hasSupabaseEmailAuth()) {
        const supabaseSignup = await signUpWithSupabaseEmail({
          email: normalizedEmail,
          password: input.password,
          name: input.name,
        });

        if (supabaseSignup?.conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        }

        if (supabaseSignup) {
          const existingUser = db
            ? (
                await db
                  .select()
                  .from(users)
                  .where(eq(users.email, normalizedEmail))
                  .limit(1)
              )[0]
            : undefined;
          const openId = existingUser?.openId ?? `supabase_${supabaseSignup.id}`;
          const role = existingUser?.role ?? "driver";
          const userName = existingUser?.name ?? supabaseSignup.name ?? input.name;

          return {
            success: true,
            message: "Account created successfully",
            user: {
              id: existingUser?.id ?? 0,
              email: normalizedEmail,
              name: userName,
              role,
              openId,
            },
          };
        }
      }

      const passwordHash = await hashPassword(input.password);

      if (shouldUseLocalUsers(db)) {
        const user = await createLocalEmailUser({
          email: normalizedEmail,
          name: input.name,
          passwordHash,
        });

        if (!user) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        }

        return {
          success: true,
          message: "Account created successfully",
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            openId: user.openId,
          },
        };
      }

      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const existingUser = (
        await db
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1)
      )[0];

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      const [newUser] = await db
        .insert(users)
        .values({
          openId: `local_${nanoid(16)}`,
          email: normalizedEmail,
          name: input.name,
          passwordHash,
          loginMethod: "email",
          emailVerified: true,
          role: "driver",
        })
        .returning();

      return {
        success: true,
        message: "Account created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          openId: newUser.openId,
        },
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ input }) => {

      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();
      try {
        assertNotInLoginCooldown(normalizedEmail);
      } catch {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: LOGIN_COOLDOWN_ERROR });
      }

      if (shouldUseLocalUsers(db)) {
        const user = await verifyLocalCredentials(normalizedEmail, input.password);

        if (!user) {
          recordFailedLogin(normalizedEmail);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: GENERIC_LOGIN_ERROR,
          });
        }
        clearFailedLogin(normalizedEmail);

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            openId: user.openId,
          },
        };
      }

      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const user = userRecord[0];

      if (user?.passwordHash && (await verifyPassword(input.password, user.passwordHash))) {
        clearFailedLogin(normalizedEmail);
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, user.id));

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            openId: user.openId,
          },
        };
      }

      const supabaseUser = hasSupabaseEmailAuth()
        ? await signInWithSupabaseEmail({
            email: normalizedEmail,
            password: input.password,
          })
        : null;

      if (!supabaseUser) {
        recordFailedLogin(normalizedEmail);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: GENERIC_LOGIN_ERROR,
        });
      }
      clearFailedLogin(normalizedEmail);

      return {
        success: true,
        user: {
          id: user?.id ?? 0,
          email: user?.email ?? supabaseUser.email,
          name: user?.name ?? supabaseUser.name,
          role: user?.role ?? "driver",
          openId: user?.openId ?? `supabase_${supabaseUser.id}`,
        },
      };
    }),

  signin: publicProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();
      try {
        assertNotInLoginCooldown(normalizedEmail);
      } catch {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: LOGIN_COOLDOWN_ERROR });
      }

      if (shouldUseLocalUsers(db)) {
        const user = await verifyLocalCredentials(normalizedEmail, input.password);

        if (!user) {
          recordFailedLogin(normalizedEmail);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: GENERIC_LOGIN_ERROR,
          });
        }
        clearFailedLogin(normalizedEmail);

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            openId: user.openId,
          },
        };
      }

      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const user = userRecord[0];

      if (user?.passwordHash && (await verifyPassword(input.password, user.passwordHash))) {
        clearFailedLogin(normalizedEmail);
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, user.id));

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            openId: user.openId,
          },
        };
      }

      const supabaseUser = hasSupabaseEmailAuth()
        ? await signInWithSupabaseEmail({
            email: normalizedEmail,
            password: input.password,
          })
        : null;

      if (!supabaseUser) {
        recordFailedLogin(normalizedEmail);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: GENERIC_LOGIN_ERROR,
        });
      }
      clearFailedLogin(normalizedEmail);

      return {
        success: true,
        user: {
          id: user?.id ?? 0,
          email: user?.email ?? supabaseUser.email,
          name: user?.name ?? supabaseUser.name,
          role: user?.role ?? "driver",
          openId: user?.openId ?? `supabase_${supabaseUser.id}`,
        },
      };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email("Please enter a valid email address") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();

      let userId: number | null = null;

      if (db) {
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);
        userId = user?.id ?? null;
      }

      if (userId) {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        if (db) {
          await db.insert(passwordResetTokens).values({
            userId,
            token,
            expiresAt,
          });
        }

        const resetUrl = `${ENV.appBaseUrl}/reset-password?token=${token}`;
        await sendPasswordResetEmail(normalizedEmail, resetUrl);
      }

      return {
        success: true,
        message: GENERIC_RESET_SUCCESS,
      };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "Reset token is required"),
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [resetRecord] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, input.token),
            isNull(passwordResetTokens.usedAt)
          )
        )
        .limit(1);

      if (!resetRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired reset token",
        });
      }

      if (new Date() > resetRecord.expiresAt) {
        throw new TRPCError({
          code: "TIMEOUT",
          message: "Reset token has expired",
        });
      }

      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, resetRecord.userId))
        .limit(1);
      assertTruckFixrPassword({
        password: input.password,
        email: user?.email,
        name: user?.name,
      });

      const passwordHash = await hashPassword(input.password);
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, resetRecord.userId));

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetRecord.id));

      return { success: true, message: "Password has been reset successfully" };
    }),
});
