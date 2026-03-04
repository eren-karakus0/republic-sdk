# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-04

### Added
- Encrypted keystore with AES-256-GCM + scrypt KDF (N=16384, r=8, p=1)
- Password prompt on key create/import/export/sign operations
- Automatic legacy plaintext keystore detection
- `keys migrate` CLI command for plaintext-to-encrypted migration
- `--no-password` flag and `REPUBLIC_SDK_PASSWORD` env var for CI/automation
- `KeystoreError` error class for keystore operations
- `EncryptedKey`, `KeyStoreV2`, `ScryptParams` types
- npm publish workflow (GitHub Releases → npm with provenance)
- Live chain integration tests (manual + weekly Monday schedule)
- `test:integration` npm script

### Changed
- Key storage format upgraded to v2 (encrypted by default)
- CLI signing commands now prompt for password to decrypt keys
- npm version badge added to README

### Security
- Private keys now encrypted at rest with AES-256-GCM
- scrypt KDF for password-based key derivation
- GCM authentication tag prevents ciphertext tampering

## [0.2.1] - 2026-03-04

### Changed
- Branch protection tightened: require 1 approving review, CODEOWNERS review required, stale review dismissal enabled

## [0.2.0] - 2026-03-04

### Added
- Custom error hierarchy: `RepublicError`, `RpcError`, `RestError`, `BroadcastError`, `TimeoutError`, `ValidationError`, `AccountNotFoundError`
- Retry mechanism with exponential backoff for RPC/REST calls (`RetryOptions`)
- Shared utilities: `sleep()`, `retry()`, `araiToRai()`, `raiToArai()`
- Staking queries: `getValidators()`, `getValidator()`, `getDelegations()`, `getDelegation()`, `getRewards()`, `getReward()`
- Governance queries: `getProposals()`, `getProposal()`
- New message types: `MsgWithdrawDelegatorReward`, `MsgVote`
- Transaction builders: `msgWithdrawReward()`, `msgVote()`
- CLI commands: `validators`, `delegations`, `rewards`, `withdraw-rewards`, `vote`
- GitHub Actions CI pipeline (Node 18/20 matrix)
- Input validation for vote proposal ID
- `getAccountInfoSafe()` method for safe account queries

### Changed
- `RepublicClient` constructor accepts `ClientOptions` with `retryOptions`
- `JobManager` key parameter is now optional (not needed for queries)
- `getBalance()` now propagates network errors instead of silently returning zero
- `getAccountInfo()` throws `AccountNotFoundError` instead of returning defaults
- Lint scope extended to cover `bin/` and `tests/` directories
- Error handling in `job.ts` uses typed errors (`ValidationError`, `RpcError`)

### Fixed
- `getBalance` silently swallowing network/service errors
- Job polling error discrimination (not-found vs real errors)
- Duplicate `sleep()` definitions removed

## [0.1.0] - 2026-03-03

### Added
- Initial release
- Key management with ethsecp256k1 (generate, import, export, sign, verify)
- RPC client for Tendermint JSON-RPC and Cosmos REST API
- Transaction signing with protobuf SIGN_MODE_DIRECT
- Message types: MsgSend, MsgDelegate, MsgUndelegate, MsgBeginRedelegate, MsgSubmitJob
- Job submission and monitoring via `JobManager`
- CLI tool with key management, balance queries, send, delegate, submit commands
- 60 tests passing
- ESM + CJS + DTS build output
