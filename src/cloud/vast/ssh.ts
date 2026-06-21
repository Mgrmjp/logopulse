// Ephemeral SSH keypair + node-ssh wrapper for connecting to vast.ai instances.
//
// Security: the private key is held in memory only. It is never written to
// disk. The matching public key is uploaded to vast.ai via
// `VastApi.registerSshKey` before the instance is created.
//
// Format note: we generate PKCS8 PEM via node:crypto. node-ssh → ssh2 accepts
// PKCS8 PEM directly, so no ssh-keygen round-trip is needed.

import { generateKeyPairSync, createHash } from "node:crypto";
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

/** Generate a fresh ed25519 keypair in memory. */
export function generateEphemeralKey(): SshKeyPair {
  const { publicKey: pubPem, privateKey: privPem } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // SPKI body for ed25519 has a 12-byte header. The 32 raw key bytes start
  // at offset 12.
  const pubDer = Buffer.from(
    pubPem
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, ""),
    "base64"
  );
  const rawPub = pubDer.subarray(12);
  if (rawPub.length !== 32) {
    throw new Error(`ed25519 public key has unexpected length ${rawPub.length}`);
  }

  // OpenSSH wire format (RFC 4253 + RFC 8709): the value field is an SSH
  // string "key" where each string is 4-byte length prefix + content.
  //   string  "ssh-ed25519"  (length 11)
  //   string  <32 raw bytes>  (length 32)
  // So we build a 51-byte buffer and base64-encode it.
  const blob = Buffer.alloc(51);
  blob.writeUInt32BE(11, 0);
  blob.write("ssh-ed25519", 4, 11, "ascii");
  blob.writeUInt32BE(32, 15);
  rawPub.copy(blob, 19);
  const wirePub = `ssh-ed25519 ${blob.toString("base64")} ${KEY_COMMENT}`;

  // sha256 fingerprint of the raw public key, base64-padded-stripped
  const fp = createHash("sha256")
    .update(rawPub)
    .digest("base64")
    .replace(/=+$/, "");

  return {
    publicKeyOpenSsh: wirePub,
    privateKeyPem: privPem,
    fingerprint: `SHA256:${fp}`,
  };
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
