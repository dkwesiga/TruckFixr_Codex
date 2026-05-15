import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

function configuredStaffEmails() {
  return new Set(
    ENV.adminEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

type StaffLikeUser =
  | {
      email?: string | null;
      role?: string | null;
    }
  | null
  | undefined;

export function isStaffAdminUser(user: StaffLikeUser) {
  const userEmail = user?.email?.trim().toLowerCase();
  const staffEmails = configuredStaffEmails();

  if (userEmail && staffEmails.has(userEmail)) {
    return true;
  }

  if (
    !ENV.isProduction &&
    staffEmails.size === 0 &&
    (user?.role === "owner" || user?.role === "manager")
  ) {
    return true;
  }

  return false;
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'owner' && ctx.user.role !== 'manager')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const staffProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !isStaffAdminUser(ctx.user)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This action is limited to TruckFixr staff administrators.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
