import { describe, expect, it } from "vitest";
import {
  assertNoAmbientSupabaseOverrides,
  shouldRestoreGeneratedTypeReferences,
  validateLocalStackStatus,
} from "./run-infra-tests.mjs";

const localStatus = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:local-password@127.0.0.1:54322/postgres",
  ANON_KEY: "local-anon-key-123456789",
  SERVICE_ROLE_KEY: "local-service-role-key-123456789",
};

describe("isolated local test stack preflight", () => {
  it("accepts the API and database endpoints only when they match the selected loopback ports", () => {
    expect(validateLocalStackStatus(localStatus, { apiPort: 54321, dbPort: 54322 })).toMatchObject({
      apiUrl: "http://127.0.0.1:54321",
      dbUrl: localStatus.DB_URL,
    });
  });

  it("rejects remote, mixed, and malformed endpoint/key configurations", () => {
    expect(() => validateLocalStackStatus({ ...localStatus, API_URL: "https://project.supabase.co" }, {
      apiPort: 54321,
      dbPort: 54322,
    })).toThrow(/loopback/);
    expect(() => validateLocalStackStatus({ ...localStatus, DB_URL: "postgresql://postgres:secret@127.0.0.1:54329/postgres" }, {
      apiPort: 54321,
      dbPort: 54322,
    })).toThrow(/selected local test stack/);
    expect(() => validateLocalStackStatus({ ...localStatus, SERVICE_ROLE_KEY: localStatus.ANON_KEY }, {
      apiPort: 54321,
      dbPort: 54322,
    })).toThrow(/key pair/);
  });

  it("fails before fixture writes when Supabase credentials are supplied by the caller", () => {
    expect(() => assertNoAmbientSupabaseOverrides({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }))
      .toThrow(/Unset ambient Supabase variables/);
    expect(() => assertNoAmbientSupabaseOverrides({ SUPABASE_SERVICE_ROLE_KEY: "caller-provided-key" }))
      .toThrow(/Unset ambient Supabase variables/);
    expect(() => assertNoAmbientSupabaseOverrides({})).not.toThrow();
  });
});

describe("temporary build type-reference cleanup", () => {
  it("restores generated references to the disposable build directory", () => {
    expect(shouldRestoreGeneratedTypeReferences(
      'import "./.next/types/routes.d.ts";',
      'import "./.next-e2e-test/types/routes.d.ts";',
      ".next-e2e-test",
    )).toBe(true);
  });

  it("preserves a reference that was already present before the test build", () => {
    expect(shouldRestoreGeneratedTypeReferences(
      'import "./.next-e2e-test/types/routes.d.ts";',
      'import "./.next-e2e-test/types/routes.d.ts";',
      ".next-e2e-test",
    )).toBe(false);
  });
});
