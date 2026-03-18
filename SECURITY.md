# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | Yes       |
| < 0.3   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue.
2. Use [GitHub Security Advisories](https://github.com/PanoptesLabs/republic-sdk/security/advisories/new) to report privately.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix promptly.

## Security Considerations

### Key Storage
Since v0.3.0, the CLI encrypts private keys at rest using AES-256-GCM with scrypt KDF. Keys are stored in `~/.republic-sdk/keys.json` with file permissions set to `0600` (owner-only access). For production use, consider:
- Hardware wallets or HSM integration
- Environment variable-based key injection
- Dedicated secret management (Vault, AWS KMS, etc.)

### Dependencies
- Cryptographic operations use audited libraries: `@noble/secp256k1` and `@noble/hashes`
- Dependencies are monitored via Dependabot for known vulnerabilities
- No native addons — pure JavaScript/TypeScript implementation

### Network Security
- All default endpoints use HTTPS
- The SDK supports custom RPC/REST endpoints for private node connections
- Network calls include retry logic with exponential backoff
