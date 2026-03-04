# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2](https://github.com/eren-karakus0/republic-sdk/compare/republic-sdk-v0.3.1...republic-sdk-v0.3.2) (2026-03-04)


### Bug Fixes

* chain publish into release-please workflow ([ab49c39](https://github.com/eren-karakus0/republic-sdk/commit/ab49c39557105107c5d55a1ca73e533344612fb5))
* chain publish step into release-please workflow ([f7a005a](https://github.com/eren-karakus0/republic-sdk/commit/f7a005a0f404b6fda97d7455b6af2cac89af0c9e))
* **ci:** add issues write permission for release-please labels ([2969877](https://github.com/eren-karakus0/republic-sdk/commit/2969877336c11b10b237094e2fe3ee98fe8fda64))
* **docs:** update security policy, add CODEOWNERS, clean changelog ([12064d7](https://github.com/eren-karakus0/republic-sdk/commit/12064d7c08fafad483bb1d9820d7f32fb0ffbdd7))
* **test:** fix integration test runner with separate vitest config ([46f2c2c](https://github.com/eren-karakus0/republic-sdk/commit/46f2c2c380b9290259b6a4f0866b46628ad44153))
* **test:** upgrade vitest to v2 to fix DataCloneError in integration tests ([5954f3b](https://github.com/eren-karakus0/republic-sdk/commit/5954f3ba0927bbdd15ccf4bb37059a01ba9bbdd8))
* **test:** use forks pool for integration tests to avoid DataCloneError ([158bd42](https://github.com/eren-karakus0/republic-sdk/commit/158bd42337f7036cd0b1ef4bd3b519772417b0e3))

## [0.3.1](https://github.com/eren-karakus0/republic-sdk/compare/republic-sdk-v0.3.0...republic-sdk-v0.3.1) (2026-03-04)


### Features

* add live chain integration tests ([e5096e4](https://github.com/eren-karakus0/republic-sdk/commit/e5096e454fef70091a8a21438c1abf65e5f4554d))
* add npm publish workflow and update README ([12e9937](https://github.com/eren-karakus0/republic-sdk/commit/12e9937a1c5f394bf66168cb37dc3d5dc9b4c991))
* encrypted keystore with AES-256-GCM + scrypt KDF ([04bedc3](https://github.com/eren-karakus0/republic-sdk/commit/04bedc3223e8ed64c00c48f4fcfbacd6642ecd7e))
* initial Republic AI TypeScript SDK ([15be914](https://github.com/eren-karakus0/republic-sdk/commit/15be91467cbb2712520af2677a0120778710d914))
* **sdk:** v0.2.0 - retry, staking/gov queries, custom errors, CI ([0318b74](https://github.com/eren-karakus0/republic-sdk/commit/0318b742b47bb9ffcc5823e6e7300389d2fe4c3f))
* v0.3.0 - encrypted keystore, npm publish, integration tests ([28d9bc6](https://github.com/eren-karakus0/republic-sdk/commit/28d9bc67a4561ee4e67954129be2721cad2cd768))


### Bug Fixes

* add type module and fix CLI output extension for Node 18 ESM compatibility ([629127b](https://github.com/eren-karakus0/republic-sdk/commit/629127bb3cbff1fc2297b06ef39ec56daae71ea2))
* audit findings - error handling, input validation, lint scope ([218ef12](https://github.com/eren-karakus0/republic-sdk/commit/218ef124bd486b3a5f41dddf23b1ad3ff96277dd))
* audit findings - install docs, security contact, issue config ([c1bc9be](https://github.com/eren-karakus0/republic-sdk/commit/c1bc9be4769af4b3fb3f19da95ecd1008c2bf302))
* bundle ESM-only dependency for CJS compatibility ([97641e2](https://github.com/eren-karakus0/republic-sdk/commit/97641e29eb3053ef3b3873e9cc5dfa9ec29d6971))
* correct Fee.gas_limit protobuf field number and polish ([6e563f4](https://github.com/eren-karakus0/republic-sdk/commit/6e563f48a0b4585752f3af37aef987ad4c0d14b3))
* critical fixes for production readiness ([e52e401](https://github.com/eren-karakus0/republic-sdk/commit/e52e40128bc6128beccdf043324fb87af0a4765e))
* prevent legacy keystore data loss on encrypted key operations ([d89be3d](https://github.com/eren-karakus0/republic-sdk/commit/d89be3d2cabf45f0b75fbc3b7dc0836f5ae060e8))
* stabilize release-please and sync package-lock.json ([d0c6ce0](https://github.com/eren-karakus0/republic-sdk/commit/d0c6ce0345a764e9bec6f367de1e911540fc819d))


### Documentation

* restructure examples with runnable CLI scripts ([4c42108](https://github.com/eren-karakus0/republic-sdk/commit/4c42108bd57eb3889cb06b8fe8b3fef69dcb6839))

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
