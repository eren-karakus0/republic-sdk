/**
 * Job submission example for Republic SDK
 *
 * This example demonstrates:
 * - Submitting a compute job to a validator
 * - Waiting for transaction confirmation
 * - Polling job status
 */
import {
  RepublicKey,
  RepublicClient,
  JobManager,
} from '../src/index';

async function main() {
  // 1. Setup key and client
  const key = RepublicKey.fromPrivateKey('your_private_key_hex_here');
  const client = new RepublicClient();
  const jobManager = new JobManager(client, key);

  // 2. Submit a compute job
  console.log('Submitting job...');
  const { txResponse, jobId } = await jobManager.submitAndWait({
    from: key.getAddress(),
    targetValidator: 'raivaloper1...',
    executionImage: 'republic-llm-inference:latest',
    verificationImage: 'example-verification:latest',
    uploadEndpoint: 'http://example.com/upload',
    fetchEndpoint: 'http://example.com/result',
    feeAmount: '1000000arai',
  });

  console.log('TX Hash:', txResponse.hash);
  console.log('Height:', txResponse.height);
  console.log('Job ID:', jobId);

  // 3. Watch job status
  if (jobId) {
    console.log('\nWatching job status...');
    for await (const status of jobManager.watchJob(jobId, 5000)) {
      console.log(`  [${new Date().toISOString()}] Status: ${status.status}`);
      if (status.result) {
        console.log('  Result:', status.result);
        break;
      }
    }
  }
}

main().catch(console.error);
