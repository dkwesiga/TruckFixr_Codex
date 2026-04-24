import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getUserByEmail, getUserByOpenId, upsertUser } from "../db";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sendEmail } from "../services/email";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import { assertUsersWithinPlan, getSubscriptionState } from "../services/subscriptions";
import { ENV } from "../_core/env";
import { getPilotAccessOverview } from "../services/pilotAccess";
import {
  canInviteCompanyRole,
  createCompanyInvitationRecord,
  ensureCompanyMembership,
} from "../services/companyAccess";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildDriverInviteLink(input: {
  email: string;
  managerEmail?: string | null;
  managerName?: string | null;
  pilotCode?: string | null;
  companyName?: string | null;
}) {
  const baseUrl = ENV.appBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("invite", "driver");
  params.set("email", input.email);

  if (input.managerEmail) {
    params.set("managerEmail", input.managerEmail);
  }

  if (input.managerName) {
    params.set("managerName", input.managerName);
  }

  if (input.pilotCode) {
    params.set("pilotCode", input.pilotCode);
  }

  if (input.companyName) {
    params.set("companyName", input.companyName);
  }

  return `${baseUrl}/signup?${params.toString()}`;
}

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
        managerEmail: z.string().trim().email("Enter a valid manager email").optional(),
      }).superRefine((value, context) => {
        if (value.role === "driver" && !value.managerEmail?.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["managerEmail"],
            message: "Manager email is required for driver profiles",
          });
        }
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const normalizedManagerEmail =
          input.role === "driver" ? normalizeEmail(input.managerEmail ?? "") : null;

        if (normalizedManagerEmail && ctx.user.email) {
          const normalizedDriverEmail = normalizeEmail(ctx.user.email);
          if (normalizedManagerEmail === normalizedDriverEmail) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Manager email must be different from the driver email.",
            });
          }
        }

        let managerUserId: number | null = null;
        let managerConnection:
          | {
              status: "linked" | "invited" | "invite_failed" | "invite_skipped";
              email: string;
              message: string;
            }
          | null = null;

        if (normalizedManagerEmail) {
          const existingManager = await getUserByEmail(normalizedManagerEmail);

          if (existingManager) {
            managerUserId = existingManager.id;
            managerConnection = {
              status: "linked",
              email: normalizedManagerEmail,
              message: `Connected your driver profile to ${normalizedManagerEmail}.`,
            };
          } else {
            try {
              const inviteDelivery = await sendEmail({
                to: [normalizedManagerEmail],
                subject: "You’ve been invited to TruckFixr",
                text: [
                  `${input.name} added you as their fleet manager in TruckFixr.`,
                  "",
                  "Create or sign in to your TruckFixr account to receive daily inspection reports and fleet updates.",
                  "Open TruckFixr at http://localhost:3000/auth/email",
                ].join("\n"),
                html: [
                  `<p><strong>${input.name}</strong> added you as their fleet manager in TruckFixr.</p>`,
                  "<p>Create or sign in to your TruckFixr account to receive daily inspection reports and fleet updates.</p>",
                  '<p><a href="http://localhost:3000/auth/email">Open TruckFixr</a></p>',
                ].join(""),
              });

              managerConnection = inviteDelivery.delivered
                ? {
                    status: "invited",
                    email: normalizedManagerEmail,
                    message: `We sent an invite to ${normalizedManagerEmail}. Your profile will link automatically once they join.`,
                  }
                : {
                    status: "invite_skipped",
                    email: normalizedManagerEmail,
                    message: `Manager email saved for ${normalizedManagerEmail}. Email delivery is not configured yet, so no invite was sent.`,
                  };
            } catch (error) {
              managerConnection = {
                status: "invite_failed",
                email: normalizedManagerEmail,
                message:
                  error instanceof Error
                    ? `Manager email saved for ${normalizedManagerEmail}, but the invite email failed: ${error.message}`
                    : `Manager email saved for ${normalizedManagerEmail}, but the invite email failed.`,
              };
            }
          }
        }

        await upsertUser({
          openId: ctx.user.openId,
          email: ctx.user.email ?? undefined,
          loginMethod: ctx.user.loginMethod ?? undefined,
          name: input.name,
          role: input.role,
          managerEmail: normalizedManagerEmail,
          managerUserId,
          lastSignedIn: ctx.user.lastSignedIn,
        });

        const user = await getUserByOpenId(ctx.user.openId);
        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to load updated profile",
          });
        }

        return {
          ...user,
          managerConnection,
        };
      } catch (error) {
        console.error("Failed to update profile:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
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

  listManagedDrivers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to view managed drivers",
      });
    }

    const db = await getDb();
    if (!db) {
      return [];
    }

    const managerEmail = ctx.user.email ? normalizeEmail(ctx.user.email) : null;
    const driverRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        or(
          eq(users.managerUserId, ctx.user.id),
          managerEmail ? eq(users.managerEmail, managerEmail) : eq(users.managerUserId, ctx.user.id)
        )
      );

    return driverRows
      .filter((row) => row.role === "driver")
      .sort((left, right) => (left.name || left.email || "").localeCompare(right.name || right.email || ""));
  }),

  createManagedDriverInvite: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Driver name must be at least 2 characters"),
        email: z.string().trim().email("Enter a valid driver email"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and managers can invite drivers",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const subscriptionState = await getSubscriptionState(ctx.user.id);
      const canInvite = await canInviteCompanyRole({
        fleetId: subscriptionState.activeFleetId,
        user: ctx.user,
        inviteRole: "driver",
      });
      if (!canInvite) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to invite drivers to this company",
        });
      }
      await assertUsersWithinPlan({
        userId: ctx.user.id,
        fleetId: subscriptionState.activeFleetId,
      });
      const pilotAccess = await getPilotAccessOverview(ctx.user.id);

      const normalizedDriverEmail = normalizeEmail(input.email);
      const normalizedManagerEmail = ctx.user.email ? normalizeEmail(ctx.user.email) : null;

      if (normalizedManagerEmail && normalizedDriverEmail === normalizedManagerEmail) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Driver email must be different from the manager email.",
        });
      }

      const existingUser = await getUserByEmail(normalizedDriverEmail);

      if (existingUser && (existingUser.role === "owner" || existingUser.role === "manager")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That email already belongs to a manager or owner account.",
        });
      }

      if (
        existingUser &&
        existingUser.role === "driver" &&
        existingUser.managerUserId &&
        existingUser.managerUserId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That driver is already linked to another manager.",
        });
      }

      if (
        existingUser &&
        existingUser.role === "driver" &&
        existingUser.managerEmail &&
        normalizedManagerEmail &&
        normalizeEmail(existingUser.managerEmail) !== normalizedManagerEmail &&
        !existingUser.managerUserId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That driver is already linked to another manager.",
        });
      }

      const now = new Date();

      if (existingUser) {
        await db
          .update(users)
          .set({
            name: input.name.trim(),
            role: "driver",
            managerEmail: normalizedManagerEmail,
            managerUserId: ctx.user.id,
            updatedAt: now,
          })
          .where(eq(users.id, existingUser.id));

        const [linkedDriver] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, existingUser.id))
          .limit(1);

        await ensureCompanyMembership({
          fleetId: subscriptionState.activeFleetId,
          userId: existingUser.id,
          role: "driver",
          approvedByUserId: ctx.user.id,
        });
        await createCompanyInvitationRecord({
          fleetId: subscriptionState.activeFleetId,
          email: normalizedDriverEmail,
          name: input.name.trim(),
          role: "driver",
          invitedByUserId: ctx.user.id,
        });

        return {
          driver: linkedDriver,
          invitation: {
            status: "linked" as const,
            message: `${input.name.trim()} is now linked to this manager and can be assigned immediately.`,
          },
        };
      }

      const placeholderOpenId = `invite_${normalizedDriverEmail}`;

      await db
        .insert(users)
        .values({
          openId: placeholderOpenId,
          email: normalizedDriverEmail,
          name: input.name.trim(),
          loginMethod: "invite",
          role: "driver",
          managerEmail: normalizedManagerEmail,
          managerUserId: ctx.user.id,
          lastSignedIn: now,
        });

      const [invitedDriver] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(eq(users.email, normalizedDriverEmail))
        .limit(1);

      if (invitedDriver?.id) {
        await ensureCompanyMembership({
          fleetId: subscriptionState.activeFleetId,
          userId: invitedDriver.id,
          role: "driver",
          approvedByUserId: ctx.user.id,
          status: "pending",
        });
      }
      await createCompanyInvitationRecord({
        fleetId: subscriptionState.activeFleetId,
        email: normalizedDriverEmail,
        name: input.name.trim(),
        role: "driver",
        invitedByUserId: ctx.user.id,
      });

      let invitationStatus: "invited" | "invite_skipped" | "invite_failed" = "invite_skipped";
      let invitationMessage = `Driver saved for ${normalizedDriverEmail}. Email delivery is not configured yet, so no invite was sent.`;
      const inviteLink = buildDriverInviteLink({
        email: normalizedDriverEmail,
        managerEmail: normalizedManagerEmail,
        managerName: ctx.user.name ?? null,
        pilotCode: pilotAccess?.status === "active" ? pilotAccess.code : null,
        companyName: pilotAccess?.status === "active" ? pilotAccess.fleetName : null,
      });
      const pilotNote =
        pilotAccess?.status === "active"
          ? `Pilot Access code: ${pilotAccess.code} (${pilotAccess.fleetName}, expires ${pilotAccess.expiresAt.toISOString().slice(0, 10)}).`
          : null;

      try {
        const inviteDelivery = await sendEmail({
          to: [normalizedDriverEmail],
          subject: "You've been invited to TruckFixr",
          text: [
            `${ctx.user.name || "Your manager"} invited you to TruckFixr as a driver.`,
            "",
            "Create or sign in to your TruckFixr account to access your assigned truck and inspections.",
            pilotNote ?? "",
            "",
            `Create your account: ${inviteLink}`,
          ].join("\n"),
          html: [
            `<p><strong>${ctx.user.name || "Your manager"}</strong> invited you to TruckFixr as a driver.</p>`,
            "<p>Create or sign in to your TruckFixr account to access your assigned truck and inspections.</p>",
            pilotNote ? `<p>${pilotNote}</p>` : "",
            `<p><a href="${inviteLink}">Create your TruckFixr driver account</a></p>`,
          ].join(""),
        });

        if (inviteDelivery.delivered) {
          invitationStatus = "invited";
          invitationMessage = `Invite sent to ${normalizedDriverEmail}. The driver can create an account from the email link and will stay linked to this manager.`;
        }
      } catch (error) {
        invitationStatus = "invite_failed";
        invitationMessage =
          error instanceof Error
            ? `Driver saved for ${normalizedDriverEmail}, but the invite email failed: ${error.message}`
            : `Driver saved for ${normalizedDriverEmail}, but the invite email failed.`;
      }

      return {
        driver: invitedDriver,
        invitation: {
          status: invitationStatus,
          message: invitationMessage,
          inviteLink,
          pilotCode: pilotAccess?.status === "active" ? pilotAccess.code : null,
        },
      };
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
