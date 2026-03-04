/**
 * Job Submission Example
 *
 * Demonstrates submitting a compute job to a Republic validator:
 * 1. Setup key and client
 * 2. Submit a compute job with execution/verification images
 * 3. Wait for transaction confirmation
 * 4. Watch job status until completion
 *
 * Usage:
 *   npx tsx examples/job-submission.ts <private-key-hex> <validator-address> <execution-image>
 *
 * Example:
 *   npx tsx examples/job-submission.ts abc123...def raivaloper1... republic-llm-inference:latest
 */

import {
  RepublicKey,
  RepublicClient,
  JobManager,
} from '../src/index.js';

async function main() {
  const [privateKeyHex, validatorAddress, executionImage] = process.argv.slice(2);

  if (!privateKeyHex || !validatorAddress || !executionImage) {
    console.error('Usage: npx tsx examples/job-submission.ts <private-key-hex> <validator-address> <execution-image>');
    console.error('Example: npx tsx examples/job-submission.ts abc123 raivaloper1... republic-llm-inference:latest');
    process.exit(1);
  }

  // 1. Setup
  const key = RepublicKey.fromPrivateKey(privateKeyHex);
  const client = new RepublicClient();
  const jobManager = new JobManager(client, key);

  console.log(`Submitter: ${key.getAddress()}`);
  console.log(`Validator: ${validatorAddress}`);
  console.log(`Image:     ${executionImage}`);

  // 2. Submit job and wait for TX confirmation
  console.log('\nSubmitting job...');
  const { txResponse, jobId } = await jobManager.submitAndWait({
    targetValidator: validatorAddress,
    executionImage,
    verificationImage: '',
    uploadEndpoint: '',
    fetchEndpoint: '',
    feeAmount: '1000000arai',
  });

  console.log(`TX Hash:  ${txResponse.hash}`);
  console.log(`Height:   ${txResponse.height}`);
  console.log(`Gas Used: ${txResponse.gasUsed}`);

  if (!jobId) {
    console.log('Job ID not found in TX events.');
    return;
  }

  console.log(`Job ID:   ${jobId}`);

  // 3. Watch job status
  console.log('\nWatching job status (Ctrl+C to stop)...');
  for await (const status of jobManager.watchJob(jobId, 5000)) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`  [${timestamp}] ${status.status}`);

    if (status.result) {
      console.log(`\nJob completed!`);
      console.log(`Result: ${status.result}`);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
