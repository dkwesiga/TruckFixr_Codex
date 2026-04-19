import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      setHeader: () => {},
    } as TrpcContext["res"],
  };
}

describe("emailAuth.signup", () => {
  it("creates a new user with email and password", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailAuth.signup({
      email: "test@example.com",
      password: "SecurePassword123",
      name: "Test User",
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe("test@example.com");
    expect(result.user.name).toBe("Test User");
  });

  it("rejects duplicate email", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // First signup
    await caller.emailAuth.signup({
      email: "duplicate@example.com",
      password: "SecurePassword123",
      name: "First User",
    });

    // Try duplicate
    try {
      await caller.emailAuth.signup({
        email: "duplicate@example.com",
        password: "SecurePassword123",
        name: "Second User",
      });
      expect.fail("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("already exists");
    }
  });

  it("rejects weak password", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.emailAuth.signup({
        email: "weak@example.com",
        password: "weak",
        name: "Test User",
      });
      expect.fail("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("password");
    }
  });
});

describe("emailAuth.signin", () => {
  it("signs in user with correct credentials", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // First create user
    await caller.emailAuth.signup({
      email: "signin@example.com",
      password: "SecurePassword123",
      name: "Signin Test",
    });

    // Then signin
    const result = await caller.emailAuth.signin({
      email: "signin@example.com",
      password: "SecurePassword123",
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe("signin@example.com");
  });

  it("rejects incorrect password", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // First create user
    await caller.emailAuth.signup({
      email: "wrongpass@example.com",
      password: "SecurePassword123",
      name: "Wrong Pass Test",
    });

    // Try wrong password
    try {
      await caller.emailAuth.signin({
        email: "wrongpass@example.com",
        password: "WrongPassword123",
      });
      expect.fail("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("Invalid credentials");
    }
  });

  it("rejects non-existent user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.emailAuth.signin({
        email: "nonexistent@example.com",
        password: "SecurePassword123",
      });
      expect.fail("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("Invalid credentials");
    }
  });
});
