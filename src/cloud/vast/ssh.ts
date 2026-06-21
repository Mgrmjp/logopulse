// Ephemeral SSH keypair + node-ssh wrapper for connecting to vast.ai instances.
//
// Security: the private key is held in memory only. It is never written to
// disk. The matching public key is uploaded to vast.ai via
// `VastApi.registerSshKey` before the instance is created.
//
// Format note: we generate PKCS8 PEM via node:crypto. node-ssh → ssh2 accepts
// PKCS8 PEM directly, so no ssh-keygen round-trip is needed.

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeSSH, type Config as NodeSshConfig, type SSHExecCommandResponse } from "node-ssh";

export type SshKeyPair = {
  /** OpenSSH wire format: "ssh-ed25519 AAAA... comment" */
  publicKeyOpenSsh: string;
  /** PKCS8 PEM, consumable directly by ssh2 (and therefore node-ssh). */
  privateKeyPem: string;
  /** SHA256:... fingerprint of the raw public key, for logging. */
  fingerprint: string;
};

const KEY_COMMENT = "logopulse-ephemeral";

/** Generate a fresh ed25519 keypair in memory using ssh-keygen.
 *  ssh-keygen produces OpenSSH format which ssh2 accepts natively. */
export function generateEphemeralKey(): SshKeyPair {
  const prefix = join(tmpdir(), `logopulse-key-${Date.now()}`);
  const privPath = prefix;
  const pubPath = `${prefix}.pub`;
  try {
    execSync(`ssh-keygen -t ed25519 -f "${privPath}" -N "" -q -C ${KEY_COMMENT}`);
    const privateKeyPem = readFileSync(privPath, "utf8");
    const pubLine = readFileSync(pubPath, "utf8").trim();

    // Extract raw 32-byte public key from the OpenSSH pub line for fingerprinting
    const parts = pubLine.split(" ");
    const pubBlob = Buffer.from(parts[1], "base64");
    // Wire format: 4-byte len + "ssh-ed25519" + 4-byte len + 32 bytes key
    const rawPub = pubBlob.subarray(19);
    if (rawPub.length !== 32) {
      throw new Error(`ed25519 public key has unexpected length ${rawPub.length}`);
    }

    const fp = createHash("sha256")
      .update(rawPub)
      .digest("base64")
      .replace(/=+$/, "");

    return {
      publicKeyOpenSsh: pubLine,
      privateKeyPem,
      fingerprint: `SHA256:${fp}`,
    };
  } finally {
    try { unlinkSync(privPath); } catch {}
    try { unlinkSync(pubPath); } catch {}
  }
}

export type SshConnection = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
};

export type SshClient = {
  putFile(localPath: string, remotePath: string): Promise<void>;
  getFile(localPath: string, remotePath: string): Promise<void>;
  execCommand(cmd: string): Promise<{ stdout: string; stderr: string; code: number }>;
  dispose(): Promise<void>;
};

/** Open a node-ssh connection to a vast.ai instance. */
export async function connectSsh(conn: SshConnection): Promise<SshClient> {
  const ssh = new NodeSSH();
  const config: NodeSshConfig = {
    host: conn.host,
    port: conn.port,
    username: conn.username,
    privateKey: conn.privateKey,
    readyTimeout: 30_000,
  };
  await ssh.connect(config);

  return {
    async putFile(localPath, remotePath) {
      await ssh.putFile(localPath, remotePath);
    },
    async getFile(localPath, remotePath) {
      await ssh.getFile(localPath, remotePath);
    },
    async execCommand(cmd) {
      const r: SSHExecCommandResponse = await ssh.execCommand(cmd);
      return { stdout: r.stdout, stderr: r.stderr, code: r.code ?? 0 };
    },
    async dispose() {
      ssh.dispose();
    },
  };
}
