# Finnish Cybersecurity MCP

**Finnish cybersecurity data for AI compliance tools.**

[![npm version](https://badge.fury.io/js/%40ansvar%2Ffinnish-cybersecurity-mcp.svg)](https://www.npmjs.com/package/@ansvar/finnish-cybersecurity-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/Ansvar-Systems/finnish-cybersecurity-mcp/actions/workflows/ghcr-build.yml/badge.svg)](https://github.com/Ansvar-Systems/finnish-cybersecurity-mcp/actions/workflows/ghcr-build.yml)

Query Finnish cybersecurity data -- regulations, decisions, and requirements from Traficom/NCSC-FI (National Cyber Security Centre Finland) -- directly from Claude, Cursor, or any MCP-compatible client.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://mcp.ansvar.eu/finnish-cybersecurity/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add finnish-cybersecurity-mcp --transport http https://mcp.ansvar.eu/finnish-cybersecurity/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finnish-cybersecurity-mcp": {
      "type": "url",
      "url": "https://mcp.ansvar.eu/finnish-cybersecurity/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "finnish-cybersecurity-mcp": {
      "type": "http",
      "url": "https://mcp.ansvar.eu/finnish-cybersecurity/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/finnish-cybersecurity-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "finnish-cybersecurity-mcp": {
      "command": "npx",
      "args": ["-y", "@ansvar/finnish-cybersecurity-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "finnish-cybersecurity-mcp": {
      "command": "npx",
      "args": ["-y", "@ansvar/finnish-cybersecurity-mcp"]
    }
  }
}
```

---

## Available Tools (8)

| Tool | Description |
|------|-------------|
| `fi_cyber_search_guidance` | Full-text search across NCSC-FI (Kyberturvallisuuskeskus) guidelines and technical reports. |
| `fi_cyber_get_guidance` | Get a specific NCSC-FI guidance document by reference (e.g., 'NCSC-FI-2023-01'). |
| `fi_cyber_search_advisories` | Search NCSC-FI security advisories and alerts. Returns advisories with severity, affected products, and CVE references. |
| `fi_cyber_get_advisory` | Get a specific NCSC-FI security advisory by reference (e.g., 'NCSC-FI-2024-001'). |
| `fi_cyber_list_frameworks` | List all NCSC-FI frameworks and guidance series covered in this MCP. |
| `fi_cyber_about` | Return metadata about this MCP server: version, data source, coverage, and tool list. |
| `fi_cyber_list_sources` | List all data sources with URLs and licensing information. |
| `fi_cyber_check_data_freshness` | Check data freshness: record counts and newest document dates. |

All tools return structured data with source references and a `_meta` block containing disclaimer and copyright information.

---

## Data Sources and Freshness

All content is sourced from official Finnish regulatory publications:

- **Traficom/NCSC-FI (National Cyber Security Centre Finland)** -- Official regulatory authority

### Data Currency

- Database updates are periodic and may lag official publications
- Freshness checks run via GitHub Actions workflows
- Last-updated timestamps in tool responses indicate data age

Use the `fi_cyber_list_sources` tool for full provenance metadata, or see [COVERAGE.md](COVERAGE.md) for source documentation.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Not Regulatory Advice

> **THIS TOOL IS NOT REGULATORY OR LEGAL ADVICE**
>
> Regulatory data is sourced from official publications by Traficom/NCSC-FI (National Cyber Security Centre Finland). However:
> - This is a **research tool**, not a substitute for professional regulatory counsel
> - **Verify all references** against primary sources before making compliance decisions
> - **Coverage may be incomplete** -- do not rely solely on this for regulatory research

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for details.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/finnish-cybersecurity-mcp
cd finnish-cybersecurity-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run seed    # Seed SQLite database with sample data
npm run ingest  # Ingest latest NCSC-FI data
```

---

## Related Projects

This server is part of **Ansvar's MCP fleet** -- 276 MCP servers covering law, regulation, and compliance across 119 jurisdictions.

### Law MCPs

Full national legislation for 108 countries. Example: [@ansvar/swedish-law-mcp](https://github.com/Ansvar-Systems/swedish-law-mcp) -- 2,415 Swedish statutes with EU cross-references.

### Sector Regulator MCPs

National regulatory authority data for 29 EU/EFTA countries across financial regulation, data protection, cybersecurity, and competition. This MCP is one of 116 sector regulator servers.

### Domain MCPs

Specialized compliance domains: [EU Regulations](https://github.com/Ansvar-Systems/EU_compliance_MCP), [Security Frameworks](https://github.com/Ansvar-Systems/security-frameworks-mcp), [Automotive Cybersecurity](https://github.com/Ansvar-Systems/Automotive-MCP), [OT/ICS Security](https://github.com/Ansvar-Systems/ot-security-mcp), [Sanctions](https://github.com/Ansvar-Systems/Sanctions-MCP), and more.

Browse the full fleet at [mcp.ansvar.eu](https://mcp.ansvar.eu).

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

Regulatory data sourced from official government publications. See [COVERAGE.md](COVERAGE.md) for per-source licensing details.

---

## About Ansvar Systems

We build AI-powered compliance and legal research tools for the European market. Our MCP fleet provides structured, verified regulatory data to AI assistants -- so compliance professionals can work with accurate sources instead of guessing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
