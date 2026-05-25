import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  Headphones,
  LogOut,
  Pause,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { API_BASE, api } from "./api";
import type { Call, Campaign, CampaignDetail, Contact, Dashboard, ImportResult, Task } from "./types";

type DetailTab = "contacts" | "tasks" | "calls" | "events";
type CampaignAction = "run" | "pause" | "rerun";

const statusLabels: Record<string, string> = {
  active: "Активна",
  paused: "На паузе",
  pending: "Ожидает",
  scheduled: "Запланирована",
  starting: "Запускается",
  started: "Сценарий запущен",
  in_progress: "Разговор идет",
  completed: "Завершено",
  failed: "Ошибка",
  finalized: "Финализировано",
  call_timeout: "Не взяли трубку",
  call_failed: "Звонок не состоялся",
  call_disconnected: "Звонок завершен",
  dial_error: "Ошибка набора",
  empty_call_target: "Нет номера",
  no_gemini_key: "Нет ключа AI",
  gemini_create_error: "Ошибка подключения AI",
  recording_ready: "Запись готова",
  ready: "Запись готова",
  recording_failed: "Ошибка записи",
  not_started: "Запись не создавалась",
  download_error: "Запись не скачалась",
  requested_not_confirmed: "Запись запрошена",
  max_call_duration: "Лимит времени",
  websocket_close: "Соединение закрыто",
  client_hangup: "Клиент завершил",
  hangup: "Звонок завершен",
  queued: "В очереди",
  retry_wait: "Ожидает повтор",
  cancelled: "Отменено",
  ok: "Успешно",
  error: "Ошибка",
  attended: "Пришел",
  not_attended: "Не пришел",
  arrived: "Пришел",
  no_show: "Не пришел",
  yes: "Да",
  no: "Нет",
};

const detailTabs: Array<{ id: DetailTab; label: string; icon: typeof UserRound }> = [
  { id: "contacts", label: "Контакты", icon: UserRound },
  { id: "tasks", label: "Задачи", icon: FileSpreadsheet },
  { id: "calls", label: "Звонки", icon: Phone },
  { id: "events", label: "События", icon: Clock3 },
];

function statusRu(value?: string | null) {
  if (!value) return "Не указано";
  return statusLabels[value] || value;
}

function statusTone(value?: string | null) {
  if (["active", "completed", "finalized", "call_disconnected", "hangup", "client_hangup", "ok", "recording_ready", "ready", "attended", "arrived", "yes"].includes(value || "")) return "good";
  if (["failed", "call_failed", "call_timeout", "dial_error", "max_call_duration", "error", "recording_failed", "download_error", "not_attended", "no_show", "no"].includes(value || "")) return "bad";
  if (["started", "starting", "in_progress", "queued", "scheduled", "retry_wait"].includes(value || "")) return "busy";
  return "muted";
}

function compactText(value?: string | null, fallback = "Нет данных") {
  const text = String(value || "").trim();
  if (text.toLowerCase() === "не указано") return "Не указано";
  return text || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatDelay(seconds?: number | null) {
  const value = Math.max(0, Number(seconds || 0));
  if (value >= 60 && value % 60 === 0) return `${value / 60} мин`;
  return `${value} сек`;
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatCount(value: number, one: string, few: string, many: string) {
  return `${value} ${pluralRu(value, one, few, many)}`;
}

function stat(campaign: Campaign | null | undefined, keys: string[]) {
  const stats = campaign?.stats || {};
  return keys.reduce((sum, key) => sum + Number(stats[key] || 0), 0);
}

function campaignTotal(campaign: Campaign | null | undefined) {
  return stat(campaign, ["total"]);
}

function campaignProgress(campaign: Campaign | null | undefined) {
  const total = campaignTotal(campaign);
  if (!total) return 0;
  return Math.round((stat(campaign, ["completed"]) / total) * 100);
}

function recordingSource(call: Call) {
  if (call.recording_download_url) {
    return /^https?:\/\//i.test(call.recording_download_url)
      ? call.recording_download_url
      : `${API_BASE}${call.recording_download_url}`;
  }
  return "";
}

function recordingExternalUrl(call: Call) {
  return call.recording_url && /^https?:\/\//i.test(call.recording_url) ? call.recording_url : "";
}

function callName(call: Call) {
  return compactText(call.client_name, "Без имени");
}

function callPhone(call: Call) {
  return compactText(call.client_phone || call.caller_phone, "Телефон не указан");
}

function callSummary(call: Call) {
  return compactText(call.summary || call.outcome || call.next_step, "Итог пока не заполнен");
}

function splitFacts(text?: string | null) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|;\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function eventValue(event: Record<string, unknown>, key: string) {
  const value = event[key];
  return value === undefined || value === null ? "" : String(value);
}

function shortId(value?: string | number | null) {
  const text = String(value || "");
  return text.length > 22 ? `${text.slice(0, 12)}...${text.slice(-6)}` : text;
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
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-copy">
          <div className="brand-lockup">
            <span className="brand-mark"><Headphones size={24} /></span>
            <span>Обзвон AI</span>
          </div>
          <div>
            <p className="eyebrow">Закрытый контур</p>
            <h1>Панель управления обзвоном</h1>
            <p>Кампании, очереди, записи разговоров и итоги звонков в одном рабочем интерфейсе.</p>
          </div>
          <AudioBars />
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">Доступ администратора</p>
            <h2>Войти в панель</h2>
          </div>
          <label className="field">
            <span>Логин</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error ? <InlineMessage tone="bad" icon={<AlertCircle size={17} />} text={error} /> : null}
          <button type="submit" className="action-button primary wide" disabled={loading}>
            {loading ? <RefreshCw size={18} className="spin" /> : <ArrowLeft size={18} className="turn-right" />}
            <span>{loading ? "Проверяю" : "Открыть панель"}</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function AudioBars({ active = true }: { active?: boolean }) {
  return (
    <div className={`audio-bars ${active ? "active" : "idle"}`} aria-hidden="true">
      {Array.from({ length: 34 }).map((_, index) => (
        <span key={index} style={{ ["--bar" as string]: `${20 + ((index * 17) % 62)}%`, ["--i" as string]: index }} />
      ))}
    </div>
  );
}

function RecordingPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const nextTime = Number(event.target.value);
    if (audio) audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="audio-card">
      <button type="button" className="play-orb" aria-label={playing ? "Поставить запись на паузу" : "Воспроизвести запись"} onClick={toggle}>
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <div className="player-main">
        <div className="player-head">
          <strong>Запись готова</strong>
          <span>{formatDuration(currentTime)} / {duration ? formatDuration(duration) : "00:00"}</span>
        </div>
        <AudioBars active={playing} />
        <input
          className="player-range"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || currentTime)}
          onChange={seek}
          aria-label="Позиция записи"
        />
        <audio
          ref={audioRef}
          preload="metadata"
          src={src}
          onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      </div>
    </div>
  );
}

function InlineMessage({ tone, icon, text }: { tone: "good" | "bad" | "busy"; icon: React.ReactNode; text: string }) {
  return (
    <div className={`inline-message ${tone}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function TopBar({
  loading,
  message,
  error,
  onRefresh,
  onLogout,
  onUpload,
  onClearMessage,
}: {
  loading: boolean;
  message: string;
  error: string;
  onRefresh: () => void;
  onLogout: () => void;
  onUpload: (file: File) => void;
  onClearMessage: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="app-header">
      <div>
        <h1>Панель управления обзвоном</h1>
        <p>Детальный мониторинг и оркестрация</p>
      </div>
      <div className="header-actions">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".xlsx,.xls,.csv,.tsv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.currentTarget.value = "";
          }}
        />
        <button type="button" className="action-button secondary" onClick={() => inputRef.current?.click()}>
          <Upload size={17} />
          <span>Загрузить базу</span>
        </button>
        <button type="button" className="action-button secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={17} className={loading ? "spin" : ""} />
          <span>{loading ? "Обновляю" : "Обновить"}</span>
        </button>
        <button type="button" className="action-button ghost" onClick={onLogout}>
          <LogOut size={17} />
          <span>Выйти</span>
        </button>
      </div>
      {message || error ? (
        <div className={`toast ${error ? "bad" : "good"}`}>
          {error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{error || message}</span>
          <button type="button" onClick={onClearMessage} aria-label="Закрыть уведомление">
            <X size={16} />
          </button>
        </div>
      ) : null}
    </header>
  );
}

function MetricCard({ label, value, tone = "neutral", detail }: { label: string; value: string | number; tone?: string; detail?: string }) {
  return (
    <section className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}

function DashboardPage({
  dashboard,
  campaigns,
  calls,
  loading,
  onOpenCampaign,
  onOpenCall,
}: {
  dashboard: Dashboard | null;
  campaigns: Campaign[];
  calls: Call[];
  loading: boolean;
  onOpenCampaign: (id: number) => void;
  onOpenCall: (call: Call) => void;
}) {
  if (!dashboard && loading) return <LoadingPanel title="Загружаю обзор" />;

  const activeTasks = dashboard ? dashboard.tasks.active : 0;
  const completed = dashboard ? dashboard.tasks.completed : 0;
  const failed = dashboard ? dashboard.tasks.failed : 0;

  return (
    <div className="screen-stack enter">
      <section className="metrics-grid">
        <MetricCard label="Всего кампаний" value={dashboard?.campaigns.total ?? campaigns.length} />
        <MetricCard label="Активные задачи" value={activeTasks} />
        <MetricCard label="Завершено" value={completed} tone="good" />
        <MetricCard label="Ошибки" value={failed} tone="bad" />
      </section>

      <section className="dashboard-grid">
        <div className="campaigns-panel">
          <div className="section-head">
            <h2>Кампании</h2>
            <span>{formatCount(campaigns.length, "кампания", "кампании", "кампаний")}</span>
          </div>
          <div className="campaign-list">
            {campaigns.map((campaign) => (
              <button type="button" className="campaign-card" key={campaign.id} onClick={() => onOpenCampaign(campaign.id)}>
                <span>
                  <strong>{campaign.name}</strong>
                  <small>
                    <i className={`status-dot ${campaign.status === "active" ? "good" : "muted"}`} />
                    {statusRu(campaign.status)}
                  </small>
                </span>
                <span className="campaign-metrics">
                  <span>
                    <small>Прогресс</small>
                    <b>{campaignProgress(campaign)}%</b>
                  </span>
                  <span>
                    <small>Ошибки</small>
                    <b className="bad-text">{stat(campaign, ["failed"])}</b>
                  </span>
                </span>
              </button>
            ))}
            {!campaigns.length ? <EmptyBlock title="Кампаний пока нет" text="Загрузите XLSX, CSV или TSV-файл, чтобы создать первую кампанию." /> : null}
          </div>
        </div>

        <aside className="side-panel">
          <div className="section-head">
            <h2>Последние звонки</h2>
            <span>{dashboard?.calls.total ?? calls.length}</span>
          </div>
          <div className="compact-call-list">
            {calls.slice(0, 5).map((call) => (
              <button type="button" key={call.id} className="compact-call" onClick={() => onOpenCall(call)}>
                <span>
                  <strong>{callName(call)}</strong>
                  <small>{callPhone(call)}</small>
                </span>
                <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
              </button>
            ))}
            {!calls.length ? <EmptyBlock title="Звонков пока нет" text="Когда кампания начнет работать, здесь появятся последние разговоры." compact /> : null}
          </div>
        </aside>
      </section>
    </div>
  );
}

function CampaignPage({
  detail,
  tab,
  loading,
  onBack,
  onTab,
  onAction,
  onDelay,
  onOpenCall,
  onOpenContact,
}: {
  detail: CampaignDetail;
  tab: DetailTab;
  loading: boolean;
  onBack: () => void;
  onTab: (tab: DetailTab) => void;
  onAction: (action: CampaignAction) => void;
  onDelay: (seconds: number) => void;
  onOpenCall: (call: Call) => void;
  onOpenContact: (contact: Contact) => void;
}) {
  const { campaign, contacts, tasks, calls, events } = detail;
  const [delay, setDelay] = useState(campaign.call_delay_seconds || 0);

  useEffect(() => {
    setDelay(campaign.call_delay_seconds || 0);
  }, [campaign.call_delay_seconds]);

  const primaryAction: CampaignAction = campaign.status === "active" ? "pause" : "run";
  const primaryLabel = campaign.status === "active" ? "Приостановить" : "Запустить";
  const PrimaryIcon = campaign.status === "active" ? Pause : Play;

  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Назад</span>
      </button>

      <section className="campaign-detail-card">
        <div className="campaign-detail-head">
          <div>
            <h2>{campaign.name}</h2>
            <p>Файл базы: {compactText(campaign.source_filename, "источник не указан")}</p>
          </div>
          <div className="campaign-actions">
            <button type="button" className="action-button secondary" onClick={() => onAction("rerun")} disabled={loading}>
              <RotateCcw size={17} />
              <span>Повторить</span>
            </button>
            <button type="button" className="action-button primary" onClick={() => onAction(primaryAction)} disabled={loading}>
              <PrimaryIcon size={17} />
              <span>{primaryLabel}</span>
            </button>
          </div>
        </div>

        <div className="detail-metrics">
          <MetricCard label="Всего задач" value={campaignTotal(campaign)} />
          <MetricCard label="В очереди" value={stat(campaign, ["pending", "scheduled"])} />
          <MetricCard label="Завершено" value={stat(campaign, ["completed"])} tone="good" />
          <MetricCard label="Ошибки" value={stat(campaign, ["failed"])} tone="bad" />
        </div>

        <div className="campaign-info-grid">
          <div>
            <span>Файл базы</span>
            <strong>{compactText(campaign.source_filename, "Не указан")}</strong>
            <span>Дата создания</span>
            <strong>{formatDate(campaign.created_at)}</strong>
          </div>
          <div>
            <span>Статус</span>
            <strong className={campaign.status === "active" ? "good-text" : "muted-text"}>{statusRu(campaign.status)}</strong>
            <span>Пауза между звонками</span>
            <strong>{formatDelay(campaign.call_delay_seconds)}</strong>
          </div>
          <div className="delay-card">
            <label>
              <span>Изменить паузу, сек</span>
              <input type="number" min="0" value={delay} onChange={(event) => setDelay(Number(event.target.value))} />
            </label>
            <button type="button" className="icon-action" onClick={() => onDelay(delay)} disabled={loading} title="Сохранить паузу">
              <Save size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="detail-tabs-card">
        <div className="tabs-row">
          {detailTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.id} className={`tab-button ${tab === item.id ? "active" : ""}`} onClick={() => onTab(item.id)}>
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="tab-content">
          {tab === "contacts" ? <ContactsTable contacts={contacts} onOpen={onOpenContact} /> : null}
          {tab === "tasks" ? <TasksTable tasks={tasks} /> : null}
          {tab === "calls" ? <CampaignCalls calls={calls} onOpen={onOpenCall} /> : null}
          {tab === "events" ? <EventsList events={events} /> : null}
        </div>
      </section>
    </div>
  );
}

function ContactsTable({ contacts, onOpen }: { contacts: Contact[]; onOpen: (contact: Contact) => void }) {
  return (
    <div className="data-table contacts-table">
      <div className="table-head">
        <span>Имя</span>
        <span>Телефон</span>
        <span>Компания</span>
        <span>Статус</span>
        <span>Город</span>
      </div>
      {contacts.map((contact) => (
        <button type="button" key={contact.id} className="table-row" onClick={() => onOpen(contact)}>
          <span><strong>{compactText(contact.name, "Без имени")}</strong></span>
          <span className="mono">{contact.phone}</span>
          <span>{compactText(contact.company)}</span>
          <span><span className={`status-pill ${statusTone(contact.attendance_status)}`}>{statusRu(contact.attendance_status)}</span></span>
          <span className="muted-text">{compactText(contact.city)}</span>
        </button>
      ))}
      {!contacts.length ? <EmptyBlock title="Контактов нет" text="В этой кампании пока нет загруженных строк." /> : null}
    </div>
  );
}

function TasksTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="data-table tasks-table">
      <div className="table-head">
        <span>ID задачи</span>
        <span>Статус</span>
        <span>Попытки</span>
        <span>Последний статус</span>
      </div>
      {tasks.map((task) => (
        <div key={task.id} className="table-row static">
          <span className="mono">#{task.id}</span>
          <span><span className={`status-pill ${statusTone(task.status)}`}>{statusRu(task.status)}</span></span>
          <span>{task.attempt_count || 0}/{task.max_attempts || 1}</span>
          <span>{compactText(task.last_status_message || task.result_summary || task.last_error || task.last_status, "Ожидает")}</span>
        </div>
      ))}
      {!tasks.length ? <EmptyBlock title="Задач нет" text="После загрузки базы здесь появится очередь обзвона." /> : null}
    </div>
  );
}

function CampaignCalls({ calls, onOpen }: { calls: Call[]; onOpen: (call: Call) => void }) {
  return (
    <div className="data-table calls-table">
      <div className="table-head">
        <span>Клиент</span>
        <span>Итог</span>
        <span>Длительность</span>
        <span>Саммари</span>
      </div>
      {calls.map((call) => (
        <button type="button" key={call.id} className="table-row" onClick={() => onOpen(call)}>
          <span>
            <strong>{callName(call)}</strong>
            <small>{callPhone(call)}</small>
          </span>
          <span><span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span></span>
          <span>{formatDuration(call.duration)}</span>
          <span className="summary-cell">{callSummary(call)}</span>
        </button>
      ))}
      {!calls.length ? <EmptyBlock title="Звонков нет" text="Когда начнется обзвон, здесь появятся результаты и записи." /> : null}
    </div>
  );
}

function EventsList({ events }: { events: Array<Record<string, unknown>> }) {
  return (
    <div className="events-list">
      {events.map((event, index) => {
        const status = eventValue(event, "status") || eventValue(event, "stage");
        return (
          <div className={`event-item ${statusTone(status)}`} key={`${eventValue(event, "id") || index}`}>
            {statusTone(status) === "bad" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{compactText(eventValue(event, "message") || eventValue(event, "stage"), "Событие")}</span>
            <time>{formatDate(eventValue(event, "created_at") || eventValue(event, "timestamp_utc"))}</time>
          </div>
        );
      })}
      {!events.length ? <EmptyBlock title="Событий нет" text="Статусы сценария появятся во время запуска и завершения звонков." /> : null}
    </div>
  );
}

function ContactDetail({
  contact,
  onBack,
  onSaved,
}: {
  contact: Contact;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: contact.name || "",
    phone: contact.phone || "",
    company: contact.company || "",
    city: contact.city || "",
    context: contact.context || "",
    preferred_time: contact.preferred_time || "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateContact(contact.id, draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Назад к кампании</span>
      </button>
      <section className="object-detail-card">
        <div className="object-head">
          <div>
            <p className="eyebrow">Карточка контакта</p>
            <h2>{compactText(contact.name, "Без имени")}</h2>
            <p>{compactText(contact.company)} · {compactText(contact.phone)}</p>
          </div>
          <span className={`status-pill ${statusTone(contact.task?.status)}`}>{statusRu(contact.task?.status)}</span>
        </div>

        <div className="edit-grid">
          <label className="field"><span>Имя</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field"><span>Телефон</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
          <label className="field"><span>Компания</span><input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></label>
          <label className="field"><span>Город</span><input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label>
          <label className="field wide-field"><span>Контекст для AI</span><textarea value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} /></label>
          <label className="field"><span>Удобное время</span><input value={draft.preferred_time} onChange={(event) => setDraft({ ...draft, preferred_time: event.target.value })} /></label>
        </div>

        <div className="contact-facts">
          <ResultLine label="Пришел на мероприятие" value={statusRu(contact.attendance_status)} />
          <ResultLine label="Вид деятельности" value={contact.activity_type} />
          <ResultLine label="Руководитель" value={contact.is_decision_maker} />
          <ResultLine label="Средний чек" value={contact.average_check} />
          <ResultLine label="Трафик" value={contact.traffic_source} />
          <ResultLine label="Впечатление от бота" value={contact.bot_impression} />
        </div>

        <button type="button" className="action-button primary save-contact" onClick={save} disabled={saving}>
          {saving ? <RefreshCw size={17} className="spin" /> : <Save size={17} />}
          <span>{saving ? "Сохраняю" : "Сохранить контакт"}</span>
        </button>
      </section>
    </div>
  );
}

function CallDetail({ call, onBack }: { call: Call; onBack: () => void }) {
  const facts = splitFacts(call.summary || call.outcome || call.dialogue_text);
  const src = recordingSource(call);
  const externalRecordingUrl = recordingExternalUrl(call);
  const recordingWasNotStarted = call.recording_status === "not_started";
  const recordingUrlMissing = !src && !externalRecordingUrl && ["ready", "recording_ready"].includes(call.recording_status || "");

  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>К списку звонков</span>
      </button>

      <section className="object-detail-card call-detail-card">
        <div className="object-head">
          <div>
            <p className="eyebrow">Звонок #{shortId(call.session_id || call.id)}</p>
            <h2>{callName(call)}</h2>
            <p>{callPhone(call)} · {formatDate(call.updated_at || call.started_at)}</p>
          </div>
          <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
        </div>

        <div className="call-result-hero">
          <span>Итог разговора</span>
          <strong>{callSummary(call)}</strong>
        </div>

        <div className="contact-facts call-facts">
          <ResultLine label="Длительность" value={formatDuration(call.duration)} />
          <ResultLine label="Следующий шаг" value={call.next_step} />
          <ResultLine label="Статус записи" value={statusRu(call.recording_status)} />
          <ResultLine label="ID сессии" value={call.session_id} />
        </div>

        <section className="detail-section">
          <h3>Собранные данные</h3>
          {facts.length ? (
            <div className="facts-list">
              {facts.map((fact, index) => <span key={`${fact}-${index}`}>{fact}</span>)}
            </div>
          ) : (
            <EmptyBlock title="Данных пока нет" text="Summary появится после финализации звонка." compact />
          )}
        </section>

        <section className="detail-section">
          <h3>Запись разговора</h3>
          {src ? (
            <RecordingPlayer src={src} />
          ) : externalRecordingUrl ? (
            <a className="audio-card recording-link-card" href={externalRecordingUrl} target="_blank" rel="noreferrer">
              <span className="play-orb"><ExternalLink size={20} /></span>
              <span className="recording-link-copy">
                <strong>Открыть запись</strong>
                <small>Файл доступен по внешней ссылке Voximplant.</small>
              </span>
            </a>
          ) : (
            <EmptyBlock
              title={recordingWasNotStarted ? "Запись не создавалась" : recordingUrlMissing ? "Ссылка на запись не пришла" : "Запись готовится"}
              text={recordingWasNotStarted ? "Для недозвона аудио обычно отсутствует." : recordingUrlMissing ? "В базе есть статус готовности, но нет URL для проигрывания." : "Файл может появиться через несколько минут после завершения разговора."}
              compact
            />
          )}
        </section>

        <section className="detail-section">
          <h3>Сводка</h3>
          <p className="text-box">{compactText(call.summary || call.outcome, "Сводка по звонку пока не пришла.")}</p>
        </section>

        <section className="detail-section">
          <h3>Диалог</h3>
          <pre className="dialogue-box">{compactText(call.dialogue_text, "Текст диалога пока не сохранен.")}</pre>
        </section>
      </section>
    </div>
  );
}

function ResultLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="result-line">
      <span>{label}</span>
      <strong>{compactText(value, "Не указано")}</strong>
    </div>
  );
}

function EmptyBlock({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className={`empty-block ${compact ? "compact" : ""}`}>
      <Search size={compact ? 22 : 30} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function LoadingPanel({ title }: { title: string }) {
  return (
    <div className="loading-panel">
      <RefreshCw size={22} className="spin" />
      <span>{title}</span>
    </div>
  );
}

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("contacts");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedCallFromList = useMemo(() => {
    if (!selectedCall) return null;
    return calls.find((call) => call.id === selectedCall.id) || selectedCampaign?.calls.find((call) => call.id === selectedCall.id) || selectedCall;
  }, [calls, selectedCall, selectedCampaign]);

  async function refresh(targetCampaignId = selectedCampaignId) {
    if (!authenticated) return;
    setLoading(true);
    setError("");
    try {
      const [dashboardData, campaignData, callsData] = await Promise.all([
        api.dashboard(),
        api.campaigns(),
        api.calls(100),
      ]);
      setDashboard(dashboardData);
      setCampaigns(campaignData);
      setCalls(callsData);

      const idToLoad = targetCampaignId || selectedCampaignId;
      if (idToLoad) {
        const detail = await api.campaign(idToLoad);
        setSelectedCampaign(detail);
        setSelectedCampaignId(idToLoad);
        if (selectedContact) {
          const nextContact = detail.contacts.find((item) => item.id === selectedContact.id) || null;
          setSelectedContact(nextContact);
        }
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
    if (authenticated) void refresh(null);
  }, [authenticated]);

  async function openCampaign(id: number) {
    setLoading(true);
    setError("");
    setSelectedCampaignId(id);
    setSelectedContact(null);
    setSelectedCall(null);
    setDetailTab("contacts");
    try {
      setSelectedCampaign(await api.campaign(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть кампанию");
    } finally {
      setLoading(false);
    }
  }

  async function uploadBase(file: File) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result: ImportResult = await api.upload(file);
      setMessage(`База загружена: ${result.campaign.name}`);
      await refresh(result.campaign.id);
      await openCampaign(result.campaign.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setLoading(false);
    }
  }

  async function campaignAction(action: CampaignAction) {
    if (!selectedCampaignId) return;
    setLoading(true);
    setError("");
    try {
      await api.setCampaignStatus(selectedCampaignId, action);
      setMessage(action === "run" ? "Кампания запущена" : action === "pause" ? "Кампания поставлена на паузу" : "Кампания подготовлена к повторному запуску");
      await refresh(selectedCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    } finally {
      setLoading(false);
    }
  }

  async function saveDelay(seconds: number) {
    if (!selectedCampaignId) return;
    setLoading(true);
    setError("");
    try {
      await api.setDelay(selectedCampaignId, Math.max(0, Number(seconds || 0)));
      setMessage(`Пауза обновлена: ${formatDelay(seconds)}`);
      await refresh(selectedCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить паузу");
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
    setSelectedCampaignId(null);
    setSelectedContact(null);
    setSelectedCall(null);
    setCalls([]);
  }

  if (checkingAuth) return <LoadingPanel title="Проверяю доступ" />;
  if (!authenticated) return <LoginView onLogin={() => setAuthenticated(true)} />;

  return (
    <main className="app-shell">
      <TopBar
        loading={loading}
        message={message}
        error={error}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
        onUpload={(file) => void uploadBase(file)}
        onClearMessage={() => {
          setError("");
          setMessage("");
        }}
      />

      {selectedCallFromList ? (
        <CallDetail call={selectedCallFromList} onBack={() => setSelectedCall(null)} />
      ) : selectedContact ? (
        <ContactDetail contact={selectedContact} onBack={() => setSelectedContact(null)} onSaved={() => void refresh(selectedCampaignId)} />
      ) : selectedCampaign ? (
        <CampaignPage
          detail={selectedCampaign}
          tab={detailTab}
          loading={loading}
          onBack={() => {
            setSelectedCampaign(null);
            setSelectedCampaignId(null);
          }}
          onTab={setDetailTab}
          onAction={(action) => void campaignAction(action)}
          onDelay={(seconds) => void saveDelay(seconds)}
          onOpenCall={setSelectedCall}
          onOpenContact={setSelectedContact}
        />
      ) : (
        <DashboardPage
          dashboard={dashboard}
          campaigns={campaigns}
          calls={calls}
          loading={loading}
          onOpenCampaign={(id) => void openCampaign(id)}
          onOpenCall={setSelectedCall}
        />
      )}
    </main>
  );
}
