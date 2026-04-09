# Tools Reference

This document describes all 8 tools provided by the Finnish Cybersecurity MCP server.

All tool responses include a `_meta` block with:
- `disclaimer` — usage disclaimer
- `copyright` — data copyright notice
- `source_url` — primary source URL

---

## fi_cyber_search_guidance

Full-text search across NCSC-FI (Kyberturvallisuuskeskus) guidelines and technical reports.

**Inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query in Finnish or English (e.g., `'tietoturvallisuus'`, `'NIS2 vaatimukset'`, `'vulnerability management'`) |
| `type` | string | No | Filter by document type: `technical_guideline`, `sector_guide`, `standard`, `recommendation` |
| `series` | string | No | Filter by guidance series: `NCSC-FI`, `Kyberturva`, `NIS2` |
| `status` | string | No | Filter by status: `current`, `superseded`, `draft` |
| `limit` | number | No | Maximum results to return (default: 20, max: 100) |

**Output:** `{ results: Guidance[], count: number, _meta: Meta }`

Each `Guidance` object contains: `id`, `reference`, `title`, `title_en`, `date`, `type`, `series`, `summary`, `full_text`, `topics`, `status`.

---

## fi_cyber_get_guidance

Get a specific NCSC-FI guidance document by reference.

**Inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | Yes | NCSC-FI document reference (e.g., `'NCSC-FI-2023-01'`, `'Kyberturva-ohje-001'`) |

**Output:** `Guidance & { _meta: Meta }` or error if not found.

---

## fi_cyber_search_advisories

Search NCSC-FI security advisories and alerts.

**Inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query in Finnish or English (e.g., `'kriittinen haavoittuvuus'`, `'ransomware'`, `'VPN'`) |
| `severity` | string | No | Filter by severity: `critical`, `high`, `medium`, `low` |
| `limit` | number | No | Maximum results to return (default: 20, max: 100) |

**Output:** `{ results: Advisory[], count: number, _meta: Meta }`

Each `Advisory` object contains: `id`, `reference`, `title`, `date`, `severity`, `affected_products`, `summary`, `full_text`, `cve_references`.

---

## fi_cyber_get_advisory

Get a specific NCSC-FI security advisory by reference.

**Inputs:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | Yes | NCSC-FI advisory reference (e.g., `'NCSC-FI-2024-001'`) |

**Output:** `Advisory & { _meta: Meta }` or error if not found.

---

## fi_cyber_list_frameworks

List all NCSC-FI frameworks and guidance series covered in this MCP.

**Inputs:** None

**Output:** `{ frameworks: Framework[], count: number, _meta: Meta }`

Each `Framework` object contains: `id`, `name`, `name_en`, `description`, `document_count`.

---

## fi_cyber_about

Return metadata about this MCP server.

**Inputs:** None

**Output:** `{ name, version, description, data_source, coverage, tools[], _meta: Meta }`

---

## fi_cyber_list_sources

List all data sources used by this MCP server with URLs and licensing.

**Inputs:** None

**Output:** `{ sources: Source[], _meta: Meta }`

Each `Source` object contains: `id`, `name`, `name_fi`, `url`, `publisher`, `language`, `coverage`, `license`, `update_frequency`.

---

## fi_cyber_check_data_freshness

Check the freshness and completeness of data in this MCP server.

**Inputs:** None

**Output:** `{ guidance_count, advisories_count, frameworks_count, newest_guidance_date, newest_advisory_date, checked_at, _meta: Meta }`

Use this tool to verify data currency before making compliance decisions.
