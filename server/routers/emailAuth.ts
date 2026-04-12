import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
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

export const emailAuthRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        password: z.string()
          .min(8, "Password must be at least 8 characters")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[0-9]/, "Password must contain at least one number"),
        name: z.string().min(2, "Name must be at least 2 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();

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

      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      // Create user
      await db.insert(users).values({
        email: normalizedEmail,
        name: input.name,
        passwordHash,
        loginMethod: "email",
        role: "driver",
        openId: `email_${normalizedEmail}`,
      });

      const createdUser = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const user = createdUser[0];

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
    }),

  signin: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const normalizedEmail = input.email.trim().toLowerCase();

      if (shouldUseLocalUsers(db)) {
        const user = await verifyLocalCredentials(normalizedEmail, input.password);
        if (!user) {
          const supabaseUser = hasSupabaseEmailAuth()
            ? await signInWithSupabaseEmail({
                email: normalizedEmail,
                password: input.password,
              })
            : null;

          if (!supabaseUser) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid credentials",
            });
          }

          return {
            success: true,
            user: {
              id: 0,
              email: supabaseUser.email,
              name: supabaseUser.name,
              role: "driver" as const,
              openId: `supabase_${supabaseUser.id}`,
            },
          };
        }

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

      // Find user by email
      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      const user = userRecord[0];

      if (user?.passwordHash && (await verifyPassword(input.password, user.passwordHash))) {
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
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

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
});
