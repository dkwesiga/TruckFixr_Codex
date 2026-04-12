import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { upsertUser, getUserByOpenId } from "../db";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";

export const authRouter = router({
  /**
   * Get current authenticated user
   */
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user || null;
  }),

  /**
   * Update the current user's profile details.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        role: z.enum(["owner", "manager", "driver"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await upsertUser({
          openId: ctx.user.openId,
          email: ctx.user.email ?? undefined,
          loginMethod: ctx.user.loginMethod ?? undefined,
          name: input.name,
          role: input.role,
          lastSignedIn: ctx.user.lastSignedIn,
        });

        const user = await getUserByOpenId(ctx.user.openId);
        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to load updated profile",
          });
        }

        return user;
      } catch (error) {
        console.error("Failed to update profile:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile",
        });
      }
    }),

  /**
   * Create or update user after OAuth callback
   */
  upsertMe: publicProcedure
    .input(
      z.object({
        openId: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        loginMethod: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await upsertUser({
          openId: input.openId,
          name: input.name,
          email: input.email,
          loginMethod: input.loginMethod,
          lastSignedIn: new Date(),
        });

        const user = await getUserByOpenId(input.openId);
        return user || null;
      } catch (error) {
        console.error("Failed to upsert user:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create or update user",
        });
      }
    }),

  /**
   * Get user by ID (for admin/manager operations)
   */
  getUserById: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Only owners and managers can view other users
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view this user",
        });
      }

      // TODO: Implement getUserById in db.ts
      return null;
    }),

  /**
   * Logout (clear session cookie)
   */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
