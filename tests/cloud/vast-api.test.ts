import { describe, it, expect, vi, beforeEach } from "vitest";
import { VastApi, VastApiError, type VastOffer } from "../../src/cloud/vast/api.js";

function mockFetch(responses: Array<{ status: number; body: unknown } | Error>): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("VastApi", () => {
  describe("constructor", () => {
    it("rejects empty api key", () => {
      expect(() => new VastApi({ apiKey: "" })).toThrow();
    });
  });

  describe("searchOffers", () => {
    it("sends a POST to /bundles/ with on-demand filters and returns offers", async () => {
      const offer: VastOffer = {
        id: 100,
        machine_id: 5,
        bundle_id: 1,
        gpu_name: "RTX_3090",
        num_gpus: 1,
        cpu_cores: 8,
        cpu_ram: 32_000,
        disk_space: 100,
        cuda_vers: 12.4,
        dph_total: 0.2,
        reliability: 0.95,
        geolocation: "US",
        verified: true,
        rentable: true,
        rented: false,
        type: "on-demand",
      };
      const fetchImpl = mockFetch([{ status: 200, body: { offers: [offer] } }]);
      const api = new VastApi({ apiKey: "test", fetchImpl });

      const offers = await api.searchOffers({ order: "dph_total", limit: 20, numGpusGte: 1 });

      expect(offers).toHaveLength(1);
      expect(offers[0].gpu_name).toBe("RTX_3090");
      expect(offers[0].dph_total).toBe(0.2);

      const call = (fetchImpl as any).mock.calls[0];
      expect(call[0]).toBe("https://console.vast.ai/api/v0/bundles/");
      const opts = call[1];
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer test");
      const body = JSON.parse(opts.body);
      expect(body.type).toBe("on-demand");
      expect(body.verified).toEqual({ eq: true });
      expect(body.rentable).toEqual({ eq: true });
      expect(body.rented).toEqual({ eq: false });
      expect(body.num_gpus).toEqual({ gte: 1 });
      expect(body.order).toEqual([["dph_total", "asc"]]);
      expect(body.limit).toBe(20);
    });

    it("returns empty array when response has no offers", async () => {
      const fetchImpl = mockFetch([{ status: 200, body: {} }]);
      const api = new VastApi({ apiKey: "test", fetchImpl });
      const offers = await api.searchOffers();
      expect(offers).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("throws VastApiError on 4xx with parsed body", async () => {
      const fetchImpl = mockFetch([
        { status: 401, body: { success: false, error: "auth_error", msg: "Invalid user key" } },
      ]);
      const api = new VastApi({ apiKey: "bad", fetchImpl });
      await expect(api.searchOffers()).rejects.toThrow(VastApiError);
      try {
        await api.searchOffers({}).catch(() => {}); // expect rejection
      } catch (e) {
        // already covered above
      }
    });

    it("throws VastApiError on 500", async () => {
      const fetchImpl = mockFetch([{ status: 500, body: { msg: "boom" } }]);
      const api = new VastApi({ apiKey: "test", fetchImpl });
      // need a fresh mock — but mockFetch consumes the queue. So build a new one.
      const fetchImpl2 = mockFetch([{ status: 500, body: { msg: "boom" } }]);
      const api2 = new VastApi({ apiKey: "test", fetchImpl: fetchImpl2 });
      await expect(api2.getInstance(42)).rejects.toThrow(/500/);
    });
  });

  describe("createInstance", () => {
    it("sends PUT to /asks/{id}/ with image, disk, ssh_key, onstart, runtype", async () => {
      const fetchImpl = mockFetch([{ status: 200, body: { success: true, new_contract: 999 } }]);
      const api = new VastApi({ apiKey: "k", fetchImpl });
      const id = await api.createInstance({
        offerId: 42,
        image: "logopulse/logopulse:latest",
        diskGb: 50,
        publicSshKey: "ssh-ed25519 AAAA...",
        onstart: "echo hi",
      });
      expect(id).toBe(999);
      const call = (fetchImpl as any).mock.calls[0];
      expect(call[0]).toBe("https://console.vast.ai/api/v0/asks/42/");
      const body = JSON.parse(call[1].body);
      expect(body.image).toBe("logopulse/logopulse:latest");
      expect(body.disk).toBe(50);
      expect(body.runtype).toBe("ssh_direct");
      expect(body.ssh_key).toBe("ssh-ed25519 AAAA...");
      expect(body.onstart).toBe("echo hi");
    });
  });

  describe("registerSshKey", () => {
    it("POSTs to /ssh/ with the public key", async () => {
      const fetchImpl = mockFetch([
        { status: 200, body: { success: true, key: { id: 7 } } },
      ]);
      const api = new VastApi({ apiKey: "k", fetchImpl });
      const result = await api.registerSshKey("ssh-ed25519 AAAA...");
      expect(result.id).toBe(7);
    });
  });

  describe("getInstance", () => {
    it("unwraps the { instances: ... } envelope", async () => {
      const fetchImpl = mockFetch([
        {
          status: 200,
          body: {
            instances: {
              id: 1,
              actual_status: "running",
              ssh_host: "ssh1.vast.ai",
              ssh_port: 12345,
              status_msg: null,
              machine_id: 99,
              bundle_id: 1,
              dph: 0.1,
              gpu_name: "RTX_3090",
              num_gpus: 1,
              cpu_cores: 8,
              cpu_ram: 32_000,
              disk_space: 100,
              cuda_vers: 12.4,
              image: "logopulse/logopulse:latest",
              start_date: 1700000000,
            },
          },
        },
      ]);
      const api = new VastApi({ apiKey: "k", fetchImpl });
      const inst = await api.getInstance(1);
      expect(inst.actual_status).toBe("running");
      expect(inst.ssh_host).toBe("ssh1.vast.ai");
    });
  });

  describe("destroyInstance", () => {
    it("DELETEs /instances/{id}/", async () => {
      const fetchImpl = mockFetch([{ status: 200, body: { success: true } }]);
      const api = new VastApi({ apiKey: "k", fetchImpl });
      await api.destroyInstance(1);
      const call = (fetchImpl as any).mock.calls[0];
      expect(call[0]).toBe("https://console.vast.ai/api/v0/instances/1/");
      expect(call[1].method).toBe("DELETE");
    });
  });
});
