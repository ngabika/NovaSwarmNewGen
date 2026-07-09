export type Locale = "hu" | "en" | "de" | "fr" | "es" | "it" | "pt" | "ru" | "zh" | "ja" | "ar";

type Translations = {
  nav: { chat: string; kanban: string; orgChart: string; terminal: string; auditLog: string; settings: string };
  setup: {
    title: string; step: string; of: string; next: string; back: string; finish: string; skip: string;
    lang: string; langDesc: string;
    apiKeys: string; apiKeysDesc: string; geminiKey: string; openaiKey: string; anthropicKey: string; openrouterKey: string; orLocalOnly: string;
    telegram: string; telegramDesc: string; botToken: string; chatId: string;
    profile: string; profileDesc: string; profilePlaceholder: string;
    firstAgent: string; firstAgentDesc: string; agentName: string; agentRole: string; agentInstruction: string;
    archetypes: { general: string; dev: string; business: string; ops: string };
    hostAccess: string; hostAccessDesc: string; grant: string; deny: string;
  };
  chat: { placeholder: string; send: string; thinking: string; noConversation: string; newChat: string };
  kanban: { todo: string; inProgress: string; done: string; addCard: string; title: string; description: string; assignTo: string; noCards: string };
  settings: {
    title: string; apiKeys: string; addKey: string; provider: string; label: string; secret: string;
    telegram: string; enabled: string; botToken: string; chatId: string;
    limits: string; dailyLimit: string; limitEnabled: string;
    ollama: string; ollamaUrl: string; ollamaModel: string;
    host: string; hostGranted: string; hostRevoke: string; hostGrant: string;
    danger: string; emergencyStop: string; emergencyStopConfirm: string;
    save: string; saved: string;
  };
  audit: { title: string; empty: string; filter: string; all: string };
  hardware: { cpu: string; ram: string; disk: string; battery: string; charging: string; throttle: string };
  orgChart: { title: string; noAgents: string; depth: string };
  common: { loading: string; error: string; retry: string; delete: string; edit: string; cancel: string; confirm: string; yes: string; no: string };
};

const hu: Translations = {
  nav: { chat: "Chat", kanban: "Kanban", orgChart: "Szervezet", terminal: "Terminál", auditLog: "Napló", settings: "Beállítások" },
  setup: {
    title: "NovaSwarm beállítása", step: "Lépés", of: "/", next: "Tovább", back: "Vissza", finish: "Befejezés", skip: "Kihagyás",
    lang: "Válassz nyelvet", langDesc: "Ez lesz a teljes felület nyelve.",
    apiKeys: "AI-szolgáltató kulcsok", apiKeysDesc: "Add meg legalább egy kulcsot, vagy indulj csak lokális Ollama-val.",
    geminiKey: "Google Gemini API kulcs", openaiKey: "OpenAI API kulcs", anthropicKey: "Anthropic API kulcs", openrouterKey: "OpenRouter API kulcs", orLocalOnly: "Csak lokális Ollama",
    telegram: "Telegram (opcionális)", telegramDesc: "Bot token és chat-azonosító — bármikor pótolható később.",
    botToken: "Bot token", chatId: "Chat / csoport azonosító",
    profile: "Mutatkozz be!", profileDesc: "Ki vagy, mivel foglalkozol, milyen stílusban kommunikálj.",
    profilePlaceholder: "Pl. Fejlesztő vagyok, NovaSwarm-mal autonóm feladatokat szeretnék automatizálni...",
    firstAgent: "Első ágens", firstAgentDesc: "Ez lesz az egyetlen ágens, amivel a rendszer elindul.",
    agentName: "Ágens neve", agentRole: "Szerepkör", agentInstruction: "Alap személyiség / rendszerutasítás",
    archetypes: { general: "Általános Asszisztens", dev: "Fejlesztő Copilot", business: "Üzleti Tanácsadó", ops: "Rendszerüzemeltető" },
    hostAccess: "Gazdagép-hozzáférés", hostAccessDesc: "Engedélyezed-e, hogy az ágensek a gazdagépen dolgozzanak (fájlrendszer, parancsok, csomagok)?",
    grant: "Igen, engedélyezem", deny: "Nem, sandboxolva marad",
  },
  chat: { placeholder: "Üzenj az ágensnek...", send: "Küldés", thinking: "Gondolkodik...", noConversation: "Válassz ágenst a bal oldali listából.", newChat: "Új beszélgetés" },
  kanban: { todo: "Teendő", inProgress: "Folyamatban", done: "Kész", addCard: "Új kártya", title: "Cím", description: "Leírás", assignTo: "Hozzárendelt ágens", noCards: "Nincs kártya ebben az oszlopban." },
  settings: {
    title: "Beállítások", apiKeys: "API kulcsok", addKey: "Kulcs hozzáadása", provider: "Szolgáltató", label: "Megnevezés", secret: "Kulcs (titkos)",
    telegram: "Telegram", enabled: "Engedélyezve", botToken: "Bot token", chatId: "Chat ID",
    limits: "Napi limit", dailyLimit: "Napi API-költés limit (USD)", limitEnabled: "Limit bekapcsolva",
    ollama: "Lokális Ollama", ollamaUrl: "Ollama URL", ollamaModel: "Modell",
    host: "Gazdagép-hozzáférés", hostGranted: "Engedélyezve", hostRevoke: "Visszavonás", hostGrant: "Engedélyezés",
    danger: "Veszélyes műveletek", emergencyStop: "Vészleállító", emergencyStopConfirm: "Biztosan leállítod az összes ágensfolyamatot?",
    save: "Mentés", saved: "Mentve ✓",
  },
  audit: { title: "Audit napló", empty: "Nincs naplóbejegyzés.", filter: "Szűrő", all: "Minden" },
  hardware: { cpu: "CPU", ram: "RAM", disk: "Tárhely", battery: "Akkumulátor", charging: "Töltés alatt", throttle: "⚠️ Háttérfolyamatok lassítva (hő / alacsony akkumulátor)" },
  orgChart: { title: "Szervezeti ábra", noAgents: "Nincsenek ágensek.", depth: "Szint" },
  common: { loading: "Betöltés...", error: "Hiba", retry: "Újra", delete: "Törlés", edit: "Szerkesztés", cancel: "Mégse", confirm: "Megerősítés", yes: "Igen", no: "Nem" },
};

const en: Translations = {
  nav: { chat: "Chat", kanban: "Kanban", orgChart: "Org Chart", terminal: "Terminal", auditLog: "Audit Log", settings: "Settings" },
  setup: {
    title: "NovaSwarm Setup", step: "Step", of: "of", next: "Next", back: "Back", finish: "Finish", skip: "Skip",
    lang: "Choose your language", langDesc: "This will be the language for the entire interface.",
    apiKeys: "AI Provider API Keys", apiKeysDesc: "Provide at least one key, or start with local Ollama only.",
    geminiKey: "Google Gemini API Key", openaiKey: "OpenAI API Key", anthropicKey: "Anthropic API Key", openrouterKey: "OpenRouter API Key", orLocalOnly: "Local Ollama only",
    telegram: "Telegram (optional)", telegramDesc: "Bot token and chat ID — can be added later.",
    botToken: "Bot token", chatId: "Chat / group ID",
    profile: "Introduce yourself!", profileDesc: "Who you are, what you do, how you want the system to communicate.",
    profilePlaceholder: "E.g. I'm a developer who wants to automate tasks with NovaSwarm...",
    firstAgent: "First Agent", firstAgentDesc: "This is the only agent the system starts with.",
    agentName: "Agent name", agentRole: "Role", agentInstruction: "Base personality / system instruction",
    archetypes: { general: "General Assistant", dev: "Developer Copilot", business: "Business Advisor", ops: "Systems Administrator" },
    hostAccess: "Host Access", hostAccessDesc: "Allow agents to work on the host machine (filesystem, commands, packages)?",
    grant: "Yes, allow access", deny: "No, keep sandboxed",
  },
  chat: { placeholder: "Message the agent...", send: "Send", thinking: "Thinking...", noConversation: "Select an agent from the left.", newChat: "New chat" },
  kanban: { todo: "To Do", inProgress: "In Progress", done: "Done", addCard: "Add card", title: "Title", description: "Description", assignTo: "Assigned agent", noCards: "No cards in this column." },
  settings: {
    title: "Settings", apiKeys: "API Keys", addKey: "Add Key", provider: "Provider", label: "Label", secret: "Secret Key",
    telegram: "Telegram", enabled: "Enabled", botToken: "Bot token", chatId: "Chat ID",
    limits: "Daily Limit", dailyLimit: "Daily API spend limit (USD)", limitEnabled: "Limit enabled",
    ollama: "Local Ollama", ollamaUrl: "Ollama URL", ollamaModel: "Model",
    host: "Host Access", hostGranted: "Granted", hostRevoke: "Revoke", hostGrant: "Grant",
    danger: "Danger Zone", emergencyStop: "Emergency Stop", emergencyStopConfirm: "Stop all agent processes?",
    save: "Save", saved: "Saved ✓",
  },
  audit: { title: "Audit Log", empty: "No log entries.", filter: "Filter", all: "All" },
  hardware: { cpu: "CPU", ram: "RAM", disk: "Disk", battery: "Battery", charging: "Charging", throttle: "⚠️ Background tasks throttled (heat / low battery)" },
  orgChart: { title: "Org Chart", noAgents: "No agents.", depth: "Level" },
  common: { loading: "Loading...", error: "Error", retry: "Retry", delete: "Delete", edit: "Edit", cancel: "Cancel", confirm: "Confirm", yes: "Yes", no: "No" },
};

const LOCALES: Partial<Record<Locale, Translations>> = { hu, en };

export function t(locale: Locale): Translations {
  return LOCALES[locale] ?? en;
}

export const LANGUAGE_OPTIONS: { code: Locale; name: string; native: string }[] = [
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "en", name: "English", native: "English" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ar", name: "Arabic", native: "العربية" },
];
