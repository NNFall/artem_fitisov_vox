import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE, api } from "./api";
import type { Call, Campaign, CampaignDetail, Contact, Dashboard, ImportResult } from "./types";

type Tab = "dashboard" | "campaigns" | "calls";
type GlyphName =
  | "brand"
  | "dashboard"
  | "campaigns"
  | "calls"
  | "contacts"
  | "queue"
  | "done"
  | "error"
  | "upload"
  | "worker"
  | "refresh"
  | "logout"
  | "alert"
  | "search"
  | "play"
  | "pause"
  | "redo"
  | "clock"
  | "save"
  | "close";

const statusLabels: Record<string, string> = {
  active: "запущена",
  paused: "на паузе",
  pending: "ожидает",
  scheduled: "запланирована",
  starting: "запускается",
  started: "сценарий запущен",
  in_progress: "идёт звонок",
  completed: "завершено",
  failed: "ошибка",
  finalized: "завершено",
  call_timeout: "не взяли трубку",
  call_failed: "звонок не состоялся",
  call_disconnected: "звонок завершён",
  dial_error: "ошибка набора",
  empty_call_target: "нет номера",
  no_gemini_key: "нет ключа AI",
  gemini_create_error: "ошибка подключения AI",
  recording_ready: "запись готова",
  recording_failed: "ошибка записи",
  download_error: "запись не скачалась",
  started_no_url: "запись началась",
  requested_not_confirmed: "запись запрошена",
};

const navItems: Array<{ tab: Tab; label: string; icon: GlyphName }> = [
  { tab: "dashboard", label: "Обзор", icon: "dashboard" },
  { tab: "campaigns", label: "Кампании", icon: "campaigns" },
  { tab: "calls", label: "Звонки", icon: "calls" },
];

function statusRu(value?: string | null) {
  if (!value) return "не указано";
  return statusLabels[value] || value;
}

function statusTone(value?: string | null) {
  if (value === "active" || value === "completed" || value === "finalized" || value === "call_disconnected") return "good";
  if (value === "failed" || value === "call_failed" || value === "call_timeout" || value === "dial_error") return "bad";
  if (value === "started" || value === "starting" || value === "in_progress") return "busy";
  return "muted";
}

function formatDate(value?: string | null) {
  if (!value) return "нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDelay(seconds?: number | null) {
  const value = Number(seconds || 0);
  if (value >= 60 && value % 60 === 0) return `${value / 60} мин`;
  return `${value} сек`;
}

function formatDuration(seconds?: number | null) {
  const value = Number(seconds || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function compactText(value?: string | null, fallback = "нет данных") {
  const text = String(value || "").trim();
  return text || fallback;
}

function Glyph({ name, size = 18, className = "" }: { name: GlyphName; size?: number; className?: string }) {
  const glyphClassName = ["glyph", className].filter(Boolean).join(" ");
  const common = {
    className: glyphClassName,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };
  const stroke = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "brand") {
    return (
      <svg {...common}>
        <path d="M5.5 15.5v-4.2C5.5 7.8 8.2 5 12 5s6.5 2.8 6.5 6.3v4.2" {...stroke} />
        <path d="M7.8 14.2h2.4v5H7.8c-1.1 0-1.8-.7-1.8-1.8v-1.4c0-1.1.7-1.8 1.8-1.8Z" {...stroke} />
        <path d="M16.2 14.2h-2.4v5h2.4c1.1 0 1.8-.7 1.8-1.8v-1.4c0-1.1-.7-1.8-1.8-1.8Z" {...stroke} />
        <path d="M10 9.8c1.6-1 2.8-1 4 0" {...stroke} />
      </svg>
    );
  }

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <path d="M4.5 6.5h5v5h-5v-5ZM14.5 5h5v8h-5V5ZM4.5 15h5v3.5h-5V15ZM14.5 16h5v2.5h-5V16Z" {...stroke} />
        <path d="M7 9h.1M17 9h.1M7 17h.1M17 17h.1" {...stroke} />
      </svg>
    );
  }

  if (name === "campaigns") {
    return (
      <svg {...common}>
        <path d="M6 6.5h9.5c2 0 3.5 1.5 3.5 3.5v7.5H8.5c-2 0-3.5-1.5-3.5-3.5V6.5Z" {...stroke} />
        <path d="M8.5 10h6.8M8.5 13.5h4.6M17.5 17.5 20 20" {...stroke} />
      </svg>
    );
  }

  if (name === "calls") {
    return (
      <svg {...common}>
        <path d="M7.2 5.2 10 8l-1.7 2c.9 1.9 2.3 3.3 4.2 4.2l2-1.7 2.8 2.8-1.1 2.8c-.3.8-1.1 1.2-2 1-5.2-1.1-9.4-5.3-10.5-10.5-.2-.9.2-1.7 1-2l2.5-1.4Z" {...stroke} />
        <path d="M15.5 5.5c1.8.5 3 1.8 3.5 3.5M14.6 8.4c.9.3 1.5.9 1.8 1.8" {...stroke} />
      </svg>
    );
  }

  if (name === "contacts") {
    return (
      <svg {...common}>
        <path d="M8.5 12.2c-1.7 0-3-1.4-3-3s1.3-3 3-3 3 1.4 3 3-1.3 3-3 3Z" {...stroke} />
        <path d="M3.8 19c.5-2.8 2.1-4.2 4.7-4.2s4.2 1.4 4.7 4.2" {...stroke} />
        <path d="M15.2 7h4.8M15.2 11h4.8M15.2 15h3.2" {...stroke} />
      </svg>
    );
  }

  if (name === "queue") {
    return (
      <svg {...common}>
        <path d="M5 7h8M5 12h6M5 17h9" {...stroke} />
        <path d="M17 7h2M15 12h4M17 17h2" {...stroke} />
        <path d="M19 7v10" {...stroke} />
      </svg>
    );
  }

  if (name === "done") {
    return (
      <svg {...common}>
        <path d="M12 20c4.4 0 8-3.6 8-8s-3.6-8-8-8-8 3.6-8 8 3.6 8 8 8Z" {...stroke} />
        <path d="m8.3 12.2 2.2 2.2 5-5" {...stroke} />
      </svg>
    );
  }

  if (name === "error") {
    return (
      <svg {...common}>
        <path d="M12 4.5 20 18H4l8-13.5Z" {...stroke} />
        <path d="M12 9v4M12 16.6h.1" {...stroke} />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg {...common}>
        <path d="M5 15.5v1.2c0 1.5 1.1 2.8 2.6 2.8h8.8c1.5 0 2.6-1.3 2.6-2.8v-1.2" {...stroke} />
        <path d="M12 15V5M8.4 8.6 12 5l3.6 3.6" {...stroke} />
        <path d="M8 12.5h8" {...stroke} />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M18.5 9.2c-.9-2.4-3.3-4.1-6.1-4.1-3.1 0-5.8 2.1-6.4 5" {...stroke} />
        <path d="M18.8 5.8v3.7h-3.7M5.5 14.8c.9 2.4 3.3 4.1 6.1 4.1 3.1 0 5.8-2.1 6.4-5" {...stroke} />
        <path d="M5.2 18.2v-3.7h3.7" {...stroke} />
      </svg>
    );
  }

  if (name === "logout") {
    return (
      <svg {...common}>
        <path d="M10.5 5.5H6.8c-1.2 0-2 .8-2 2v9c0 1.2.8 2 2 2h3.7" {...stroke} />
        <path d="M12.8 12h6M16.6 8.7 20 12l-3.4 3.3" {...stroke} />
      </svg>
    );
  }

  if (name === "alert") {
    return (
      <svg {...common}>
        <path d="M8.2 4.8h7.6l3.4 3.4v7.6l-3.4 3.4H8.2l-3.4-3.4V8.2l3.4-3.4Z" {...stroke} />
        <path d="M12 8.2v5M12 16.8h.1" {...stroke} />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <path d="M10.8 17.1a6.3 6.3 0 1 0 0-12.6 6.3 6.3 0 0 0 0 12.6Z" {...stroke} />
        <path d="m15.6 15.6 3.9 3.9" {...stroke} />
      </svg>
    );
  }

  if (name === "play") {
    return (
      <svg {...common}>
        <path d="M8 5.8v12.4l10-6.2L8 5.8Z" {...stroke} />
      </svg>
    );
  }

  if (name === "pause") {
    return (
      <svg {...common}>
        <path d="M8.4 5.5v13M15.6 5.5v13" {...stroke} />
      </svg>
    );
  }

  if (name === "redo") {
    return (
      <svg {...common}>
        <path d="M17.8 8.4c-1.3-2-3.4-3.2-5.9-3.2-3.9 0-7 3.1-7 7s3.1 7 7 7c2.3 0 4.4-1.1 5.7-2.8" {...stroke} />
        <path d="M18.2 4.8v3.9h-3.9" {...stroke} />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...common}>
        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" {...stroke} />
        <path d="M12 8v4.4l3 1.8" {...stroke} />
      </svg>
    );
  }

  if (name === "save") {
    return (
      <svg {...common}>
        <path d="M5.5 5.5h11.2l1.8 1.8v11.2h-13V5.5Z" {...stroke} />
        <path d="M8.5 5.5v5h6v-5M8.3 18.5v-5h7.4v5" {...stroke} />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg {...common}>
        <path d="m7.2 7.2 9.6 9.6M16.8 7.2l-9.6 9.6" {...stroke} />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 6.5h14v11H5z" {...stroke} />
      <path d="M8 10h8M8 14h5" {...stroke} />
    </svg>
  );
}

function campaignProgress(campaign: Campaign) {
  const stats = campaign.stats || {};
  const total = stats.total || 0;
  const completed = stats.completed || 0;
  const failed = stats.failed || 0;
  if (!total) return "контактов нет";
  return `${completed}/${total} завершено · ошибок ${failed}`;
}

function AppHeader({
  activeTab,
  onTab,
  onLogout,
  onRefresh,
  loading,
}: {
  activeTab: Tab;
  onTab: (tab: Tab) => void;
  onLogout: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Glyph name="brand" size={22} />
        </div>
        <div>
          <strong>Обзвон AI</strong>
          <span>Amix / Just Wood</span>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          return (
            <button
              type="button"
              key={item.tab}
              className={`nav-item ${activeTab === item.tab ? "active" : ""}`}
              onClick={() => onTab(item.tab)}
            >
              <Glyph name={item.icon} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>
          <Glyph name="refresh" size={17} className={loading ? "spin" : ""} />
          <span>Обновить</span>
        </button>
        <button type="button" className="ghost-button danger" onClick={onLogout}>
          <Glyph name="logout" size={17} />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login(username, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-badge">
          <Glyph name="brand" size={22} />
        </div>
        <h1>Панель обзвона</h1>
        <p>Вход для управления кампаниями, базами и историей звонков.</p>

        <label className="field">
          <span>Логин</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <div className="inline-error">
            <Glyph name="alert" size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="primary-button wide" disabled={loading}>
          {loading ? <Glyph name="refresh" size={17} className="spin" /> : <Glyph name="done" size={17} />}
          <span>{loading ? "Проверяю" : "Войти"}</span>
        </button>
      </form>
    </main>
  );
}

function Metric({ label, value, icon, tone = "neutral", detail }: { label: string; value: string | number; icon: GlyphName; tone?: string; detail?: string }) {
  return (
    <section className={`metric ${tone}`}>
      <div className="metric-icon">
        <Glyph name={icon} size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </section>
  );
}

function DashboardView({
  dashboard,
  onOpenCampaign,
}: {
  dashboard: Dashboard | null;
  onOpenCampaign: (id: number) => void;
}) {
  if (!dashboard) return <Skeleton title="Загружаю обзор" />;
  const failedCalls = dashboard.calls.recent.filter((call) => statusTone(call.status) === "bad").slice(0, 3);
  const runningCampaigns = dashboard.campaigns.recent.filter((campaign) => campaign.status === "active").length;

  return (
    <div className="view-stack">
      <div className="page-heading">
        <div>
          <p>Рабочее состояние</p>
          <h1>Обзор системы</h1>
        </div>
        <div className="heading-actions">
          <span className={`status-pill ${dashboard.worker.enabled ? "good" : "muted"}`}>
            Обработчик {dashboard.worker.enabled ? "включён" : "выключен"}
          </span>
          <span className="soft-code">порт 8002</span>
        </div>
      </div>

      <div className="metrics-grid">
        <Metric label="Кампаний" value={dashboard.campaigns.total} icon="campaigns" detail={`${runningCampaigns} запущено`} />
        <Metric label="Контактов" value={dashboard.contacts.total} icon="contacts" detail="в web-базе" />
        <Metric label="В очереди" value={dashboard.tasks.pending} icon="queue" tone="busy" detail={`${dashboard.tasks.active} в работе`} />
        <Metric label="Завершено" value={dashboard.tasks.completed} icon="done" tone="good" detail="по задачам" />
        <Metric label="Ошибок" value={dashboard.tasks.failed} icon="error" tone="bad" detail="требуют проверки" />
      </div>

      <section className="ops-ribbon">
        <div>
          <span>Текущая очередь</span>
          <strong>{dashboard.tasks.pending ? `${dashboard.tasks.pending} ожидают запуска` : "нет ожидающих задач"}</strong>
        </div>
        <div>
          <span>Параллельность</span>
          <strong>{dashboard.worker.max_concurrent_calls} звонок за раз</strong>
        </div>
        <div>
          <span>Проверка очереди</span>
          <strong>каждые {dashboard.worker.queue_interval_seconds} сек</strong>
        </div>
        <div>
          <span>Последний риск</span>
          <strong>{failedCalls[0] ? `${compactText(failedCalls[0].client_name, "Без имени")}: ${statusRu(failedCalls[0].status)}` : "критичных нет"}</strong>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel-title">
            <h2>Последние кампании</h2>
            <span>{dashboard.campaigns.recent.length}</span>
          </div>
          <div className="list-table">
            {dashboard.campaigns.recent.map((campaign) => (
              <button type="button" className="list-row" key={campaign.id} onClick={() => onOpenCampaign(campaign.id)}>
                <span>
                  <strong>#{campaign.id} {campaign.name}</strong>
                  <small>{campaignProgress(campaign)} · пауза {formatDelay(campaign.call_delay_seconds)} · {formatDate(campaign.updated_at)}</small>
                </span>
                <span className={`status-pill ${statusTone(campaign.status)}`}>{statusRu(campaign.status)}</span>
              </button>
            ))}
            {!dashboard.campaigns.recent.length ? <EmptyText text="Кампаний пока нет" /> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Последние звонки</h2>
            <span>{dashboard.calls.total}</span>
          </div>
          <div className="list-table">
            {dashboard.calls.recent.map((call) => (
              <div className="list-row static" key={call.id}>
                <span>
                  <strong>{compactText(call.client_name, "Без имени")}</strong>
                  <small>{compactText(call.client_phone || call.caller_phone)} · {formatDuration(call.duration)} · {formatDate(call.updated_at)}</small>
                </span>
                <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
              </div>
            ))}
            {!dashboard.calls.recent.length ? <EmptyText text="Звонков пока нет" /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: (result: ImportResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.upload(file);
      onUploaded(result);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="upload-panel" onSubmit={submit}>
      <div>
        <h2>Загрузить базу</h2>
        <p>XLSX, CSV или TSV. Кампания создаётся на паузе.</p>
      </div>
      <label className="file-drop">
        <Glyph name="upload" size={20} />
        <span>{file ? file.name : "Выберите файл"}</span>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      </label>
      {error ? <div className="inline-error"><Glyph name="alert" size={16} /><span>{error}</span></div> : null}
      <button type="submit" className="primary-button" disabled={!file || loading}>
        {loading ? <Glyph name="refresh" size={17} className="spin" /> : <Glyph name="upload" size={17} />}
        <span>{loading ? "Загружаю" : "Создать кампанию"}</span>
      </button>
    </form>
  );
}

function CampaignsView({
  campaigns,
  selected,
  onSelect,
  onUploaded,
  onAction,
}: {
  campaigns: Campaign[];
  selected: CampaignDetail | null;
  onSelect: (id: number) => void;
  onUploaded: (result: ImportResult) => void;
  onAction: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter((campaign) => `${campaign.id} ${campaign.name}`.toLowerCase().includes(needle));
  }, [campaigns, query]);

  return (
    <div className="campaign-layout">
      <section className="panel campaign-list-panel">
        <UploadPanel onUploaded={onUploaded} />
        <div className="search-box">
          <Glyph name="search" size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск кампании" />
        </div>
        <div className="campaign-list">
          {filtered.map((campaign) => (
            <button
              type="button"
              key={campaign.id}
              className={`campaign-item ${selected?.campaign.id === campaign.id ? "active" : ""}`}
              onClick={() => onSelect(campaign.id)}
            >
              <span>
                <strong>#{campaign.id} {campaign.name}</strong>
                <small>{campaign.stats?.total || 0} контактов · {formatDelay(campaign.call_delay_seconds)}</small>
              </span>
              <span className={`status-pill ${statusTone(campaign.status)}`}>{statusRu(campaign.status)}</span>
            </button>
          ))}
          {!filtered.length ? <EmptyText text="Ничего не найдено" /> : null}
        </div>
      </section>

      {selected ? (
        <CampaignDetailView detail={selected} onAction={onAction} />
      ) : (
        <section className="panel empty-detail">
          <Glyph name="campaigns" size={30} />
          <h2>Выберите кампанию</h2>
          <p>Здесь появятся контакты, статусы задач, звонки и управление запуском.</p>
        </section>
      )}
    </div>
  );
}

function CampaignDetailView({ detail, onAction }: { detail: CampaignDetail; onAction: () => void }) {
  const [delay, setDelay] = useState(String(detail.campaign.call_delay_seconds || 0));
  const [savingAction, setSavingAction] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDelay(String(detail.campaign.call_delay_seconds || 0));
  }, [detail.campaign.id, detail.campaign.call_delay_seconds]);

  async function runAction(action: "run" | "pause" | "rerun") {
    setSavingAction(action);
    setError("");
    try {
      await api.setCampaignStatus(detail.campaign.id, action);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    } finally {
      setSavingAction("");
    }
  }

  async function saveDelay() {
    setSavingAction("delay");
    setError("");
    try {
      await api.setDelay(detail.campaign.id, Number(delay || 0));
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить паузу");
    } finally {
      setSavingAction("");
    }
  }

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <p>Кампания #{detail.campaign.id}</p>
          <h1>{detail.campaign.name}</h1>
        </div>
        <span className={`status-pill ${statusTone(detail.campaign.status)}`}>{statusRu(detail.campaign.status)}</span>
      </div>

      <div className="actions-bar">
        <button type="button" className="primary-button" onClick={() => runAction("run")} disabled={savingAction !== ""}>
          {savingAction === "run" ? <Glyph name="refresh" size={16} className="spin" /> : <Glyph name="play" size={16} />}
          <span>Запустить</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => runAction("pause")} disabled={savingAction !== ""}>
          <Glyph name="pause" size={16} />
          <span>Пауза</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => runAction("rerun")} disabled={savingAction !== ""}>
          <Glyph name="redo" size={16} />
          <span>Повторить</span>
        </button>
        <label className="delay-control">
          <Glyph name="clock" size={16} />
          <span>Пауза, сек</span>
          <input value={delay} onChange={(event) => setDelay(event.target.value.replace(/\D/g, ""))} />
          <button type="button" onClick={saveDelay} disabled={savingAction !== ""}>
            <Glyph name="save" size={15} />
          </button>
        </label>
      </div>

      {error ? <div className="inline-error"><Glyph name="alert" size={16} /><span>{error}</span></div> : null}

      <div className="stats-strip">
        <Metric label="Всего" value={detail.campaign.stats?.total || 0} icon="contacts" />
        <Metric label="Ожидают" value={(detail.campaign.stats?.pending || 0) + (detail.campaign.stats?.scheduled || 0)} icon="queue" tone="busy" />
        <Metric label="Готово" value={detail.campaign.stats?.completed || 0} icon="done" tone="good" />
        <Metric label="Ошибки" value={detail.campaign.stats?.failed || 0} icon="error" tone="bad" />
      </div>

      <ContactTable contacts={detail.contacts} onSaved={onAction} />

      <section className="subsection">
        <div className="panel-title">
          <h2>Звонки кампании</h2>
          <span>{detail.calls.length}</span>
        </div>
        <CallsTable calls={detail.calls} compact />
      </section>
    </section>
  );
}

function ContactTable({ contacts, onSaved }: { contacts: Contact[]; onSaved: () => void }) {
  return (
    <section className="subsection">
      <div className="panel-title">
        <h2>Контакты</h2>
        <span>{contacts.length}</span>
      </div>
      <div className="data-table contact-table">
        <div className="table-head">
          <span>Контакт</span>
          <span>Компания</span>
          <span>Контекст</span>
          <span>Статус</span>
          <span></span>
        </div>
        {contacts.map((contact) => (
          <EditableContactRow key={contact.id} contact={contact} onSaved={onSaved} />
        ))}
        {!contacts.length ? <EmptyText text="Контактов нет" /> : null}
      </div>
    </section>
  );
}

function EditableContactRow({ contact, onSaved }: { contact: Contact; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: contact.name || "",
    phone: contact.phone || "",
    company: contact.company || "",
    context: contact.context || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      name: contact.name || "",
      phone: contact.phone || "",
      company: contact.company || "",
      context: contact.context || "",
    });
  }, [contact]);

  async function save() {
    setSaving(true);
    try {
      await api.updateContact(contact.id, draft);
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="table-row editing">
        <span className="edit-stack">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </span>
        <span><input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></span>
        <span><textarea value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} /></span>
        <span className={`status-pill ${statusTone(contact.task?.status)}`}>{statusRu(contact.task?.status)}</span>
        <span className="row-actions">
          <button type="button" className="icon-button" onClick={save} disabled={saving} title="Сохранить">
            {saving ? <Glyph name="refresh" size={15} className="spin" /> : <Glyph name="save" size={15} />}
          </button>
          <button type="button" className="icon-button" onClick={() => setEditing(false)} title="Отменить">
            <Glyph name="close" size={15} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <button type="button" className="table-row as-button" onClick={() => setEditing(true)}>
      <span>
        <strong>{compactText(contact.name, "Без имени")}</strong>
        <small>{contact.phone}</small>
      </span>
      <span>{compactText(contact.company)}</span>
      <span className="muted-text">{compactText(contact.context || contact.activity_type, "контекст не указан")}</span>
      <span className={`status-pill ${statusTone(contact.task?.status)}`}>{statusRu(contact.task?.status)}</span>
      <span className="row-hint">Редактировать</span>
    </button>
  );
}

function CallsView({ calls }: { calls: Call[] }) {
  return (
    <div className="view-stack">
      <div className="page-heading">
        <div>
          <p>История</p>
          <h1>Звонки</h1>
        </div>
        <span className="status-pill muted">{calls.length} записей</span>
      </div>
      <section className="panel">
        <CallsTable calls={calls} />
      </section>
    </div>
  );
}

function CallsTable({ calls, compact = false }: { calls: Call[]; compact?: boolean }) {
  return (
    <div className={`data-table calls-table ${compact ? "compact" : ""}`}>
      <div className="table-head">
        <span>Клиент</span>
        <span>Итог</span>
        <span>Длительность</span>
        <span>Запись</span>
      </div>
      {calls.map((call) => (
        <div className="table-row" key={call.id}>
          <span>
            <strong>{compactText(call.client_name, "Без имени")}</strong>
            <small>{compactText(call.client_phone || call.caller_phone)} · {formatDate(call.updated_at)}</small>
          </span>
          <span>
            <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
            <small className="summary-line" title={call.summary || ""}>{compactText(call.summary || call.outcome, "итог не указан")}</small>
          </span>
          <span>{formatDuration(call.duration)}</span>
          <span>
            {call.recording_download_url ? (
              <audio controls preload="none" src={`${API_BASE}${call.recording_download_url}`} />
            ) : (
              <span className="muted-text">нет файла</span>
            )}
          </span>
        </div>
      ))}
      {!calls.length ? <EmptyText text="Звонков пока нет" /> : null}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="empty-text">{text}</div>;
}

function Skeleton({ title }: { title: string }) {
  return (
    <div className="skeleton-panel">
      <Glyph name="refresh" size={20} className="spin" />
      <span>{title}</span>
    </div>
  );
}

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh(targetCampaignId = selectedCampaignId) {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const [dashboardData, campaignData, callsData] = await Promise.all([
        api.dashboard(),
        api.campaigns(),
        api.calls(80),
      ]);
      setDashboard(dashboardData);
      setCampaigns(campaignData);
      setCalls(callsData);
      const nextCampaignId = targetCampaignId || campaignData[0]?.id || null;
      setSelectedCampaignId(nextCampaignId);
      if (nextCampaignId) {
        setSelectedCampaign(await api.campaign(nextCampaignId));
      } else {
        setSelectedCampaign(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api
      .me()
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (authenticated) {
      void refresh();
    }
  }, [authenticated]);

  async function selectCampaign(id: number) {
    setSelectedCampaignId(id);
    setActiveTab("campaigns");
    setLoading(true);
    try {
      setSelectedCampaign(await api.campaign(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть кампанию");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setAuthenticated(false);
    setDashboard(null);
    setCampaigns([]);
    setSelectedCampaign(null);
    setCalls([]);
  }

  if (checkingAuth) return <Skeleton title="Проверяю доступ" />;
  if (!authenticated) return <LoginView onLogin={() => setAuthenticated(true)} />;

  return (
    <div className="app-shell">
      <AppHeader
        activeTab={activeTab}
        onTab={setActiveTab}
        onLogout={logout}
        onRefresh={() => void refresh()}
        loading={loading}
      />
      <main className="content">
        {error ? (
          <div className="top-error">
            <Glyph name="alert" size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>Закрыть</button>
          </div>
        ) : null}

        {activeTab === "dashboard" ? (
          <DashboardView dashboard={dashboard} onOpenCampaign={selectCampaign} />
        ) : null}

        {activeTab === "campaigns" ? (
          <CampaignsView
            campaigns={campaigns}
            selected={selectedCampaign}
            onSelect={selectCampaign}
            onUploaded={(result) => {
              setSelectedCampaignId(result.campaign.id);
              void refresh(result.campaign.id);
            }}
            onAction={() => void refresh(selectedCampaignId)}
          />
        ) : null}

        {activeTab === "calls" ? <CallsView calls={calls} /> : null}
      </main>
    </div>
  );
}
