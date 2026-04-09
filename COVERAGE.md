# Coverage

This document describes the data sources, scope, and coverage of the Finnish Cybersecurity MCP server.

## Data Sources

### NCSC-FI Guidelines and Technical Reports

| Field | Value |
|-------|-------|
| **Publisher** | NCSC-FI / Traficom (National Cyber Security Centre Finland) |
| **URL** | https://www.kyberturvallisuuskeskus.fi/fi/ohjeet-ja-tukimateriaalit |
| **Languages** | Finnish (fi), English (en) |
| **License** | Finnish government open data |
| **Update frequency** | As published by NCSC-FI |

**Covered series:**
- `NCSC-FI` — National cybersecurity guidelines and technical reports
- `Kyberturva` — Sector-specific cybersecurity guidance (Kyberturvakortti series)
- `NIS2` — NIS2 Directive implementation guidance for Finland

**Document types:**
- `technical_guideline` — Technical guidelines and recommendations
- `sector_guide` — Sector-specific security guidance
- `standard` — National cybersecurity standards and frameworks
- `recommendation` — Best practice recommendations

### NCSC-FI Security Advisories and Alerts

| Field | Value |
|-------|-------|
| **Publisher** | NCSC-FI / Traficom |
| **URL** | https://www.kyberturvallisuuskeskus.fi/fi/ajankohtaista/varoitukset-ja-turvatiedotteet |
| **Languages** | Finnish (fi), English (en) |
| **License** | Finnish government open data |
| **Update frequency** | As published by NCSC-FI |

**Severity levels:** `critical`, `high`, `medium`, `low`

**Content:** Security advisories, vulnerability alerts, threat notifications, and product-specific security bulletins. CVE references included where available.

## Coverage Scope

| Category | Coverage |
|----------|----------|
| **Guidance documents** | NCSC-FI guidelines, technical reports, NIS2 implementation materials, sector-specific guides |
| **Security advisories** | NCSC-FI vulnerability alerts and security bulletins |
| **Frameworks** | Finnish national cybersecurity framework, NIS2 compliance structure |

## Limitations

- Database updates are periodic and may lag official NCSC-FI publications
- Historical documents prior to the ingest start date may be incomplete
- Machine-translated summaries (Finnish → English) may not perfectly reflect original nuance
- Use `fi_cyber_check_data_freshness` to check current record counts and newest document dates
- Always verify compliance decisions against the primary NCSC-FI sources at kyberturvallisuuskeskus.fi

## Not Covered

- Classified or restricted NCSC-FI publications
- Real-time threat intelligence feeds
- ENISA (EU Agency for Cybersecurity) publications (separate MCP)
- Finnish legislation (Kyberturvallisuuslaki) text — see the Finnish Law MCP
