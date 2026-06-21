import { describe, it, expect } from "vitest";
import { generateEphemeralKey } from "../../src/cloud/vast/ssh.js";
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("generateEphemeralKey", () => {
  it("produces a valid OpenSSH wire-format public key", () => {
    const k = generateEphemeralKey();
    // Format: "ssh-ed25519 <base64> comment"
    const parts = k.publicKeyOpenSsh.split(" ");
    expect(parts[0]).toBe("ssh-ed25519");
    expect(parts[2]).toBe("logopulse-ephemeral");
    expect(parts[1]).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("public key is consistent with what ssh-keygen extracts from the private key", () => {
    const k = generateEphemeralKey();
    const dir = mkdtempSync(join(tmpdir(), "logopulse-key-"));
    const privPath = join(dir, "key");
    writeFileSync(privPath, k.privateKeyPem, { mode: 0o600 });
    try {
      const sshPub = execSync(`ssh-keygen -y -f ${privPath}`, { encoding: "utf8" }).trim();
      const ourPubKeyField = k.publicKeyOpenSsh.split(" ")[1];
      const sshKeygenPubKeyField = sshPub.split(" ")[1];
      expect(ourPubKeyField).toBe(sshKeygenPubKeyField);
    } finally {
      unlinkSync(privPath);
    }
  });

  it("private key is PKCS8 PEM that ssh2/node-ssh can consume", () => {
    const k = generateEphemeralKey();
    expect(k.privateKeyPem).toContain("-----BEGIN PRIVATE KEY-----");
    expect(k.privateKeyPem).toContain("-----END PRIVATE KEY-----");
  });

  it("fingerprint is SHA256-prefixed base64", () => {
    const k = generateEphemeralKey();
    expect(k.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
  });

  it("each call generates a unique key", () => {
    const a = generateEphemeralKey();
    const b = generateEphemeralKey();
    expect(a.publicKeyOpenSsh).not.toBe(b.publicKeyOpenSsh);
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });
});
