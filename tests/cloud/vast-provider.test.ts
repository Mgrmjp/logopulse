import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock node-ssh BEFORE importing the provider so the module captures the mock.
const sshMock = {
  connectImpl: vi.fn(),
  putFile: vi.fn(),
  getFile: vi.fn(),
  execCommand: vi.fn(),
  dispose: vi.fn(),
};

vi.mock("../../src/cloud/vast/ssh.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/cloud/vast/ssh.js")>(
    "../../src/cloud/vast/ssh.js"
  );
  return {
    ...actual,
    connectSsh: vi.fn(async () => sshMock),
    generateEphemeralKey: () => ({
      publicKeyOpenSsh: "ssh-ed25519 AAAA test",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----",
      fingerprint: "SHA256:fake",
    }),
  };
});

import { VastProvider, rewriteConfigForRemote, buildGitOnstart, DEFAULT_GIT_IMAGE } from "../../src/cloud/vast/provider.js";
import { VastApi } from "../../src/cloud/vast/api.js";
import { DEFAULT_CONFIG } from "../../src/config/default-config.js";

type FetchCall = { url: string; method: string; body?: unknown };

function makeFetch(responses: Array<{ status: number; body: unknown }>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchImpl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses[i++];
    if (!r) throw new Error(`unexpected fetch call #${i}`);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const OFFER = {
  id: 100,
  machine_id: 5,
  bundle_id: 1,
  gpu_name: "RTX_3090",
  num_gpus: 1,
  cpu_cores: 8,
  cpu_ram: 32_000,
  disk_space: 100,
  cuda_vers: 12.4,
  dph: 0.2,
  reliability: 0.95,
  geolocation: "US",
  verified: true,
  rentable: true,
  rented: false,
  type: "on-demand" as const,
};

const RUNNING_INSTANCE = {
  id: 1,
  actual_status: "running",
  ssh_host: "ssh1.vast.ai",
  ssh_port: 12345,
  status_msg: null,
  machine_id: 5,
  bundle_id: 1,
  dph: 0.2,
  gpu_name: "RTX_3090",
  num_gpus: 1,
  cpu_cores: 8,
  cpu_ram: 32_000,
  disk_space: 100,
  cuda_vers: 12.4,
  image: "logopulse/logopulse:latest",
  start_date: 1700000000,
};

beforeEach(() => {
  sshMock.connectImpl.mockReset();
  sshMock.putFile.mockReset().mockResolvedValue(undefined);
  sshMock.getFile.mockReset().mockResolvedValue(undefined);
  sshMock.execCommand.mockReset().mockResolvedValue({ stdout: "", stderr: "", code: 0 });
  sshMock.dispose.mockReset().mockResolvedValue(undefined);
});

describe("rewriteConfigForRemote", () => {
  it("rewrites input paths to /tmp/<filename><ext>", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      input: { song: "./local/song.mp3", logo: "./logo.png", background: "./bg.jpg" },
    };
    const out = rewriteConfigForRemote(cfg, {
      song: "/home/me/songs/song.mp3",
      logo: "/home/me/logos/logo.png",
      background: "/home/me/backgrounds/bg.jpg",
    });
    expect(out.input?.song).toBe("/tmp/song.mp3");
    expect(out.input?.logo).toBe("/tmp/logo.png");
    expect(out.input?.background).toBe("/tmp/background.jpg");
  });
});

describe("buildGitOnstart", () => {
  it("clones the repo, runs the bootstrap and run scripts", () => {
    const onstart = buildGitOnstart("https://github.com/user/logopulse.git");
    expect(onstart).toContain("git clone --depth 1 \"https://github.com/user/logopulse.git\" /tmp/logopulse");
    expect(onstart).toContain("bash /tmp/logopulse/scripts/cloud-bootstrap.sh");
    expect(onstart).toContain("bash /tmp/logopulse/scripts/cloud-run.sh");
  });

  it("escapes double quotes in the URL", () => {
    const onstart = buildGitOnstart('https://x.com/foo"; rm -rf /; echo "');
    // The malicious double-quote should be backslash-escaped so the shell
    // doesn't terminate the quoted URL string.
    expect(onstart).not.toMatch(/"rm -rf/);
    expect(onstart).toContain('\\"');
  });

  it("stays under vast.ai's 4048-char onstart limit", () => {
    const onstart = buildGitOnstart("https://github.com/some-user/some-repo.git");
    expect(onstart.length).toBeLessThan(4048);
  });
});

describe("VastProvider with gitUrl", () => {
  it("uses vastai/base-image and a git-cloning onstart", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 200, body: { offers: [OFFER] } },
      { status: 200, body: { success: true, key: { id: 7 } } },
      { status: 200, body: { success: true, new_contract: 1234 } },
      { status: 200, body: { instances: RUNNING_INSTANCE } },
    ]);

    const dir = mkdtempSync(join(tmpdir(), "logopulse-test-"));
    const songPath = join(dir, "song.mp3");
    const logoPath = join(dir, "logo.png");
    const bgPath = join(dir, "bg.jpg");
    writeFileSync(songPath, "fake");
    writeFileSync(logoPath, "fake");
    writeFileSync(bgPath, "fake");
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({
      input: { song: songPath, logo: logoPath, background: bgPath },
      output: { path: "/tmp/out.mp4", profile: "preview" },
    }));

    const provider = new VastProvider({
      apiKey: "k",
      image: "should-be-overridden",
      gitUrl: "https://github.com/user/logopulse.git",
      fetchImpl,
    });

    expect((provider as any).image).toBe(DEFAULT_GIT_IMAGE);

    await provider.submitJob(cfgPath, { song: songPath, logo: logoPath, background: bgPath });

    // Find the create-instance call and inspect its onstart
    const createCall = calls.find((c) => c.url.includes("/asks/"));
    expect(createCall).toBeDefined();
    const body = createCall!.body as Record<string, unknown>;
    expect(body.image).toBe(DEFAULT_GIT_IMAGE);
    const onstart = body.onstart as string;
    expect(onstart).toContain("git clone");
    expect(onstart).toContain("github.com/user/logopulse.git");
    expect(onstart).toContain("cloud-bootstrap.sh");
  });

  it("rejects gitUrl combined with explicit onstart", () => {
    expect(() => {
      new VastProvider({
        apiKey: "k",
        image: "x",
        gitUrl: "https://github.com/u/r.git",
        onstart: "custom",
      });
    }).toThrow(/mutually exclusive/);
  });
});

describe("VastProvider.submitJob", () => {
  it("orchestrates the full submit flow: search -> key -> ssh -> create -> wait -> ship", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 200, body: { offers: [OFFER] } }, // search
      { status: 200, body: { success: true, key: { id: 7 } } }, // register ssh key
      { status: 200, body: { success: true, new_contract: 999 } }, // create instance
      { status: 200, body: { instances: { ...RUNNING_INSTANCE, actual_status: "loading" } } },
      { status: 200, body: { instances: RUNNING_INSTANCE } },
    ]);

    // We need to also call waitForInstanceRunning — that's done via getInstance,
    // which the makeFetch queue needs to support. We included two getInstance
    // responses above.

    const dir = mkdtempSync(join(tmpdir(), "logopulse-test-"));
    const songPath = join(dir, "song.mp3");
    const logoPath = join(dir, "logo.png");
    const bgPath = join(dir, "bg.jpg");
    writeFileSync(songPath, "fake");
    writeFileSync(logoPath, "fake");
    writeFileSync(bgPath, "fake");
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({
      input: { song: songPath, logo: logoPath, background: bgPath },
      output: { path: "/tmp/out.mp4", profile: "preview" },
    }));

    const provider = new VastProvider({
      apiKey: "k",
      image: "logopulse/logopulse:latest",
      diskGb: 50,
      fetchImpl,
    });

    const job = await provider.submitJob(cfgPath, {
      song: songPath,
      logo: logoPath,
      background: bgPath,
    });

    expect(job.id).toBe("999");
    expect(job.status).toBe("running");
    expect(job.provider).toBe("vast");

    // Check the sequence of API calls
    expect(calls[0].url).toContain("/bundles/");
    expect(calls[0].method).toBe("POST");
    expect(calls[1].url).toContain("/ssh/");
    expect(calls[1].method).toBe("POST");
    expect(calls[2].url).toContain("/asks/100/");
    expect(calls[2].method).toBe("PUT");
    expect(calls[3].url).toContain("/instances/999/");
    expect(calls[3].method).toBe("GET");

    // SSH operations happened
    expect(sshMock.putFile).toHaveBeenCalledTimes(4); // song, logo, bg, job config
    expect(sshMock.execCommand).toHaveBeenCalledWith(
      expect.stringContaining("touch /tmp/logopulse-start")
    );
    expect(sshMock.dispose).toHaveBeenCalled();
  });

  it("aborts when no offers are available", async () => {
    const { fetchImpl } = makeFetch([{ status: 200, body: { offers: [] } }]);
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    await expect(provider.submitJob("/nope", { song: "", logo: "", background: "" })).rejects.toThrow(
      /No GPU offers/
    );
  });

  it("aborts when cheapest offer exceeds max-price", async () => {
    const { fetchImpl } = makeFetch([
      { status: 200, body: { offers: [{ ...OFFER, dph: 5.0 }] } },
    ]);
    const provider = new VastProvider({ apiKey: "k", image: "x", maxPricePerHour: 1.0, fetchImpl });
    await expect(provider.submitJob("/nope", { song: "", logo: "", background: "" })).rejects.toThrow(
      /exceeds max-price/
    );
  });

  it("destroys the instance on failure during submit", async () => {
    const { fetchImpl } = makeFetch([
      { status: 200, body: { offers: [OFFER] } }, // search ok
      { status: 200, body: { success: true, key: { id: 7 } } }, // ssh key ok
      { status: 200, body: { success: true, new_contract: 1234 } }, // create ok
      { status: 200, body: { instances: { ...RUNNING_INSTANCE, id: 1234, actual_status: "exited", status_msg: "kernel panic" } } },
      { status: 200, body: { success: true } }, // destroy
    ]);

    const dir = mkdtempSync(join(tmpdir(), "logopulse-test-"));
    const songPath = join(dir, "song.mp3");
    const logoPath = join(dir, "logo.png");
    const bgPath = join(dir, "bg.jpg");
    writeFileSync(songPath, "fake");
    writeFileSync(logoPath, "fake");
    writeFileSync(bgPath, "fake");
    const cfgPath = join(dir, "config.json");
    writeFileSync(cfgPath, JSON.stringify({
      input: { song: songPath, logo: logoPath, background: bgPath },
      output: { path: "/tmp/out.mp4", profile: "preview" },
    }));

    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    await expect(provider.submitJob(cfgPath, { song: songPath, logo: logoPath, background: bgPath }))
      .rejects.toThrow(/died during boot/);
  });
});

describe("VastProvider.getStatus", () => {
  it("returns 'failed' when instance is exited", async () => {
    const { fetchImpl } = makeFetch([
      { status: 200, body: { instances: { ...RUNNING_INSTANCE, actual_status: "exited" } } },
    ]);
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    // Force a job to be tracked
    (provider as any).jobs.set("1", {
      instanceId: 1,
      sshHost: "x",
      sshPort: 22,
      key: { publicKeyOpenSsh: "k", privateKeyPem: "p", fingerprint: "f" },
      offerDph: 0.1,
    });
    const status = await provider.getStatus("1");
    expect(status).toBe("failed");
  });

  it("returns 'completed' when status file reports completed", async () => {
    const { fetchImpl } = makeFetch([
      { status: 200, body: { instances: RUNNING_INSTANCE } },
    ]);
    sshMock.execCommand.mockResolvedValue({
      stdout: '{"status":"completed"}',
      stderr: "",
      code: 0,
    });
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    (provider as any).jobs.set("1", {
      instanceId: 1,
      sshHost: "x",
      sshPort: 22,
      key: { publicKeyOpenSsh: "k", privateKeyPem: "p", fingerprint: "f" },
      offerDph: 0.1,
    });
    expect(await provider.getStatus("1")).toBe("completed");
  });

  it("returns 'running' when status file is missing", async () => {
    const { fetchImpl } = makeFetch([
      { status: 200, body: { instances: RUNNING_INSTANCE } },
    ]);
    sshMock.execCommand.mockResolvedValue({ stdout: "{}", stderr: "", code: 0 });
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    (provider as any).jobs.set("1", {
      instanceId: 1,
      sshHost: "x",
      sshPort: 22,
      key: { publicKeyOpenSsh: "k", privateKeyPem: "p", fingerprint: "f" },
      offerDph: 0.1,
    });
    expect(await provider.getStatus("1")).toBe("running");
  });
});

describe("VastProvider.destroy", () => {
  it("calls delete on the API and forgets the job", async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: { success: true } }]);
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    (provider as any).jobs.set("42", {
      instanceId: 42,
      sshHost: "x",
      sshPort: 22,
      key: { publicKeyOpenSsh: "k", privateKeyPem: "p", fingerprint: "f" },
      offerDph: 0.1,
    });
    await provider.destroy("42");
    expect(calls[0].url).toContain("/instances/42/");
    expect(calls[0].method).toBe("DELETE");
    expect((provider as any).jobs.has("42")).toBe(false);
  });

  it("is a no-op for unknown job ids", async () => {
    const { fetchImpl } = makeFetch([]);
    const provider = new VastProvider({ apiKey: "k", image: "x", fetchImpl });
    await expect(provider.destroy("999")).resolves.toBeUndefined();
  });
});
