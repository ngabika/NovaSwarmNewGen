# NovaSwarm 2.0 — Architektúra-dokumentum (v2: teljes rendszer)

> Ez a dokumentum a 18 szekciós architektúra-specifikáció alapján íródott.
> Az első kör (lásd git history) az öt alapkomponenst szállította
> (provider-failover, supervisor-sandbox, self-mod rollback, dreaming-ciklus,
> terminál). Ez a kör ERRE ÉPÍTVE a teljes futtatható rendszert adja: az
> ágens-motort, az Express szervert az összes REST route-tal, a Telegram-
> integrációt, az MCP-kezelést, és a teljes React felhasználói felületet.
>
> A "3.4 — bizonyított kész, nem állított kész" elvet itt is tartjuk: minden
> állítást tényleges `tsc --noEmit`, `vitest run`, `npm run build`,
> `vite build`, ÉS egy ténylegesen elindított szerveren futtatott valós
> HTTP-hívásokkal (smoke teszt) igazoltunk — nem csak a build sikerességét
> néztük.

## 1. Mi új ebben a körben

| Terület | Fájlok | Mit bizonyít |
|---|---|---|
| Adatmodell | `server/agents/types.ts` | A 7. pont ÖSSZES entitása (Agent, Settings, Message, Kanban, Memory, MCP, AuditLog, Skill) |
| Agent-store | `server/agents/agentStore.ts` | CRUD, tetszőlegesen mély hierarchia, Felügyelő-ágens (10.3) |
| Settings-store | `server/agents/settingsStore.ts` | Egyetlen igazság-forrás (3.1), nem-roncsoló merge új mezőknél |
| Message-store | `server/agents/messageStore.ts` | EGY közös tár Web UI-nak ÉS Telegramnak (16.1) |
| Kanban-store | `server/agents/kanbanStore.ts` | Teljes CRUD |
| Agent-motor | `server/agents/agentEngine.ts` | Dinamikus prompt-építés (SOSE statikus névlista), heartbeat-ciklus, explicit utasítás elsőbbsége (10.4), Felügyelő audit-logika (10.3) |
| Hardver-monitor | `server/system/hardwareMonitor.ts` | VALÓS metrikák (`systeminformation`), hő/akku-alapú throttle-jelzés (4.3) |
| MCP-kezelés | `server/mcp/mcpManager.ts` | VALÓS hálózati kapcsolat-teszt, sosem hamis "connected" (3.3, 12.2) |
| Telegram-bot | `server/telegram/telegramBot.ts` | `/statusz` `/kanban` `/modell` `/keres` `/leallitas`, ágens-megszólítás delegálás (16.2) |
| REST API | `server/routes/apiRoutes.ts` | Minden store-hoz teljes végpont-lefedettség |
| Express belépési pont | `server/index.ts` | Az összes szingleton összekötése, valós szerver-indítással tesztelve |
| React UI | `src/components/**` | Setup Wizard (6 lépés), Chat, Kanban, OrgChart, Settings, AuditLog, HardwareMonitor |

## 2. Tesztelési eredmények (ez a kör)

```
Test Files  18 passed (18)
     Tests  90 passed (90)
```

Ezen felül **valós szerver-szintű smoke teszt** történt (lásd 6. szakasz) —
ténylegesen elindított Node-folyamat, valós HTTP-kérésekkel, nem csak
egységtesztek.

## 3. Kulcsdöntések és miért

### 3.1 Az AgentEngine dinamikus prompt-építése (10.4 + a 6. pont záró bekezdése)

A specifikáció explicit kimondja: *"az egyetlen aktív ágens promptja
dinamikusan, a tényleges csapat-összetétel alapján épüljön fel, sose
statikus, beégetett névlistából."* Ez a `buildSystemPrompt()` függvényben
(agentEngine.ts) valósul meg: minden hívásnál frissen összeállítja a
csapattársak listáját `agentStore.getActive()`-ból — nincs sehol egy
kódba írt "Alice, Bob, Carol" jellegű lista.

### 3.2 A Felügyelő-ágens audit-logikája (10.3)

A `runSupervisorAudit()` minden aktív ágens legutóbbi válaszát átvizsgálja
gyanús mintákra (`"telepítettem"`, `"elküldtem"`, `"sikeresen futott"` stb.),
és ha talál ilyet, egy `supervisor` típusú audit-bejegyzést rögzít. Ez egy
KONZERVATÍV implementáció: a teljes "bizonyítsd be a tényleges
parancsvégrehajtást" logika (ami az `akció` típusú audit-bejegyzések
kereszthivatkozását igényelné) a következő kör finomítási pontja — jelenleg
minden nem-triviális állítást megjelöl felülvizsgálatra, ami a biztonságos
irányba téved (inkább több riasztás, mint hamis nyugalom).

### 3.3 Miért csak Ollama van ténylegesen bekötve a providerek közül?

A `server/index.ts` transport-rétege jelenleg az Ollama HTTP API-ját hívja
ténylegesen. A Gemini/OpenAI/Anthropic/OpenRouter kliensek megírása UGYANEZEN
`ProviderTransport` interfész mögé kerül — ez a határvonal már az első
körben is így volt megtervezve, pontosan azért, hogy ez a bővítés a
failover-logika érintése nélkül, izoláltan történhessen. Ezt itt is
explicit kimondjuk, nehogy "állított kész, nem bizonyított kész" benyomás
keletkezzen.

### 3.4 MCP-kapcsolat-teszt — bizonyítottan valós (3.3 elv)

A smoke tesztben (6. szakasz) egy ténylegesen nem létező végpontra
regisztráltunk egy MCP-szervert, és a `testConnection()` a VALÓS
`fetch failed` hibát adta vissza `"error"` státusszal — nem egy időzített
"sikeres" választ. Ez közvetlen bizonyíték arra, hogy a 3.3. elv
("valós állapot, nem ígéret") ténylegesen érvényesül, nem csak dokumentálva van.

### 3.5 A host-jogosultsági kapu végponttól-végpontig tesztelve

A smoke teszt igazolta, hogy egy `PATCH /api/settings {hostAccessGranted: true}`
hívás nemcsak a `settings.json`-t frissíti, hanem a KÜLÖN, a Terminál-
komponens által is használt `HostAccessGate` saját perzisztált állapotát is
— ugyanaz az egyetlen igazság-forrás mindkét helyről (3.1. elv).

## 4. Teljes mappastruktúra (frissítve)

```
novaswarm-newgen/
├── install.sh / update.sh / uninstall.sh
├── server/
│   ├── state/            (host-kapu, költséglimit, atomikus írás — 1. kör)
│   ├── providers/         (failover-lánc — 1. kör)
│   ├── supervisor/          (sandbox — 1. kör)
│   ├── selfmod/               (git-rollback — 1. kör)
│   ├── dreaming/                (Light/Deep/REM — 1. kör)
│   ├── terminal/                  (node-pty — 1. kör)
│   ├── agents/                      ✅ ÚJ: adatmodell, store-ok, agent-motor
│   ├── system/                       ✅ ÚJ: hardver-monitor
│   ├── mcp/                            ✅ ÚJ: MCP-kezelés valós kapcsolat-teszttel
│   ├── telegram/                         ✅ ÚJ: kétirányú Telegram-bot
│   ├── routes/                             ✅ ÚJ: teljes REST API
│   └── index.ts                              ✅ ÚJ: Express belépési pont
├── src/
│   ├── components/
│   │   ├── Terminal/       (1. kör)
│   │   ├── Setup/            ✅ ÚJ: 6 lépéses Setup Wizard
│   │   ├── Chat/               ✅ ÚJ
│   │   ├── Kanban/               ✅ ÚJ
│   │   ├── OrgChart/               ✅ ÚJ
│   │   ├── Settings/                 ✅ ÚJ
│   │   ├── AuditLog/                   ✅ ÚJ
│   │   ├── HardwareMonitor/              ✅ ÚJ
│   │   └── Layout/                         ✅ ÚJ
│   ├── hooks/useAppState.ts                  ✅ ÚJ
│   ├── lib/api.ts                              ✅ ÚJ
│   ├── locales/i18n.ts                           ✅ ÚJ (hu + en teljes; 9 további nyelv listázva, fordítás nélkül — lásd 5. szakasz)
│   └── App.tsx
└── memory-vault/   (üres, gitignore-olt)
```

## 5. Mi NEM része ennek a körnek sem (őszinte hatókör-elhatárolás)

- **Vektor-adatbázis és Obsidian-író modul** (14.1): a Dreaming-ciklus
  `DurableMemoryWriter`/`DreamJournalWriter` interfészeken keresztül készen
  áll a bekötésre, de a tényleges Vectra/LanceDB kliens nincs megírva.
- **Gemini/OpenAI/Anthropic/OpenRouter HTTP-kliensek**: lásd 3.3 szakasz.
- **Google-szolgáltatások OAuth2** (12.4): Gmail/Naptár/Drive/Fotók MCP-
  bekötés nincs implementálva.
- **Külső MCP/skill-katalógus import** (12.3).
- **Dinamikus skill-írás és a hozzá tartozó dry-run automatizmus** (12.1):
  a Felügyelő sandbox (1. kör) készen áll rá, de az ágens-oldali
  "írj egy új skillt" logika nincs megkötve hozzá.
- **Biztonsági mentés/visszaállítás UI és felhő-szinkron** (17.1–17.2).
- **OS-frissítés UI** (17.4) — a specifikáció szerinti jóváhagyási kapu
  (8.3) infrastruktúrája (a `/system/emergency-stop` mintájára) készen áll,
  de maga az OS-upgrade funkció nincs megírva.
- **9 további nyelv fordítása** (csak hu+en teljes; a többi 9 nyelv szerepel
  a nyelv-választóban, hogy a UI ne törjön el, de angolra esik vissza).
- **Cron-alapú időzített feladatok UI** (16.5).

## 6. Smoke teszt — valós szerver-indítással (nem csak build)

A `tsc`/`vitest`/`vite build` sikeressége önmagában nem bizonyítja, hogy a
sok összekötött szingleton (store-ok, engine, Express router-ek) ténylegesen
együttműködik futásidőben. Ezért egy ténylegesen elindított szerver-
folyamaton, valós HTTP-hívásokkal is ellenőriztük:

1. `GET /api/settings` → helyes alapértékek
2. `POST /api/onboarding/complete` → settings frissül, első ágens létrejön,
   Felügyelő-ágens AUTOMATIKUSAN létrejön
3. `POST /api/agents/:id/message` Ollama nélkül → **graceful, részletes
   hiba** kerül a beszélgetésbe (`"[gemini]: nincs konfigurált API kulcs |
   [ollama]: fetch failed"`), NEM crash — pontosan a 11.5. pont szerint
4. `POST /api/mcp` + `POST /api/mcp/:id/test` nem létező végpontra → VALÓS
   `"error"` állapot, `"fetch failed"` valós hibaszöveggel — sosem hamis
   "connected" (3.3. elv)
5. `PATCH /api/settings {hostAccessGranted: true}` → a KÜLÖN
   `HostAccessGate` perzisztált fájlja is frissül (nem csak a settings.json)
6. `POST /api/system/emergency-stop` → az audit naplóba ténylegesen bekerül
   a leállítás ténye

Ez a hat pont együtt azt bizonyítja, hogy a rendszer nem csak "lefordul",
hanem a store-ok, az engine és a REST réteg ténylegesen, helyesen
kommunikálnak egymással — beleértve a hibaágakat is.
