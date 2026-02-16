# Entwicklung für das Kaspa‑Netzwerk: Technischer Deep‑Dive

## Executive Summary

Dieses Dokument beschreibt, was Sie **ab heute (14.02.2026, Europe/Berlin)** benötigen, um professionell für das Kaspa‑Netzwerk zu entwickeln: von **offiziellen Primärquellen** (Website, KIPs, Referenz‑Repos, Specs) über **SDKs/APIs**, **Node‑Betrieb & RPC**, **Testnet/Devnet‑Tooling**, **Wallets/Keys/Hardware‑Wallets**, bis hin zu **Protokoll‑Interna** (GHOSTDAG/BlockDAG, Crescendo‑Parameter, Transaktions‑ und Mempool‑Regeln), **Indexer/Explorer/Monitoring**, **Security‑ und Deployment‑Patterns**, **Lizenzen** und **offenen Forschungsfragen**. citeturn7search12turn29view0turn5search0turn23view0turn26view0

**Unspecified / nicht spezifiziert:** Ihre bevorzugte Programmiersprache, Ziel‑Use‑Case und Betriebsform (nur Client‑App, Backend‑Service, Mining/Pool‑Integration, Indexer/Explorer, Wallet, L2/rollup). Entsprechend werden in den Abschnitten Optionen für **Rust**, **JavaScript/TypeScript (WASM SDK)** sowie **Backend‑Integrationen über gRPC/WebSocket/REST** aufgezeigt. citeturn23view0turn16search11turn19view0turn3search4

**Empfehlung “Start today” (pragmatischer Pfad in 7 Tagen):**
1. **Node‑Basis**: Setzen Sie auf **Rusty Kaspa** (kaspanet/rusty‑kaspa) als empfohlene Node‑Software; Go‑kaspad ist deprecated. citeturn23view0turn26view0  
2. **RPC‑Stil wählen**:  
   - gRPC (stabil, canonical) + Proto‑Files aus dem Repo  
   - optional wRPC über WebSocket (JSON/Borsh), standardmäßig deaktiviert und gezielt zu aktivieren. citeturn24view0turn19view0turn3search23  
3. **Datenzugriff nicht mit “public API” verwechseln**: Für produktive Infrastruktur ist die Empfehlung, **eigene Instanzen** zu betreiben (Node + Indexer + REST‑Server), statt sich nur auf geteilte Endpoints zu verlassen. citeturn3search3turn3search4turn3search10  
4. **Transaktionen korrekt bauen**: Mass/Storage‑Mass (KIP‑9), Fee‑Rate & Mass‑Limits (Standard‑Tx/Block) verstehen; UTXO‑Index einschalten, wenn Sie “UTXO by address”/Wallet‑Funktionen benötigen. citeturn16search3turn15view0turn3search11turn16search17  
5. **Programmierung/“Smart Contracts” realistisch einordnen**: Base‑Layer ist UTXO + Script (txscript) und wird über KIP‑10 um **Introspection‑Opcodes** erweitert (Covenant‑artige Patterns); zudem wurden Payloads für Daten/Brücken‑Designs aktiviert (Crescendo/KIP‑14). “Turing‑complete L1‑Smart‑Contracts” sind nicht der Kernfokus; Kaspa positioniert sich u. a. als Settlement/Ordering‑Layer für L2‑Ansätze (z. B. ZK‑Rollups). citeturn13view0turn14view0turn2search1turn3search33

## Offizielle und primäre Quellen

Diese Quellen sind die belastbarste Grundlage. Reihenfolge: **offiziell/primär** → ergänzend/sekundär.

entity["organization","Kaspa","blockdag pow network"] **Kaspa‑Website (Überblick, Ressourcen, Veröffentlichungen, Developer‑Einstiege)**  
- URL: https://kaspa.org/ citeturn7search12  
- Relevanz: High‑level Architektur/Positionierung (BlockDAG, PoW, 10 BPS), Community‑Links (Explorer, GitHub etc.). citeturn7search12  
- Maturity: “Marketing + Einstieg”, nicht als Spezifikation ausreichend.  
- Nächste Schritte: Als Inhaltsverzeichnis nutzen, dann in KIPs/Repos/Spezifikationen verifizieren.

**White/Yellow Papers (Kaspa‑Kuratiert)**
- URL: https://kaspa.org/resources/white-papers/ citeturn29view0  
- Enthält Links zu: GHOSTDAG/PHANTOM‑GHOSTDAG “White Paper” (eprint), DAGKnight‑Whitepaper (eprint) sowie vProg Yellow Paper (GitHub). citeturn29view0  
- Hinweis: Die IACR‑eprint‑PDFs sind in vielen Umgebungen automatisiert schwer abrufbar; für die technische Arbeit sind **KIPs + Implementierungs‑Repos** die praktischere Quelle, ergänzt durch über Verlage zugängliche Fassungen (z. B. ACM DOI für PHANTOM‑GHOSTDAG). citeturn31search7turn14view0

entity["company","GitHub","code hosting platform"] **Kaspa‑Kern‑Repos (kaspanet‑Organisation)**
- Rusty Node + Framework: https://github.com/kaspanet/rusty-kaspa citeturn8view0turn23view0  
- KIPs (Kaspa Improvement Proposals): https://github.com/kaspanet/kips citeturn6view0  
- Docs‑Repo (Specs/Reference, WIP): https://github.com/kaspanet/docs citeturn18view0  
- Go‑Node (deprecated, Wallet‑Teile teils maintained): https://github.com/kaspanet/kaspad citeturn26view0  
- Maturity: Rusty‑Kaspa ist **empfohlene Node‑Software**; Go‑kaspad ist **deprecated**. citeturn23view0turn26view0  
- Nächste Schritte: Rusty‑Kaspa “stable” Branch für produktive Builds verwenden; KIPs als normative Änderungshistorie; proto‑Files (gRPC) direkt aus rusty‑kaspa ziehen. citeturn9view0turn7search3turn21view0

**Tabelle: Primärquellen‑Checkliste für Entwickler**

| Item | Zweck | Link (primär) | Stabilitäts‑Einschätzung | Empfohlene nächste Schritte |
|---|---|---|---|---|
| Kaspa Website | Einstieg, kuratierte Links | https://kaspa.org/ citeturn7search12 | stabil (Info), nicht normative Spec | Als Index nutzen, dann alles in KIPs/Code gegenprüfen |
| White/Yellow Papers Seite | Paper‑Links (GHOSTDAG, DAGKnight, vProgs) | https://kaspa.org/resources/white-papers/ citeturn29view0 | stabil (kuratiert) | Paper lesen + KIPs/Implementierung parallel verfolgen |
| Rusty‑Kaspa Repo | Node + Libraries + Wallet + Sim‑Tools | https://github.com/kaspanet/rusty-kaspa citeturn8view0turn24view2 | **production‑grade**, aktiv | stable branch bauen; RPC‑Protos, simpa, override‑params nutzen |
| KIPs Repo | Protokoll‑Änderungen/Upgrades | https://github.com/kaspanet/kips citeturn6view0turn14view0 | kanonisch, aber “Active” ≠ aktiviert | Relevante KIPs (9,10,14,15) in Roadmap/Release prüfen |
| Docs Repo | Referenz‑Docs (WIP) | https://github.com/kaspanet/docs citeturn18view0 | WIP | Für Datenformate nützlich, aber gegen KIP/Code validieren |
| Go kaspad | Legacy/Referenz, Wallet teils | https://github.com/kaspanet/kaspad citeturn26view0 | **deprecated** | Nur als Legacy‑Referenz/SDK‑Compat; neue Arbeit in Rusty |

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["kaspanet rusty-kaspa GitHub repository README","Kaspa KIPs repository GitHub","Kaspa Explorer website interface","Kaspa white papers page"],"num_per_query":1}

## Nodes, RPCs und lokale Umgebungen

### Node‑Software und Implementierungen

**Rusty‑Kaspa (empfohlen, Rust)**
- Repo: https://github.com/kaspanet/rusty-kaspa citeturn8view0turn23view0  
- Status: “recommended node software”; stable Branch für stabile Releases. citeturn9view0turn23view0  
- Crescendo (Mainnet‑Umstellung auf 10 BPS) ist dokumentiert und im Repo historisiert (Hardfork am 05.05.2025 ~15:00 UTC). citeturn9view0turn21view0turn4search0  
- Installations‑/Build‑Hinweise inkl. Protobuf/LLVM/WASM‑Tooling sind im README. citeturn9view0turn9view1turn9view2  
- Lokale Toolchain: integrierte Wallet/CLI, wRPC‑Subsystem, Stratum‑Bridge (Beta), Simulation (simpa), Heap‑Profiling, Logging/Filtering, Override‑Params (nicht auf Mainnet). citeturn24view0turn25view0turn21view0  
- Lizenz: ISC. citeturn8view0

**Go‑kaspad (deprecated, Go)**
- Repo: https://github.com/kaspanet/kaspad citeturn26view0  
- Status: ausdrücklich **deprecated**; PRs/Issues werden (bis auf Wallet‑Themen) geschlossen. citeturn26view0  
- Nutzen heute: Legacy‑Vergleiche, ggf. Wallet‑Komponenten; außerdem wird es in Integrations‑Guides gelegentlich als SDK‑Quelle erwähnt (Tag‑Pins für Kompat). citeturn21view0turn26view0  
- Lizenz: ISC. citeturn26view0

### System‑ und Performance‑Requirements

Für 10 BPS sind klare Mindestanforderungen dokumentiert:
- Crescendo‑Guide (Rusty‑Kaspa): Minimum 8 CPU‑Cores, 16 GB RAM, 256 GB SSD, ~5 MB/s Netzwerk; “Preferred” deutlich höher für bessere Peer‑Unterstützung. citeturn21view0  
- Testnet‑12‑Guide (experimentell, covenants‑Testnetz): empfohlen 16 GB RAM, CPU ≥8 Cores, SSD ≥250 GB (besser 300 GB), optional `--ram-scale=0.6` bei 8 GB RAM. citeturn12view0

**Konsequenz für Entwickler:** Wenn Ihr Projekt (Indexer, Explorer‑Backend, Wallet‑Backend) verlässlich laufen soll, planen Sie **mindestens** die Crescendo‑Specs als Baseline, plus Reserven für Indexing/DB. citeturn21view0turn3search10

### RPC‑Schnittstellen und Ports

Rusty‑Kaspa unterstützt mehrere RPC‑Stile:
- **gRPC** (canonical; Proto‑Specs im Repo) citeturn19view0turn7search3  
- **wRPC über WebSocket**: JSON‑Encoding oder Borsh‑Encoding; wRPC ist standardmäßig **disabled** und muss explizit aktiviert werden (`--rpclisten-json` / `--rpclisten-borsh`). citeturn24view0turn23view1  
- Port‑Wahl ist network‑abhängig; Ports lassen sich per Flags konfigurieren. citeturn3search11turn22search9

**RPC‑Feature‑Highlights (aus rpc.proto):**
- Mempool: `GetMempoolEntry*`, `GetMempoolEntries*` citeturn19view0  
- Transaktionen: `SubmitTransaction*` inkl. Replacement/RBF‑Pfad (`SubmitTransactionReplacementRequestMessage`) citeturn19view0  
- DAG/Info: `GetBlockDagInfo*`, `GetBlock*`, Virtual‑Chain Notifications citeturn19view0  
- UTXO‑Indexing: `GetUtxosByAddresses*`, `NotifyUtxosChanged*` – **nur verfügbar, wenn Node mit `--utxoindex` gestartet wurde**. citeturn19view0turn16search17

**Mining/Pool‑Integrations‑Wichtig:** Ab Crescendo existiert ein `mass`‑Feld in Transaktionen; Pool/Stratum muss Protos aktualisieren und `mass` aus `GetBlockTemplate` beim `SubmitBlock` erhalten. citeturn21view0turn7search3turn19view0

### Vergleichstabelle: Node‑Clients und Betriebsmodi

| Node/Komponente | Sprache | Status/Maturity | Installation | Lizenz | Nächste Schritte |
|---|---|---|---|---|---|
| Rusty‑Kaspa (kaspad) | Rust | **empfohlen, aktiv, Releases** citeturn23view0turn24view2 | Build (cargo), Releases, Docker build scripts citeturn9view0turn9view2turn23view1 | ISC citeturn8view0 | stable branch nutzen; gRPC proto pinnen; `--utxoindex` für Wallet/UTXO‑Calls |
| Go kaspad | Go | **deprecated** citeturn26view0 | go install citeturn26view0 | ISC citeturn26view0 | Nur Legacy/Wallet‑Bezug; neue Entwicklung auf Rusty‑Kaspa |
| Stratum Bridge | Rusty‑Kaspa Subsystem | Beta citeturn24view0 | Repo README “Bridge” citeturn24view0 | ISC (implizit über Repo) citeturn8view0 | Für Mining‑Integrationen testen; Issues mit [Bridge] taggen |
| simpa Simulation | Rusty‑Kaspa Tool | dev‑/research‑tauglich citeturn24view0 | `cargo run --bin simpa …` citeturn24view0 | ISC citeturn8view0 | Für Last/Delay‑Simulation im CI nutzen |
| Override params | Rusty‑Kaspa Feature | lokal/test only; blockiert auf Mainnet citeturn25view0 | `--override-params-file` citeturn25view0 | ISC citeturn8view0 | Extreme Parameter testen; reproduzierbare Experimente dokumentieren |

### Architektur‑Skizze (typische App‑Integration)

```mermaid
flowchart LR
  A[App / Service] -->|gRPC| B[Kaspad Node]
  A -->|WebSocket wRPC JSON/Borsh| B
  B --> C[P2P Netzwerk / BlockDAG]
  A -->|REST (Indexer)| D[REST API Server]
  D --> E[(PostgreSQL Index DB)]
  B -->|Indexer ingestion| E
  A --> F[Wallet / Key Mgmt]
```

## SDKs, APIs und Bibliotheken

### SDK‑Landschaft: “Canonical” vs. “Convenience”

Es gibt drei dominante Integrationspfade:

1. **Direkt an den Node per gRPC / WebSocket‑RPC** (präzise, “source of truth”). citeturn19view0turn24view0turn3search23  
2. **WASM/JS‑SDK** für Browser/NodeJS‑Apps (praktisch, inkl. Wallet/Tx‑Builder). Rusty‑Kaspa enthält Build‑ und Release‑Mechanik für WASM. citeturn9view2turn24view0turn16search11  
3. **Explorer/Indexer‑basierte REST APIs** (bequem für Queries/Analytics, weniger “authoritative” als eigener Node; empfohlen, selbst zu hosten). citeturn3search3turn3search4turn3search10

### WASM SDK (JavaScript/TypeScript)

- Build/Release‑Integration im Rusty‑Kaspa Repo (Scripts wie `./build-release`, `./build-web`, `./build-nodejs`). citeturn9view2turn23view0  
- Doku/Guide (WIP) nennt WASM‑SDK als direkte Exposition der Rust‑Crates; wRPC‑Connectivity wird als async API abgebildet. citeturn16search11turn24view0  
- Sicherheits‑Hinweis aus dem SDK‑Projektumfeld: Dev‑Builds nicht für Produktion; für High‑Security Use‑Cases eher GitHub‑Releases oder selbst bauen. citeturn9view2turn28search1  
- Beispiele befinden sich im Repo/WASM‑Examples. citeturn28search17  

### Rust‑Crates (Node, Wallet, PSKT)

- Das Rusty‑Kaspa Repo ist in viele Crates modularisiert; es gibt außerdem RustDoc‑Links/Crate‑Dokus. citeturn3search22turn24view2  
- Wallet‑Core Framework: docs.rs beschreibt es als multiplattformigen Wallet‑Framework‑Baukasten. citeturn28search8  
- Partially Signed Kaspa Transactions (PSKT): eigenes Crate. citeturn16search27  

### REST‑API (Explorer‑/Indexer‑basiert)

- Offizieller öffentlicher Endpoint: https://api.kaspa.org (Swagger UI) citeturn3search4  
- Implementierung: `kaspa-rest-server` (Python, MIT) – designed to operate on DB populated by indexer; Integratoren sollen **eigene Instanzen** betreiben. citeturn3search3  
- Indexer: `simply-kaspa-indexer` (PostgreSQL, Docker‑bereitgestellt). citeturn3search10  

### Vergleichstabelle: SDKs/APIs/Libraries

| Item | Sprache | Scope | Link | Maturity | Empfohlene nächste Schritte |
|---|---|---|---|---|---|
| gRPC proto (Rusty‑Kaspa) | Proto/gRPC | Canonical Node API | https://github.com/kaspanet/rusty-kaspa/tree/master/rpc/grpc/core/proto citeturn7search3 | stabil, versionieren! | Protos in Repo pinnen; Breaking Changes bei Hardforks prüfen |
| rpc.proto (Detail) | Proto | Messages/Methods inkl. UTXO/Notify/RBF | https://raw.githubusercontent.com/kaspanet/rusty-kaspa/master/rpc/grpc/core/proto/rpc.proto citeturn19view0 | stabil, groß | In Client‑Gen integrieren; UTXO‑Index‑Abhängigkeiten beachten |
| WASM SDK (Build im Repo) | Rust→WASM + JS/TS | Tx‑Builder, Key Mgmt, Wallet, wRPC | https://github.com/kaspanet/rusty-kaspa citeturn9view2turn23view0 | produktiv nutzbar, Doku WIP | Release‑Versionen matchen; Beispiele als Template nutzen citeturn28search17 |
| Explorer REST API | HTTP/JSON | Query/Analytics; nicht Node‑authoritative | https://api.kaspa.org/ citeturn3search4 | stabiler Service, aber shared | Für Prod: eigenen REST‑Server + DB hosten citeturn3search3 |
| kaspa‑rest‑server | Python | REST‑Server (MIT) | https://github.com/kaspa-ng/kaspa-rest-server citeturn3search3 | stabil; Prod‑tauglich | Mit indexer + Postgres deployen; SLA selbst kontrollieren |
| simply‑kaspa‑indexer | Rust | Postgres‑Indexer | https://hub.docker.com/r/supertypo/simply-kaspa-indexer citeturn3search10 | aktiv (Docker) | Schema/Versionen fixieren; Migrationspfad planen |
| Kaspa Developer Platform (kas.fyi) | HTTP/JSON | API‑Gateway/Convenience | https://docs.kas.fyi/ citeturn16search10turn2search11 | Drittanbieter; abhängig von SLA | Nur für Prototyping; für Prod Selbsthosting bevorzugen |

## Testnet, lokale Entwicklung und Dev‑Tooling

### Netzwerkmodi: Mainnet, Testnet, Devnet, Simnet

Im RPC‑Schema werden u. a. Mainnet/Testnet/Simnet/Devnet genannt. citeturn19view0  
Rusty‑Kaspa dokumentiert explizit:
- Mainnet start: `cargo run --release --bin kaspad`  
- Testnet: `--testnet`  
- Devnet: `--devnet --enable-unsynced-mining …`  
- Simnet/Simulation: **simpa** als In‑Process‑Netzwerksimulation. citeturn23view0turn24view0  

Zusätzlich existiert das Konzept alternativer Testnet‑IDs via `--netsuffix=<id>` (z. B. testnet‑11). citeturn22search3turn12view0

### Öffentliche Testnets und Faucets

Community/Docs nennen mehrere Testnets:
- **Testnet‑10** und **Testnet‑11** sind breit dokumentiert (Explorer/REST/Faucets). citeturn7search1turn7search0turn7search16  
- Faucet‑URLs (Beispiele):  
  - TN10: https://faucet-tn10.kaspanet.io/ citeturn7search1  
  - TN11: https://faucet-tn11.kaspanet.io/ citeturn7search1  
- Explorer‑URLs:  
  - Mainnet: https://explorer.kaspa.org citeturn7search16  
  - TN10: https://explorer-tn10.kaspa.org citeturn7search16  
  - TN11: https://explorer-tn11.kaspa.org citeturn7search16  
- REST Endpoints (Explorer‑API):  
  - Mainnet: https://api.kaspa.org/docs citeturn7search16  
  - TN10: https://api-tn10.kaspa.org/docs citeturn7search16  
  - TN11: https://api-tn11.kaspa.org/docs citeturn7search16  

### Testnet‑12 (experimentell, “covenants”)

Im offiziellen Repo existiert ein Guide für “Testnet 12” auf einem Entwicklungs‑Branch (covpp) mit dediziertem P2P‑Port und **Rothschild** (Tx‑Generator) als Teil des Setups. citeturn12view0  
- Doc: https://raw.githubusercontent.com/kaspanet/rusty-kaspa/covpp/docs/testnet12.md citeturn12view0  
- Besonderheiten: `--testnet --netsuffix=12 --utxoindex`, empfohlenes Hardware‑Profil, Mining via cpuminer release. citeturn12view0  
- Maturity: experimental; gut für Feature‑Testing, nicht als Default‑Devnetz.  
- Nächste Schritte: Nur einsetzen, wenn Ihr Projekt explizit Covenant‑bezogene Features testen muss; ansonsten Devnet/Simnet bevorzugen.

### Lokale Tools: simpa, override‑params, rothschild

Rusty‑Kaspa liefert mehrere “Developer‑Grade” Werkzeuge:
- **simpa**: In‑Process Simulation (Delay, BPS, Tx‑Load). citeturn24view0  
- **override‑params**: lokale Consensus‑Parameter überschreiben (Mainnet ist blockiert). citeturn25view0  
- **rothschild**: Tx‑Generator im Testnet‑12‑Setup beschrieben (Wallet + TPS‑Sends). citeturn12view0  
- Heap‑Profiling & Logging‑Filter (RUST_LOG / `--loglevel`). citeturn24view2turn21view0  

### Container‑ und Docker‑Assets

entity["company","Docker","container platform"]  
- Rusty‑Kaspa beschreibt Docker Builds (single/multi‑arch) und liefert Scripts. citeturn9view1turn9view2  
- Ein offizielles Container‑Image wird ebenfalls angeboten: `kaspanet/rusty-kaspad` (Docker Hub). citeturn22search33  
- Für REST‑API gibt es `kaspanet/kaspa-rest-server` Images. citeturn22search30  

### Workflow‑Skizze: Reproduzierbare lokale Entwicklung

```mermaid
flowchart TD
  A[Dev Laptop/CI] --> B[Start kaspad --devnet --utxoindex]
  B --> C[Mine/Generate Blocks: enable-unsynced-mining]
  A --> D[Run simpa for load/delay scenarios]
  A --> E[Build Tx with WASM SDK or Rust wallet crates]
  E --> F[SubmitTransaction via gRPC or wRPC]
  B --> G[(Optional) Indexer + Postgres + REST API]
  G --> H[Integration tests: Explorer-like queries]
```

## Wallets, Key‑Management und Hardware‑Wallet‑Support

### Wallet‑Grundlagen im Kaspa‑Kontext

Kaspa nutzt ein UTXO‑Modell; viele Wallet‑Operationen (Balance/UTXO‑Lookup by address, Address‑Notifications) hängen von einem **UTXO Index** auf dem Node ab. citeturn16search17turn19view0turn3search21  
Für Wallet‑Events und Zustände (pending, maturity, reorg etc.) existieren SDK‑Events. citeturn16search8

### Rusty‑Kaspa Wallet & CLI

Rusty‑Kaspa enthält:
- `kaspa-cli` (Terminal‑RPC + Wallet runtime) citeturn23view0turn22search14  
- lokalen Web‑Wallet‑Start (basic‑http‑server) citeturn9view2turn23view0  

Zusätzlich existieren Community‑/Ökosystem‑Tools wie eine JS‑basierte Wallet‑CLI von Aspectron, die viele gRPC Calls als Utility expose’t. citeturn27view1  
- Maturity: eher “Tooling/Utility” als offizielle Referenz; dennoch praktisch, um RPC zu explorieren. citeturn27view1

### Hardware‑Wallets (Ledger)

entity["company","Ledger","hardware wallet company"]  
- Offizielle Ledger‑Support‑Seite (DE) zur Kaspa‑App/Verwaltung in Ledger Wallet. citeturn2search2turn2search10  
- Ledger‑Coin‑Seite spricht über Nutzung mit KasVault (als UX‑Layer). citeturn2search6  
- Kaspa Wiki erklärt KasVault‑Grundlagen und verweist bei Support auf Discord‑Kanäle. citeturn2search30  

Für Entwickler‑Integrationen gibt es zusätzlich JS‑Bindings (z. B. `hw-app-kaspa`) als Ledger‑Transport‑Wrapper. citeturn28search33  

### Browser‑Wallets / dApp‑Integration

- Beispiel: KasWare Wallet Integration Docs (Browser‑API via `window.kasware`). citeturn16search18  
- Hinweis aus KasWare‑Docs: API kann sich ändern, wenn “offizielle Standards” kommen – für dApps sollten Sie Versionen und Feature‑Flags einplanen. citeturn16search18  

### Vergleichstabelle: Wallet‑/Key‑Bausteine

| Item | Einsatz | Link | Maturity | Nächste Schritte |
|---|---|---|---|---|
| Rusty‑Kaspa Wallet/CLI | Referenz‑Wallet, lokale Tools | https://github.com/kaspanet/rusty-kaspa citeturn23view0turn9view2 | stabil, aktiv | Für Dev: lokale Wallet starten; für Prod: Bibliotheken/SDK nutzen |
| Wallet Core (Rust) | Backend/SDK‑Baustein | https://docs.rs/kaspa-wallet-core citeturn28search8 | stabiler Baukasten | Key‑Derivation, UTXO‑Processing, Tx‑Builder als Basis |
| PSKT Crate | Multi‑Sig / Partials | https://docs.rs/kaspa-wallet-pskt citeturn16search27 | spezialisierter Baustein | Für Custody/Multi‑Party‑Flows evaluieren; Sicherheitsreview |
| Ledger Support (DE) | Hardware‑Wallet Nutzung | https://support.ledger.com/article/12665738333853-zd citeturn2search10 | production | Für Custody: klare Signing‑Flows, Adress‑Display/Verify |
| hw‑app‑kaspa | Ledger JS API | https://github.com/coderofstuff/hw-app-kaspa citeturn28search33 | community, nutzbar | In dApp/Client integrieren; Testnet‑Signing testen |
| KasWare Integration | Browser Wallet API | https://docs.kasware.xyz/wallet/dev-base/kaspa citeturn16search18 | produktiv, aber API‑änderungsfähig | Capability detection; Version pinnen; UX‑Security beachten |

## Protokollarchitektur, Konsens und Transaktionen

### BlockDAG, GHOSTDAG und Crescendo (10 BPS)

Kaspa beschreibt sich als PoW‑Netzwerk mit BlockDAG‑Ledger, in dem parallele Blöcke koexistieren und durch GHOSTDAG konsensual geordnet werden. citeturn7search12  
Der Crescendo‑Hardfork (KIP‑14) beschreibt die Umstellung von 1 BPS auf 10 BPS und benennt die Konsequenzen: Parameter‑Skalierung, Ghostdag‑K‑Rekalibrierung, Finality/Merge/Pruning Depth, Coinbase Maturity etc. citeturn14view0  
Das Rusty‑Kaspa Repo dokumentiert den Hardfork‑Zeitpunkt sowie die Rolle der KIPs (u. a. KIP‑9, KIP‑10, KIP‑13, KIP‑15) und markiert Rust‑Rewrite als Grundlage. citeturn9view0turn14view0

**Entwickler‑Implikation:** Viele Konstanten, die “in Blocks zählen”, repräsentieren nach BPS‑Änderungen weiterhin Zeit‑Dauern. Für Anwendungen, die Confirmations/Finality/Pruning “interpretieren”, ist es essentiell, an **DAA score / parameterisierte Tiefe** anzukoppeln statt hartcodierte Blockzahlen zu verwenden. citeturn14view0turn16search8

### DAGKnight (KIP‑2) als Roadmap‑Thema

Im KIPs‑Repo ist eine “Upgrade consensus to follow the DAGKNIGHT protocol” als KIP‑2 gelistet (Status: Proposed). citeturn6view0  
Die Kaspa‑Website kommuniziert DAGKnight als Whitepaper‑Ressource und berichtet über Whitepaper‑Updates (Zusammenfassung, nicht die volle Spec im Blogpost). citeturn29view0turn31search3  
**Pragmatisch:** Für Implementationsarbeit ist derzeit KIP‑2 + Research‑Forum + Code‑Branches die robustere Grundlage als reine Community‑Threads. citeturn6view0turn14view0

### Transaktionsformat, Felder und Payloads

Das (WIP) Docs‑Repo listet die Grundstruktur einer Transaktion (Version, Inputs/Outputs, Locktime, SubnetworkId, Gas, PayloadHash/Payload). citeturn18view0  
Im gRPC‑Schema (`RpcTransaction`) erscheinen Felder wie `subnetworkId`, `gas`, `payload`, und explizit `mass`. citeturn19view0  
KIP‑14 beschreibt explizit, dass im Hardfork **Payloads in nativen (non‑coinbase) Transaktionen** aktiviert werden und dass `sighash` dafür angepasst werden muss (payload hash). citeturn14view0  

**Nächste Schritte:**  
- Wenn Sie Payloads nutzen (z. B. Daten/Commit‑Reveal‑Patterns, L2‑Nachweise): prüfen Sie (a) aktuelle Aktivierung im Zielnetz, (b) Signing‑Implementierungen und (c) Spam‑/Mass‑Auswirkungen (KIP‑13/KIP‑9). citeturn14view0turn15view0

### Script Engine / “Smart Contracts” / Covenants

Kaspa hat eine Transaktions‑Skriptsprache (txscript). citeturn2search0  
KIP‑10 erweitert die Sprache um **Transaction Introspection Opcodes** sowie 8‑Byte‑Integer‑Arithmetik und nennt explizit, dass dadurch “sophisticated … conditional spending scenarios” möglich werden, inklusive Covenant‑ähnlicher Konstruktionen (z. B. additive/threshold patterns). citeturn13view0  
KIP‑14 integriert KIP‑10 als Teil des Crescendo‑Pakets und verknüpft Introspection‑Opcodes mit Covenant‑Konzepten sowie additive addresses/microtransactions. citeturn14view0  
Auf der Produkt‑/Roadmap‑Ebene positioniert Kaspa Smart‑Contract‑Funktionalität primär über L2‑Ansätze (z. B. based ZK‑Rollups), während L1 programmierbare Bausteine schrittweise erweitert werden. citeturn2search1turn3search33

**Realistische Einordnung (für Entwickler):**
- **Heute (L1):** UTXO + Script, zunehmend introspektiv; geeignet für “bounded programmability” (Covenants, Conditions, Commitments). citeturn13view0turn14view0  
- **Heute (Ecosystem):** “Programmability Mosaic” nennt u. a. EVM‑Umgebungen/L2‑Sequencing und indexing‑basierte Patterns (z. B. Inscriptions/KRC‑20‑Stil) – diese sind stark tool-/indexer‑abhängig. citeturn3search33  
- **Konsequenz:** Das Deployment‑/Tool‑Design muss explizit unterscheiden: “consensus‑valid” vs. “indexer‑interpretiert.” citeturn3search33turn3search3

### Mempool‑Regeln, Mass, Fees und Tx‑Chaining

**Mass‑Limits und Gebühren (praktische Regeln):**
- Transaktionsgebühr: `fees = sum(inputs) - sum(outputs)`; Mass‑Limits: Standard‑Tx‑Limit 100.000 (grams), Block‑Mass‑Limit 500.000. citeturn3search1turn16search3turn15view0  
- Mass‑Berechnung hat mehrere Komponenten (per‑byte, scriptPubKey bytes, sigops). citeturn16search3  
- Storage‑Mass (KIP‑9) dient zur Begrenzung von UTXO‑Bloat und kann Mempool/Mining/Consensus beeinflussen. citeturn15view0turn16search26  

**Mempool Auswahl / Fee‑Rate / QoS:**
- Doku nennt Fee‑Rate‑Priorisierung und verweist auf Fee‑Estimate RPC. citeturn3search8  

**Tx‑Chaining:**  
- Node akzeptiert Transaktionen, die Inputs aus dem UTXO‑Index oder aus im Mempool liegenden Transaktionen referenzieren; für viele Inputs/Outputs sind “batch/chained transactions” als Pattern dokumentiert (inkl. “virtual UTXO” mit DAA score = u64::MAX). citeturn16search19turn16search8  

**Replace‑by‑Fee / Replacement Path:**  
- gRPC Schema enthält explizit `SubmitTransactionReplacementRequestMessage` mit “mandatory Replace by Fee policy.” citeturn19view0  

## Infrastruktur, Monitoring, Deployment, Security, Community, Lizenz und offene Fragen

### Explorer und Indexing

Kaspa bietet einen offiziellen Explorer:
- https://explorer.kaspa.org (Mainnet) citeturn3search15turn3search34  
- Explorer listet u. a. Transaktions‑Ansichten und verweist auf 10 BPS Betrieb. citeturn16search24  

**REST‑Index‑Stack (empfohlen für produktive Backends):**
- `kaspa-rest-server` (Python, MIT) läuft live als `api.kaspa.org`, basiert auf Indexer‑DB; Integratoren sollen eigene Instanzen betreiben. citeturn3search3turn3search4  
- `simply-kaspa-indexer` (Rust, Postgres) als High‑Performance Indexer. citeturn3search10  
- Docker Images existieren auch unter kaspanet. citeturn22search30

### Monitoring und Debugging

- Rusty‑Kaspa bietet Flags für Performance‑Logs und einen **Prometheus‑Metrics Endpoint** über `--perf-metrics`; es existieren Issues zu Port‑Konfiguration (z. B. bind auf 0.0.0.0:7000 unter Windows). citeturn21view0turn20search2turn23view1  
- Logging‑Filter via `RUST_LOG` oder `--loglevel` (inkl. Subsystem‑Filter). citeturn24view2turn21view0  
- Simulation/Benchmarking: simpa, cargo bench, nextest, heap profiling und dhat‑viewer. citeturn24view0turn24view2  
- Community stellt Grafana Dashboards bereit (z. B. “Kaspa Node Monitoring Dashboard”). citeturn20search1  

### Deployment‑ und CI/CD‑Patterns

Für reproduzierbare Builds und sichere Deployments sind diese repo‑nahen Patterns sinnvoll:
- Build‑From‑Source: klar dokumentierte Prereqs (Protobuf, LLVM/clang, wasm32 target). citeturn9view0turn9view1  
- Docker Build: `docker/Dockerfile.kaspad` und Multi‑Arch Script `build-docker-multi-arch.sh`. citeturn9view1turn9view2  
- Tests/Lints: `cargo test --release`, `cargo nextest`, `./check`. citeturn24view1turn24view2  
- Parameterisierte Testumgebungen: devnet/simnet + override‑params + simpa‑DB‑Replay. citeturn25view0turn24view2  

**Empfohlene CI‑Schablone:**  
- Matrix (linux/amd64, linux/arm64)  
- Build (stable branch) → Tests/nextest → Integration Tests (devnet + basic RPC smoke) → Docker build/push (versioned tags). citeturn9view2turn24view1  

### Security Best Practices

**Node‑Security / RPC‑Exposure**
- Crescendo‑Guide empfiehlt `--disable-upnp` (besonders für Pools/Exchanges) und rät dazu, RPC‑Binding bewusst zu setzen (127.0.0.1 vs 0.0.0.0). citeturn21view0  
- `--unsaferpc` nur nutzen, wenn RPC nicht öffentlich ist (Peer‑Management über RPC). citeturn21view0  
- wRPC/Borsh verlangt Build‑Match zwischen Client und Server; das ist ein Supply‑Chain/Version‑Thema, das Sie im Build‑System absichern müssen. citeturn24view0turn3search23  

**Wallet/Key‑Security**
- Hardware‑Wallet‑Pfad (Ledger) für High‑Value Keys; bei Browser‑Wallet‑Integrationen Capability detection und “user‑gesture only” Connect‑Flows (wie in KasWare‑Docs). citeturn2search10turn16search18  
- Für Multi‑Party‑Signing: PSKT‑Bausteine + klare Rollen/Exchange‑Formate; zusätzlicher Security Review empfohlen. citeturn16search27turn13view0  

### Community‑ und Forschungsressourcen

entity["company","Discord","chat platform"]  
- Offizieller Einstieg verweist explizit auf Community‑Kanäle wie Discord; zentrale Support‑Orte sind u. a. #development/#testnet (abhängig vom Use‑Case). citeturn7search12turn12view0turn16search11  

Weitere relevante Ressourcen:
- Kaspa Research Forum: https://research.kas.pa (in KIPs als Comments‑URI verlinkt). citeturn14view0turn6view0  
- Community Wiki (Testnets, CLI Node/Wallet): https://wiki.kaspa.org citeturn7search1turn20search34turn7search10  
- Kaspa Q&A (Stack‑ähnlich): https://qa.kas.pa citeturn5search8  
- Tutorials/Guides auf kaspa.org: z. B. CLI Wallet Tutorial. citeturn22search11  

### Lizenz‑ und Legal‑Aspekte

- Rusty‑Kaspa: ISC License. citeturn8view0  
- Go kaspad: ISC License. citeturn26view0  
- kaspa‑rest‑server: MIT License. citeturn3search3  

**Praktische Konsequenzen:**
- In kommerziellen Produkten müssen Sie Lizenztexte/Notices korrekt weiterführen (ISC/MIT sind permissiv, aber nicht “ohne Pflichten”). citeturn8view0turn3search3turn26view0  
- Drittanbieter‑APIs (z. B. kas.fyi) bringen eigene ToS/SLA‑Risiken; für kritische Infrastruktur sollte Self‑Hosting Priorität haben. citeturn3search3turn16search10  

### Offene Forschungs‑ und Engineering‑Fragen

**DAG‑Konsens & Anreize**
- Forschung zu Anreiz‑Angriffen bei DAG‑Protokollen mit Random Transaction Selection (RTS) diskutiert potenzielle Schwachstellen und Auswirkungen auf Dezentralisierung/Throughput. Kaspa wird in der Literatur als Implementierung von GHOSTDAG referenziert. citeturn1search27turn1academia35turn1academia36  
- Für Entwickler folgt daraus: Wenn Ihr System von Miner‑Policies/Mempool‑Selection abhängt (Fees, Priorisierung, Anti‑spam), müssen Sie Policy‑Änderungen und Relayer‑Verhalten als “beweglichen Teil” behandeln und gegen aktuelle Node‑Versionen testen. citeturn3search8turn15view0turn24view0  

**Dimensionierung bei höheren BPS**
- Crescendo/KIP‑14 nennt explizit steigende Anforderungen an Bandbreite/Storage/Performance und umfasst Parameter‑Anpassungen (z. B. Ghostdag K, pruning depth). citeturn14view0turn21view0  
- Offene Engineering‑Frage: Wie stabil bleiben Ecosystem‑Komponenten (Indexer, Explorer‑DBs, Wallet‑Processors) bei künftig höherem TPS/BPS, und welche Backpressure‑/Batching‑Strategien sind nötig? citeturn3search10turn16search8turn24view0  

**Programmierung: L1 Script vs L2**
- KIP‑10 liefert Bausteine für covenants/conditions; KIP‑14 aktiviert payloads und macht L2‑Designs (Ordering/Data Availability) plausibler; gleichzeitig betont die “Programmability Mosaic” eine mehrspurige Roadmap (EVM‑Umgebungen, indexing‑basierte Patterns, rollups). citeturn13view0turn14view0turn3search33  
- Offene Produktfrage: Welche “Standards” (Wallet‑APIs, Token/Inscription‑Conventions, proof formats) werden sich de‑facto durchsetzen, und wie reduziert man Vendor‑Lock‑in zu spezifischen Indexern? citeturn16search18turn3search3turn3search33  

**Empfohlene nächste Schritte (für ein Entwicklerteam ab heute):**
- Entscheiden Sie, ob Ihr Projekt **Consensus‑kritisch** ist (dann Node‑RPC + eigene Infrastruktur) oder ob “Indexer‑Semantik” ausreicht (dann REST/Explorer‑Stack). citeturn3search3turn19view0  
- Bauen Sie eine lokale CI‑Testmatrix: devnet/simnet (kaspad) + simpa Lastprofile + Tx‑Erzeugung (WASM/Rust). citeturn23view0turn24view0turn25view0  
- Implementieren Sie Transaktionslogik strikt entlang **Mass/Storage‑Mass** und Fee‑Rate; testen Sie Chaining‑Patterns und Replacement‑Flows. citeturn15view0turn16search19turn19view0  
- Für Wallet‑Security: Hardware‑Wallet‑Pfad (Ledger) für echte Werte; in Testnets mit klaren Signing‑Schnittstellen und Address‑Verification arbeiten. citeturn2search10turn28search33