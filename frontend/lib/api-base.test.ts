import { afterEach, describe, expect, it } from "vitest";
import { apiUrl, getApiBaseUrl } from "@/lib/api-base";

describe("api-base", () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = original;
    }
  });

  it("defaults to localhost:8000 for local dev", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(getApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("uses NEXT_PUBLIC_API_BASE_URL when set", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com/";
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });

  it("builds apiUrl with path", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com";
    expect(apiUrl("/ask")).toBe("https://api.example.com/ask");
  });
});
