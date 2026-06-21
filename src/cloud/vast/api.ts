// vast.ai API client.
// Docs: https://docs.vast.ai/api-reference/
// Base URL: https://console.vast.ai/api/v0/
// Auth: Authorization: Bearer $VAST_API_KEY
//
// Endpoints used:
//   POST   /bundles/                search offers
//   POST   /ssh/                    register SSH public key
//   PUT    /asks/{offer_id}/        create instance from offer
//   GET    /instances/{id}/         get instance details
//   DELETE /instances/{id}/         destroy instance

const BASE_URL = "https://console.vast.ai/api/v0";

export class VastApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(status: number, endpoint: string, body: unknown, message?: string) {
    super(
      message ??
        `vast.ai API error ${status} on ${endpoint}: ${
          typeof body === "string" ? body : JSON.stringify(body)
        }`
    );
    this.name = "VastApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

export type VastInstance = {
  id: number;
  actual_status: string;
  ssh_host: string | null;
  ssh_port: number | null;
  status_msg: string | null;
  machine_id: number;
  bundle_id: number;
  dph: number;
  gpu_name: string;
  num_gpus: number;
  cpu_cores: number;
  cpu_ram: number;
  disk_space: number;
  cuda_vers: number | null;
  image: string;
  start_date: number;
};

export type VastOffer = {
  id: number;
  machine_id: number;
  bundle_id: number;
  gpu_name: string;
  num_gpus: number;
  cpu_cores: number;
  cpu_ram: number;
  disk_space: number;
  cuda_vers: number | null;
  dph_total: number;
  reliability: number;
  geolocation: string;
  verified: boolean;
  rentable: boolean;
  rented: boolean;
  type: string;
};

export type SearchFilters = Record<
  string,
  | boolean
  | number
  | string
  | unknown[]
  | { eq?: unknown; gt?: number; lt?: number; gte?: number; lte?: number; in?: unknown[]; notin?: unknown[] }
>;

export type SearchOffersOptions = {
  type?: "on-demand" | "interruptible" | "bid";
  verified?: boolean;
  rentable?: boolean;
  rented?: boolean;
  numGpusGte?: number;
  gpuNameIn?: string[];
  cudaVersGte?: number;
  diskSpaceGte?: number;
  minReliability?: number;
  geolocation?: string;
  order?: "dph_total" | "score";
  limit?: number;
};

export type CreateInstanceOptions = {
  offerId: number;
  image: string;
  diskGb: number;
  publicSshKey: string;
  onstart: string;
  label?: string;
  runtype?: "ssh" | "ssh_direct";
};

export type VastApiOptions = {
  apiKey: string;
  /** Override fetch for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override base URL for testing. */
  baseUrl?: string;
};

export class VastApi {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: VastApiOptions) {
    if (!opts.apiKey) throw new Error("VastApi: apiKey is required");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? BASE_URL;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep as text
      }
    }

    if (!res.ok) {
      throw new VastApiError(res.status, `${method} ${path}`, parsed);
    }
    return parsed as T;
  }

  /** POST /bundles/ — search available offers. */
  async searchOffers(opts: SearchOffersOptions = {}): Promise<VastOffer[]> {
    const body: SearchFilters = {
      type: opts.type ?? "on-demand",
      verified: { eq: opts.verified ?? true },
      rentable: { eq: opts.rentable ?? true },
      rented: { eq: opts.rented ?? false },
    };
    if (opts.numGpusGte !== undefined) body.num_gpus = { gte: opts.numGpusGte };
    if (opts.gpuNameIn !== undefined) body.gpu_name = { in: opts.gpuNameIn };
    if (opts.cudaVersGte !== undefined) body.cuda_vers = { gte: opts.cudaVersGte };
    if (opts.diskSpaceGte !== undefined) body.disk_space = { gte: opts.diskSpaceGte };
    if (opts.minReliability !== undefined) body.reliability = { gte: opts.minReliability };
    if (opts.geolocation) body.geolocation = { in: opts.geolocation.split(",") };
    if (opts.order) body.order = [[opts.order, "asc"]];
    if (opts.limit !== undefined) body.limit = opts.limit;

    const res = await this.request<{ offers: VastOffer[] }>("POST", "/bundles/", body);
    return res.offers ?? [];
  }

  /** POST /ssh/ — register a public SSH key with the account. */
  async registerSshKey(publicKey: string): Promise<{ id: number }> {
    const res = await this.request<{ success: boolean; key: { id: number } }>(
      "POST",
      "/ssh/",
      { ssh_key: publicKey }
    );
    return { id: res.key.id };
  }

  /** PUT /asks/{offerId}/ — create an instance. Returns the new instance id. */
  async createInstance(opts: CreateInstanceOptions): Promise<number> {
    const res = await this.request<{ success: boolean; new_contract: number }>(
      "PUT",
      `/asks/${opts.offerId}/`,
      {
        image: opts.image,
        disk: opts.diskGb,
        runtype: opts.runtype ?? "ssh_direct",
        ssh_key: opts.publicSshKey,
        onstart: opts.onstart,
        label: opts.label,
      }
    );
    return res.new_contract;
  }

  /** GET /instances/{id}/ — get current instance details. */
  async getInstance(id: number): Promise<VastInstance> {
    const res = await this.request<{ instances: VastInstance }>(
      "GET",
      `/instances/${id}/`
    );
    return res.instances;
  }

  /** DELETE /instances/{id}/ — destroy the instance. */
  async destroyInstance(id: number): Promise<void> {
    await this.request<{ success: boolean }>("DELETE", `/instances/${id}/`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
