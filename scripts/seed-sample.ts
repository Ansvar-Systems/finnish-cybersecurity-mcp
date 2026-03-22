/**
 * Seed the NCSC-FI database with sample guidance documents, advisories, and
 * frameworks for testing.
 *
 * Includes representative NCSC-FI cybersecurity guidelines, NIS2 guidance,
 * and sample security advisories.
 *
 * Usage:
 *   npx tsx scripts/seed-sample.ts
 *   npx tsx scripts/seed-sample.ts --force   # drop and recreate
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

const DB_PATH = process.env["NCSC_FI_DB_PATH"] ?? "data/ncsc_fi.db";
const force = process.argv.includes("--force");

const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

if (force && existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log(`Deleted existing database at ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);

console.log(`Database initialised at ${DB_PATH}`);

interface FrameworkRow {
  id: string;
  name: string;
  name_en: string;
  description: string;
  document_count: number;
}

const frameworks: FrameworkRow[] = [
  {
    id: "ncsc-fi-guidelines",
    name: "NCSC-FI Kyberturvallisuusohjeet",
    name_en: "NCSC-FI Cybersecurity Guidelines",
    description: "Kyberturvallisuuskeskuksen julkaisemat ohjeet ja suositukset organisaatioille tietoturvallisuuden parantamiseksi. Kattaa tekniset ohjeet, toimialakohtaiset suositukset ja NIS2-direktiivin toimeenpanon tukimateriaalit.",
    document_count: 42,
  },
  {
    id: "nis2-implementation",
    name: "NIS2-direktiivin kansallinen toimeenpano",
    name_en: "NIS2 Directive National Implementation",
    description: "Ohjeet NIS2-direktiivin (EU 2022/2555) kansallisesta toimeenpanosta Suomessa. Sisaltaa vaatimusten tulkinnan, ilmoitusvelvollisuudet ja toimialakohtaiset soveltamisohjeet.",
    document_count: 15,
  },
  {
    id: "kyberturva-peruspalvelut",
    name: "Kyberturvallisuuden peruspalvelut",
    name_en: "Basic Cybersecurity Services",
    description: "Kyberturvallisuuskeskuksen peruspalvelut organisaatioille: haavoittuvuuskoordinaatio, tilannekuva, varoitusjakelulistat ja kansallinen CSIRT-toiminta.",
    document_count: 8,
  },
];

const insertFramework = db.prepare(
  "INSERT OR IGNORE INTO frameworks (id, name, name_en, description, document_count) VALUES (?, ?, ?, ?, ?)",
);
for (const f of frameworks) {
  insertFramework.run(f.id, f.name, f.name_en, f.description, f.document_count);
}
console.log(`Inserted ${frameworks.length} frameworks`);

interface GuidanceRow {
  reference: string;
  title: string;
  title_en: string | null;
  date: string;
  type: string;
  series: string;
  summary: string;
  full_text: string;
  topics: string;
  status: string;
}

const guidance: GuidanceRow[] = [
  {
    reference: "NCSC-FI-2023-01",
    title: "Tietoturvallisuuden hallintajarjestelma — Ohje organisaatioille",
    title_en: "Information Security Management System — Guide for Organisations",
    date: "2023-03-15",
    type: "technical_guideline",
    series: "NCSC-FI",
    summary: "Ohje tietoturvallisuuden hallintajarjestelman (ISMS) rakentamiseksi ISO 27001:2022 ja NIS2-direktiivin vaatimusten mukaisesti. Sisaltaa ohjeet riskienarvioinnille, tietoturvapolitiikan laadintaan ja jatkuvaan parantamiseen.",
    full_text: "Tama ohje on tarkoitettu organisaatioille, jotka haluavat rakentaa systemaattisen tietoturvallisuuden hallintajarjestelman. ISMS on kokoelma kaytantoja, prosesseja ja jarjestelmia, jolla organisaatio hallitsee tietoturvariskejaan.\n\nISO 27001:2022 mukaisessa ISMS:ssa paaosat ovat: organisaation toimintaympariston ymmartaminen, johtajuus ja sitoutuminen, suunnittelu (riskit ja tavoitteet), tuki (resurssit, koulutus), toiminta (operatiivinen ohjaus), suorituskyvyn arviointi ja jatkuva parantaminen.\n\nNIS2-direktiivi edellyttaa kriittisten toimijoiden toteuttavan asianmukaiset tekniset, operatiiviset ja organisatoriset toimenpiteet. ISO 27001 -pohjainen ISMS tarjoaa vahvan perustan naiden vaatimusten tayttamiseksi.\n\nRiskienarvioinnissa suositellaan standardoituja menetelmia kuten ISO 27005 tai NIST SP 800-30. Riskimatriisissa arvioidaan todennakoisyys ja vaikutus, ja kasittelystrategiana on mitigointi, hyvaksyminen, siirtaminen tai valttaminen.",
    topics: JSON.stringify(["ISMS", "ISO 27001", "NIS2", "riskienhallinta", "tietoturvapolitiikka"]),
    status: "current",
  },
  {
    reference: "NCSC-FI-2023-02",
    title: "Salausmenetelmien kayttoohjeet — Kryptografisten algoritmien valinta ja kaytto",
    title_en: "Encryption Guidelines — Selection and Use of Cryptographic Algorithms",
    date: "2023-06-20",
    type: "technical_guideline",
    series: "NCSC-FI",
    summary: "Ohje kryptografisten algoritmien valinnasta ja kaytosta tiedonsiirron ja tallennuksen suojaamisessa. Sisaltaa NCSC-FIn suositukset TLS-versioista, salakirjoitusalgoritmeista, avainpituuksista ja PKI:sta.",
    full_text: "Kryptografia on keskeinen tyokalu tietoturvallisuudessa. Tama ohje antaa suosituksia kryptografisten menetelmien valitsemiseksi.\n\nTLS-protokolla: NCSC-FI suosittelee TLS 1.2 tai uudemman version kayttoa kaikissa yhteykissa. TLS 1.0 ja 1.1 ovat vanhentuneita. TLS 1.3 on suositeltavin.\n\nSuositellut algoritmit:\n- Symmetrinen salaus: AES-128-GCM tai AES-256-GCM. ChaCha20-Poly1305 resurssirajoitteisiin ymparistoihin.\n- Avaimenvaihto: ECDHE P-256 tai P-384, X25519. DHE 2048-bittisella moduluksella minimissaan.\n- Digitaalinen allekirjoitus: ECDSA P-256/P-384, RSA 2048 bittia minimissaan, Ed25519 suositeltava.\n- Tiivistefunktiot: SHA-256 tai SHA-384. SHA-1 on vanhentunut.\n\nAvainpituudet: RSA vahintaan 2048, suositeltu 3072/4096. ECC vahintaan P-256. AES 128 tai 256.\n\nKvanttilaskennan uhka: Seuraa NIST PQC -standardointia ja valmistaudu siirtymiseen kvanttiturvallisiin algoritmeihin.",
    topics: JSON.stringify(["kryptografia", "TLS", "AES", "RSA", "ECC", "PKI"]),
    status: "current",
  },
  {
    reference: "NCSC-FI-2023-03",
    title: "Toimitusketjun tietoturvallisuus — Ohje hankkijoille ja toimittajille",
    title_en: "Supply Chain Cybersecurity — Guide for Procurers and Suppliers",
    date: "2023-09-12",
    type: "technical_guideline",
    series: "NCSC-FI",
    summary: "Ohje toimitusketjun tietoturvariskeista ja niiden hallinnasta. Kattaa toimittajien arvioinnin, sopimusvaatimukset, SBOM:n ja haavoittuvuuksien koordinoinnin.",
    full_text: "Toimitusketjun kyberturvallisuus on noussut merkittavaksi riskitekijaksi. Korkean profiilin hyokkaykset (SolarWinds, Kaseya) ovat osoittaneet, etta hyokkaajat kohdistavat iskuja ohjelmistotoimittajiin.\n\nNIS2 21 artiklan mukaan toimijoiden on hallittava toimitusketjun tietoturvariskeja:\n1. Toimittajien arviointi — Arvioi tietoturvakypsyys ennen sopimusta, pyytaa todisteet sertifioinnista.\n2. Sopimusvaatimukset — Maarittele tietoturvavaatimukset, oikeus auditointiin, poikkeamailmoitusvelvollisuus.\n3. Ohjelmistoturvallisuus — Vaadi SBOM, tarkista haavoittuvuudet, automaattinen skannaus CI/CD-putkessa.\n4. Haavoittuvuuksien koordinointi — Seuraa tietoturvapaivayksia, suunnittele patchaus, osallistu NCSC-FIn koordinointiin.",
    topics: JSON.stringify(["toimitusketju", "supply chain", "toimittajariskit", "SBOM", "NIS2"]),
    status: "current",
  },
  {
    reference: "NCSC-FI-NIS2-2023-01",
    title: "NIS2-direktiivin vaatimusten toimeenpano-opas",
    title_en: "NIS2 Directive Implementation Guide — Significant and Essential Entities",
    date: "2023-11-01",
    type: "sector_guide",
    series: "NIS2",
    summary: "Kaytannon opas NIS2-direktiivin vaatimusten toimeenpanoon Suomessa. Kattaa toimijoiden luokittelun, rekisteroitymisvelvollisuuden, tietoturvatoimenpiteiden vaatimukset ja ilmoitusvelvollisuuden.",
    full_text: "NIS2-direktiivi (EU 2022/2555) tuli voimaan tammikuussa 2023. Toimijat jaetaan kahteen luokkaan: Keskeiset toimijat (Essential Entities) ja Merkittavat toimijat (Important Entities).\n\nRekisteroityminen: Suomalaiset toimijat rekisteroityvat Traficomille (Liikenne- ja viestintavirasto).\n\nTietoturvatoimenpiteiden vaatimukset (21 artikla): riskianalyysi ja tietoturvapolitiikat, poikkeamien kasittely, toiminnan jatkuvuus ja katastrofipalautus, toimitusketjun turvallisuus, haavoittuvuuksien hallinta, kryptografia, henkilostoturvallisuus, monivaiheinen todennus.\n\nIlmoitusvelvollisuus (23 artikla): Varhainen varoitus 24h, poikkeamailmoitus 72h, loppuraportti 1kk.\n\nSanktiot: Keskeisille enintaan 10M EUR tai 2% liikevaihdosta. Merkittaville enintaan 7M EUR tai 1,4%.",
    topics: JSON.stringify(["NIS2", "direktiivi", "tietoturvavaatimukset", "ilmoitusvelvollisuus", "sanktiot"]),
    status: "current",
  },
  {
    reference: "NCSC-FI-2022-04",
    title: "Haavoittuvuuksien hallinta — Ohje organisaatioille",
    title_en: "Vulnerability Management — Guide for Organisations",
    date: "2022-05-10",
    type: "technical_guideline",
    series: "NCSC-FI",
    summary: "Ohje haavoittuvuuksien hallintaprosessille. Kattaa tunnistamisen, luokittelun, priorisoinnin CVSS-pisteilla, korjaamisen SLA-ajoin ja seurannan.",
    full_text: "Haavoittuvuuksien hallinta on yksi keskeisimmista tietoturvallisuuden prosesseista.\n\nTunnistaminen: Automaattiset skannerit (OpenVAS, Nessus, Qualys), riippuvuuksien tarkistus (OWASP Dependency Check, Snyk), uhkatieto-syotteet (NCSC-FI varoitusjakelulistat, MITRE CVE), penetraatiotestaukset.\n\nLuokittelu: CVSS v3.1 pisteet 0-10: Kriittinen (9.0-10.0), Korkea (7.0-8.9), Keskitaso (4.0-6.9), Matala (0.1-3.9).\n\nPriorisointi: Huomioi EPSS-pisteet (hyodyntamistodennakoisyys), julkinen eksploitti, kohteen kriittisyys, altistuminen internettiin.\n\nKorjaamisprosessi: Maarittele SLA-ajat (esim. Kriittinen 24h, Korkea 7pv, Keskitaso 30pv, Matala 90pv).\n\nSeuranta: Mita hallitaan, sita mitataan. Seuraa MTTR-mittaria, avointen haavoittuvuuksien ikaa ja SLA-noudattamista.",
    topics: JSON.stringify(["haavoittuvuudet", "vulnerability management", "CVSS", "skannaus", "patchaus"]),
    status: "current",
  },
];

const insertGuidance = db.prepare(`
  INSERT OR IGNORE INTO guidance
    (reference, title, title_en, date, type, series, summary, full_text, topics, status)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertGuidanceAll = db.transaction(() => {
  for (const g of guidance) {
    insertGuidance.run(g.reference, g.title, g.title_en, g.date, g.type, g.series, g.summary, g.full_text, g.topics, g.status);
  }
});
insertGuidanceAll();
console.log(`Inserted ${guidance.length} guidance documents`);

interface AdvisoryRow {
  reference: string;
  title: string;
  date: string;
  severity: string;
  affected_products: string;
  summary: string;
  full_text: string;
  cve_references: string;
}

const advisories: AdvisoryRow[] = [
  {
    reference: "NCSC-FI-2024-001",
    title: "Kriittinen haavoittuvuus Fortigate VPN -laitteissa — CVE-2024-21762",
    date: "2024-02-09",
    severity: "critical",
    affected_products: JSON.stringify(["Fortinet FortiOS 7.4.0-7.4.2", "Fortinet FortiOS 7.2.0-7.2.6", "Fortinet FortiProxy"]),
    summary: "Fortinetin FortiOS- ja FortiProxy-tuotteissa on kriittinen out-of-bounds write -haavoittuvuus, jota hyodynnetaan aktiivisesti. Mahdollistaa autentikoimattoman koodin suorittamisen etana.",
    full_text: "NCSC-FI on havainnut aktiivisen hyodyntamisen Fortigate VPN -laitteissa. CVE-2024-21762 on out-of-bounds write -haavoittuvuus Fortinettin SSL-VPN-palvelun HTTP-pyyntojenkasittelyssa. CVSS v3.1: 9.6 (Kriittinen).\n\nVaikutukset: Autentikoimaton hyokkaaja voi suorittaa mielivaltaista koodia erityisesti muotoiltujen HTTP-pyyntojen avulla.\n\nHaavoittuvat versiot: FortiOS 7.4.0-7.4.2, 7.2.0-7.2.6, 7.0.0-7.0.13, 6.4.0-6.4.14; FortiProxy 7.4.0-7.4.2, 7.2.0-7.2.8, 7.0.0-7.0.14.\n\nSuositellut toimenpiteet:\n1. Paivita FortiOS versioon 7.4.3, 7.2.7, 7.0.14 tai 6.4.15\n2. Poista HTTP/HTTPS-paasy hallintaliittymaan julkisesta internetista valiaikaisesti\n3. Tutki kirjauksia kompromissien havaitsemiseksi\n4. Tarkista Fortinettin IoC-lista",
    cve_references: JSON.stringify(["CVE-2024-21762"]),
  },
  {
    reference: "NCSC-FI-2024-002",
    title: "Ivanti Connect Secure ja Policy Secure -haavoittuvuudet — CVE-2023-46805 ja CVE-2024-21887",
    date: "2024-01-12",
    severity: "critical",
    affected_products: JSON.stringify(["Ivanti Connect Secure 9.x", "Ivanti Connect Secure 22.x", "Ivanti Policy Secure"]),
    summary: "Ivanti tuotteissa on kaksi kriittista haavoittuvuutta, joita ketjutetaan. Valtiollisten toimijoiden on havaittu hyodyntavan naita kriittisen infrastruktuurin kohteisiin.",
    full_text: "NCSC-FI on saanut raportteja laajalevikkisesta Ivanti-haavoittuvuuksien hyodyntamisesta.\n\nCVE-2023-46805 (CVSS 8.2): Authentication bypass -haavoittuvuus, mahdollistaa autentikointivaatimuksen ohittamisen.\nCVE-2024-21887 (CVSS 9.1): Komentoinjektiohaavoittuvuus, autentikoitunut hyokkaaja voi suorittaa komentoja.\n\nKetjutettuna nailla haavoittuvuuksilla autentikoimaton hyokkaaja saavuttaa tayden kayttooikeuden.\n\nSuositellut toimenpiteet:\n1. Ota kayttoon Ivantin valiaikainen lieventamistoimenpide (XML-tuonti)\n2. Tee laitteen tehdaspalautus ennen paivitysta jos kompromissi mahdollinen\n3. Tarkista kirjaukset ja verkkoliikenne\n4. Eristae laite tarvittaessa",
    cve_references: JSON.stringify(["CVE-2023-46805", "CVE-2024-21887"]),
  },
  {
    reference: "NCSC-FI-2023-015",
    title: "MOVEit Transfer -haavoittuvuus — Laajamittainen tietomurtokampanja",
    date: "2023-06-05",
    severity: "critical",
    affected_products: JSON.stringify(["Progress MOVEit Transfer", "Progress MOVEit Cloud"]),
    summary: "Progress MOVEit Transfer -tuotteessa kriittinen SQL-injektiohaavoittuvuus. Cl0p-kiristysohjelmaryhmitta on varastanut tietoja useista organisaatioista.",
    full_text: "NCSC-FI on saanut useita ilmoituksia MOVEit Transfer -haavoittuvuuden hyodyntamisesta. CVE-2023-34362 on SQL-injektiohaavoittuvuus web-sovelluskomponentissa.\n\nVaikutukset: Autentikoimaton SQL-injektio tiedostosiirrossa kaytetyssa tietokannassa. Hyokkaaja voi hakea, muokata tai poistaa tietoja.\n\nCl0p-kiristysohjelmaryhmitta on tunnistettu vastuulliseksi kampanjasta. Satoja organisaatioita eri toimialoilta on vahvistettu uhreiksi globaalisti.\n\nSuositellut toimenpiteet:\n1. Asenna Progressin tietoturvapatch valittomasti\n2. Tarkista kirjaukset 30 paivan ajalta\n3. Nollaa tunnistetiedot (salasanat, API-avaimet)\n4. Ilmoita tietomurrosta Tietosuojavaltuutetun toimistolle 72 tunnin kuluessa\n5. Harkitse forensiikkapalvelujen kayttoa",
    cve_references: JSON.stringify(["CVE-2023-34362"]),
  },
];

const insertAdvisory = db.prepare(`
  INSERT OR IGNORE INTO advisories
    (reference, title, date, severity, affected_products, summary, full_text, cve_references)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertAdvisoriesAll = db.transaction(() => {
  for (const a of advisories) {
    insertAdvisory.run(a.reference, a.title, a.date, a.severity, a.affected_products, a.summary, a.full_text, a.cve_references);
  }
});
insertAdvisoriesAll();
console.log(`Inserted ${advisories.length} advisories`);

const guidanceCount = (db.prepare("SELECT count(*) as cnt FROM guidance").get() as { cnt: number }).cnt;
const advisoryCount = (db.prepare("SELECT count(*) as cnt FROM advisories").get() as { cnt: number }).cnt;
const frameworkCount = (db.prepare("SELECT count(*) as cnt FROM frameworks").get() as { cnt: number }).cnt;

console.log(`\nDatabase summary:`);
console.log(`  Frameworks:  ${frameworkCount}`);
console.log(`  Guidance:    ${guidanceCount}`);
console.log(`  Advisories:  ${advisoryCount}`);
console.log(`\nDone. Database ready at ${DB_PATH}`);

db.close();
