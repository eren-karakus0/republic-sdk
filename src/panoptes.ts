import axios, { AxiosInstance } from 'axios';
import type {
  PanoptesClientOptions,
  PanoptesEndpoint,
  PanoptesNetworkStats,
  PanoptesValidatorScore,
  PreflightResult,
} from './types.js';
import { validateExternalUrl } from './validation.js';

const DEFAULT_BASE_URL = 'https://panoptes.republicai.io';
const DEFAULT_TIMEOUT = 10000;

export class PanoptesClient {
  private http: AxiosInstance;
  private apiKey: string | null;

  constructor(options?: PanoptesClientOptions) {
    const url = options?.baseUrl ?? DEFAULT_BASE_URL;
    validateExternalUrl(url);
    const baseURL = url.replace(/\/+$/, '');
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.apiKey = options?.apiKey ?? null;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;

    this.http = axios.create({ baseURL, timeout, headers });
  }

  /** Get the best endpoint for a given type */
  async getBestEndpoint(type: 'rpc' | 'rest' | 'evm-rpc'): Promise<PanoptesEndpoint> {
    const { data } = await this.http.get(`/api/endpoints/best?type=${encodeURIComponent(type)}`);
    return data as PanoptesEndpoint;
  }

  /** Run preflight checks before broadcasting */
  async preflight(params: {
    fromAddress: string;
    toAddress?: string;
    amount?: string;
    denom?: string;
  }): Promise<PreflightResult> {
    const { data } = await this.http.post('/api/preflight', params);
    return data as PreflightResult;
  }

  /** Get network stats */
  async getNetworkStats(): Promise<PanoptesNetworkStats> {
    const { data } = await this.http.get('/api/stats');
    return {
      totalValidators: data.latest?.totalValidators ?? 0,
      activeValidators: data.latest?.activeValidators ?? 0,
      totalStaked: data.latest?.totalStaked ?? '0',
      blockHeight: String(data.latest?.blockHeight ?? '0'),
    } as PanoptesNetworkStats;
  }

  /** Get validator score */
  async getValidatorScore(validatorId: string): Promise<PanoptesValidatorScore> {
    const { data } = await this.http.get(`/api/validators/${encodeURIComponent(validatorId)}`);
    return {
      validatorId,
      score: data.validator?.score ?? 0,
      missedBlockRate: data.validator?.missedBlocks ?? 0,
      governanceScore: 0,
    } as PanoptesValidatorScore;
  }

  /** Check if Panoptes API is healthy */
  async isHealthy(): Promise<boolean> {
    try {
      const { data } = await this.http.get('/api/health');
      return data.status === 'healthy';
    } catch {
      return false;
    }
  }
}
