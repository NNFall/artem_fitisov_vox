import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FileSpreadsheet,
  Headphones,
  ListChecks,
  LogOut,
  Pause,
  PhoneCall,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";
import { API_BASE, api } from "./api";
import type { Call, Campaign, CampaignDetail, Contact, Dashboard, ImportResult } from "./types";

type Tab = "dashboard" | "campaigns" | "calls";

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
};

const navItems: Array<{ tab: Tab; label: string; icon: typeof Activity }> = [
  { tab: "dashboard", label: "Обзор", icon: Activity },
  { tab: "campaigns", label: "Кампании", icon: ListChecks },
  { tab: "calls", label: "Звонки", icon: PhoneCall },
];

function statusRu(value?: string | null) {
  if (!value) return "не указано";
  return statusLabels[value] || value;
}

function statusTone(value?: string | null) {
  if (value === "active" || value === "completed" || value === "finalized") return "good";
  if (value === "failed" || value === "call_failed" || value === "call_timeout") return "bad";
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
          <Headphones size={20} />
        </div>
        <div>
          <strong>Обзвон AI</strong>
          <span>Amix / Just Wood</span>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.tab}
              className={`nav-item ${activeTab === item.tab ? "active" : ""}`}
              onClick={() => onTab(item.tab)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={17} className={loading ? "spin" : ""} />
          <span>Обновить</span>
        </button>
        <button type="button" className="ghost-button danger" onClick={onLogout}>
          <LogOut size={17} />
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
          <Headphones size={20} />
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
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="primary-button wide" disabled={loading}>
          {loading ? <RefreshCw size={17} className="spin" /> : <CheckCircle2 size={17} />}
          <span>{loading ? "Проверяю" : "Войти"}</span>
        </button>
      </form>
    </main>
  );
}

function Metric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string | number; icon: typeof Activity; tone?: string }) {
  return (
    <section className={`metric ${tone}`}>
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
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

  return (
    <div className="view-stack">
      <div className="page-heading">
        <div>
          <p>Рабочее состояние</p>
          <h1>Обзор системы</h1>
        </div>
        <span className={`status-pill ${dashboard.worker.enabled ? "good" : "muted"}`}>
          Обработчик {dashboard.worker.enabled ? "включён" : "выключен"}
        </span>
      </div>

      <div className="metrics-grid">
        <Metric label="Кампаний" value={dashboard.campaigns.total} icon={ListChecks} />
        <Metric label="Контактов" value={dashboard.contacts.total} icon={Database} />
        <Metric label="В очереди" value={dashboard.tasks.pending} icon={Clock} tone="busy" />
        <Metric label="Завершено" value={dashboard.tasks.completed} icon={CheckCircle2} tone="good" />
        <Metric label="Ошибок" value={dashboard.tasks.failed} icon={AlertCircle} tone="bad" />
      </div>

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
                  <small>{formatDate(campaign.updated_at)}</small>
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
                  <small>{compactText(call.client_phone || call.caller_phone)} · {formatDate(call.updated_at)}</small>
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
        <FileSpreadsheet size={20} />
        <span>{file ? file.name : "Выберите файл"}</span>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      </label>
      {error ? <div className="inline-error"><AlertCircle size={16} /><span>{error}</span></div> : null}
      <button type="submit" className="primary-button" disabled={!file || loading}>
        {loading ? <RefreshCw size={17} className="spin" /> : <Upload size={17} />}
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
          <Search size={17} />
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
          <Database size={28} />
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
          {savingAction === "run" ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
          <span>Запустить</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => runAction("pause")} disabled={savingAction !== ""}>
          <Pause size={16} />
          <span>Пауза</span>
        </button>
        <button type="button" className="secondary-button" onClick={() => runAction("rerun")} disabled={savingAction !== ""}>
          <RotateCcw size={16} />
          <span>Повторить</span>
        </button>
        <label className="delay-control">
          <Clock size={16} />
          <span>Пауза, сек</span>
          <input value={delay} onChange={(event) => setDelay(event.target.value.replace(/\D/g, ""))} />
          <button type="button" onClick={saveDelay} disabled={savingAction !== ""}>
            <Save size={15} />
          </button>
        </label>
      </div>

      {error ? <div className="inline-error"><AlertCircle size={16} /><span>{error}</span></div> : null}

      <div className="stats-strip">
        <Metric label="Всего" value={detail.campaign.stats?.total || 0} icon={Database} />
        <Metric label="Ожидают" value={(detail.campaign.stats?.pending || 0) + (detail.campaign.stats?.scheduled || 0)} icon={Clock} />
        <Metric label="Готово" value={detail.campaign.stats?.completed || 0} icon={CheckCircle2} tone="good" />
        <Metric label="Ошибки" value={detail.campaign.stats?.failed || 0} icon={AlertCircle} tone="bad" />
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
            {saving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
          </button>
          <button type="button" className="icon-button" onClick={() => setEditing(false)} title="Отменить">
            <X size={15} />
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
      <RefreshCw size={20} className="spin" />
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
            <AlertCircle size={17} />
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
