import { RepublicClient } from './client.js';
import { RepublicKey } from './key.js';
import { signTx, msgSubmitJob, encodeTx } from './transaction.js';
import { DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT } from './constants.js';
import type { JobSubmitParams, JobStatus, BroadcastResult, TxResponse } from './types.js';

export class JobManager {
  constructor(
    private client: RepublicClient,
    private key: RepublicKey,
  ) {}

  /** Submit a compute job to the blockchain */
  async submitJob(params: JobSubmitParams): Promise<BroadcastResult> {
    const address = this.key.getAddress(this.client.config.addressPrefix);
    const accountInfo = await this.client.getAccountInfo(address);

    const msg = msgSubmitJob({
      creator: address,
      targetValidator: params.targetValidator,
      executionImage: params.executionImage,
      verificationImage: params.verificationImage,
      uploadEndpoint: params.uploadEndpoint,
      fetchEndpoint: params.fetchEndpoint,
      feeAmount: params.feeAmount,
    });

    const signedTx = signTx(this.key, [msg], {
      chainId: this.client.config.chainId,
      accountNumber: accountInfo.accountNumber,
      sequence: accountInfo.sequence,
      gasLimit: params.gasLimit ?? DEFAULT_GAS_LIMIT,
      feeAmount: params.fees ?? DEFAULT_FEE_AMOUNT,
      feeDenom: this.client.config.denom,
      memo: params.memo ?? '',
    });

    const txBytes = encodeTx(signedTx);
    return this.client.broadcastTx(txBytes, 'sync');
  }

  /** Submit a job and wait for it to be included in a block */
  async submitAndWait(
    params: JobSubmitParams,
    timeoutMs = 30000,
  ): Promise<{ txResponse: TxResponse; jobId: string | null }> {
    const result = await this.submitJob(params);
    const txResponse = await this.client.waitForTx(result.hash, timeoutMs);

    // Try to extract job_id from events
    const jobId = extractJobId(txResponse);

    return { txResponse, jobId };
  }

  /** Get job status by job ID */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const data = Buffer.from(
      JSON.stringify({ job_id: jobId }),
    ).toString('hex');

    const result = await this.client.abciQuery(
      '/republic.computevalidation.v1.Query/Job',
      data,
    );

    if (!result.value) {
      throw new Error(`Job ${jobId} not found`);
    }

    const decoded = JSON.parse(
      Buffer.from(result.value, 'base64').toString(),
    );

    return decoded as JobStatus;
  }

  /**
   * Watch job status with polling (async generator).
   * Yields updated status until job completes or timeout.
   */
  async *watchJob(
    jobId: string,
    intervalMs = 5000,
    timeoutMs = 300000,
  ): AsyncGenerator<JobStatus> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const status = await this.getJobStatus(jobId);
        yield status;

        if (
          status.status === 'completed' ||
          status.status === 'failed'
        ) {
          return;
        }
      } catch {
        // Job may not be available yet, keep polling
      }

      await sleep(intervalMs);
    }

    throw new Error(`Timeout watching job ${jobId}`);
  }
}

/** Extract job_id from transaction events */
function extractJobId(txResponse: TxResponse): string | null {
  for (const event of txResponse.events) {
    if (
      event.type === 'submit_job' ||
      event.type === 'republic.computevalidation.v1.MsgSubmitJob'
    ) {
      for (const attr of event.attributes) {
        const key = tryDecodeBase64(attr.key);
        if (key === 'job_id') {
          return tryDecodeBase64(attr.value);
        }
      }
    }
  }
  return null;
}

function tryDecodeBase64(str: string): string {
  try {
    const decoded = Buffer.from(str, 'base64').toString();
    // If it decoded to printable ASCII, use it
    if (/^[\x20-\x7E]+$/.test(decoded)) return decoded;
  } catch {
    // Not base64
  }
  return str;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
