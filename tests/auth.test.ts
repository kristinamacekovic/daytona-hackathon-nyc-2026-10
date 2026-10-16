import { describe, it, expect } from "vitest";
import { isAuthorized } from "@/lib/auth";

const basic = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

describe("isAuthorized", () => {
  it("is open when no password is configured (local dev)", () => {
    expect(isAuthorized(null, undefined)).toBe(true);
    expect(isAuthorized(null, "")).toBe(true);
  });
  it("accepts the right password with any username", () => {
    expect(isAuthorized(basic("demo", "s3cret"), "s3cret")).toBe(true);
    expect(isAuthorized(basic("", "s3cret"), "s3cret")).toBe(true);
  });
  it("accepts passwords that contain a colon", () => {
    expect(isAuthorized(basic("demo", "a:b:c"), "a:b:c")).toBe(true);
  });
  it("rejects a missing, malformed or wrong credential", () => {
    expect(isAuthorized(null, "s3cret")).toBe(false);
    expect(isAuthorized("Bearer xyz", "s3cret")).toBe(false);
    expect(isAuthorized("Basic !!!notbase64", "s3cret")).toBe(false);
    expect(isAuthorized(basic("demo", "wrong"), "s3cret")).toBe(false);
  });
});
