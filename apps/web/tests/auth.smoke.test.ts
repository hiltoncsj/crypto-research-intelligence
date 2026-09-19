import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { authOptions } from "../src/lib/auth";

const credentialsProvider = authOptions.providers[0] as unknown as {
  options: { authorize: (credentials: { email: string; password: string }) => Promise<unknown> };
};

describe("smoke: login (Credentials provider)", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct-password", 10);
  });

  it("autentica com email e senha corretos", async () => {
    const user = await credentialsProvider.options.authorize({
      email: "admin@example.com",
      password: "correct-password",
    });

    expect(user).toMatchObject({ email: "admin@example.com" });
  });

  it("rejeita senha incorreta", async () => {
    const user = await credentialsProvider.options.authorize({
      email: "admin@example.com",
      password: "wrong-password",
    });

    expect(user).toBeNull();
  });
});
