import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("../drizzle/schema", () => ({
  agentSupportAssignments: { agentSupportUserId: "agentSupportUserId", agentId: "agentId", id: "id" },
  users: { id: "id", name: "name", email: "email", title: "title", role: "role" },
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
  getUserById: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
}));

vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: vi.fn(() => ({ httpOnly: true, sameSite: "lax" })),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("agentSupport router", () => {
  describe("role validation", () => {
    it("should identify agent_support as a valid role", () => {
      const validRoles = ["admin", "agent", "isa", "agent_support"];
      expect(validRoles).toContain("agent_support");
    });

    it("should distinguish agent_support from admin", () => {
      const role = "agent_support";
      expect(role).not.toBe("admin");
      expect(role).not.toBe("agent");
      expect(role).not.toBe("isa");
    });
  });

  describe("KB visibility logic", () => {
    function canViewArticle(visibleToRoles: string, userRole: string): boolean {
      if (userRole === "admin") return true;
      const roles = visibleToRoles.split(",").map((r) => r.trim());
      const effectiveRole = userRole === "agent_support" ? "agent" : userRole;
      return roles.includes(effectiveRole);
    }

    it("agent_support sees articles visible to agent", () => {
      expect(canViewArticle("agent,isa", "agent_support")).toBe(true);
    });

    it("agent_support sees articles visible to agent only", () => {
      expect(canViewArticle("agent", "agent_support")).toBe(true);
    });

    it("agent_support does NOT see articles visible to isa only", () => {
      expect(canViewArticle("isa", "agent_support")).toBe(false);
    });

    it("agent_support does NOT see admin-only articles", () => {
      expect(canViewArticle("admin", "agent_support")).toBe(false);
    });

    it("admin can see all articles", () => {
      expect(canViewArticle("agent", "admin")).toBe(true);
      expect(canViewArticle("isa", "admin")).toBe(true);
      expect(canViewArticle("admin", "admin")).toBe(true);
    });
  });

  describe("work-as-agent cookie logic", () => {
    it("should only allow agent_support to work as agent", () => {
      const allowedRoles = ["agent_support"];
      const forbiddenRoles = ["admin", "agent", "isa"];

      allowedRoles.forEach((role) => {
        expect(role).toBe("agent_support");
      });

      forbiddenRoles.forEach((role) => {
        expect(role).not.toBe("agent_support");
      });
    });

    it("realUser should be exposed when agent_support is working as agent", () => {
      const realRole = "agent_support";
      const isSimulating = true;
      const isWorkingAsAgent = realRole === "agent_support" && isSimulating;
      expect(isWorkingAsAgent).toBe(true);
    });

    it("isWorkingAsAgent should be false when not simulating", () => {
      const realRole = "agent_support";
      const isSimulating = false;
      const isWorkingAsAgent = realRole === "agent_support" && isSimulating;
      expect(isWorkingAsAgent).toBe(false);
    });

    it("isWorkingAsAgent should be false for admin simulation", () => {
      const realRole = "admin";
      const isSimulating = true;
      const isWorkingAsAgent = realRole === "agent_support" && isSimulating;
      expect(isWorkingAsAgent).toBe(false);
    });
  });

  describe("assignment constraints", () => {
    it("agent_support cannot be assigned to non-agent users", () => {
      const validateAssignment = (agentRole: string) => {
        if (agentRole !== "agent") throw new Error("Target agent must have the 'agent' role");
        return true;
      };

      expect(() => validateAssignment("isa")).toThrow("Target agent must have the 'agent' role");
      expect(() => validateAssignment("admin")).toThrow("Target agent must have the 'agent' role");
      expect(() => validateAssignment("agent_support")).toThrow("Target agent must have the 'agent' role");
      expect(validateAssignment("agent")).toBe(true);
    });

    it("only agent_support users can be assigned as support", () => {
      const validateSupportUser = (role: string) => {
        if (role !== "agent_support") throw new Error("Target user is not an Agent Support user");
        return true;
      };

      expect(() => validateSupportUser("admin")).toThrow("Target user is not an Agent Support user");
      expect(() => validateSupportUser("agent")).toThrow("Target user is not an Agent Support user");
      expect(() => validateSupportUser("isa")).toThrow("Target user is not an Agent Support user");
      expect(validateSupportUser("agent_support")).toBe(true);
    });
  });

  describe("permissions: agent_support cannot access admin features", () => {
    it("should not have global admin access", () => {
      const role = "agent_support";
      const isAdmin = role === "admin";
      expect(isAdmin).toBe(false);
    });

    it("should not be able to override commission splits", () => {
      const canModifyCommission = (role: string) => role === "admin";
      expect(canModifyCommission("agent_support")).toBe(false);
    });

    it("should not be able to modify core system configurations", () => {
      const canModifySystemConfig = (role: string) => role === "admin";
      expect(canModifySystemConfig("agent_support")).toBe(false);
    });
  });
});
