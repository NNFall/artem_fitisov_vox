import { ChangeEvent, FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  PhoneIncoming,
  PhoneOutgoing,
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
type CallDirection = "incoming" | "outgoing";
type DialogueRole = "ai" | "client" | "unknown";
type DialogueTurn = {
  role: DialogueRole;
  label: string;
  text: string;
};
type ContactHistory = {
  phone: string;
  name: string;
  calls: Call[];
};
type CampaignShell = {
  id: number;
  name: string;
  source_filename?: string | null;
};
type CallsPageState = {
  source: "dashboard" | "campaign" | "history";
};

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
  transcription_waiting_recording: "Ждет запись",
  transcription_started: "Идет расшифровка",
  transcription_completed: "Расшифровка готова",
  transcription_failed: "Ошибка расшифровки",
  skipped_no_recording: "Нет записи",
  skipped_no_assemblyai_key: "Нет ключа AssemblyAI",
  analysis_started: "Собирается summary",
  analysis_completed: "Summary готово",
  analysis_failed: "Ошибка summary",
  analysis_skipped: "AI-анализ пропущен",
  skipped_no_gemini_key: "Нет ключа Gemini",
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
  { id: "calls", label: "Звонки", icon: Phone },
  { id: "contacts", label: "Контакты", icon: UserRound },
  { id: "tasks", label: "Задачи", icon: FileSpreadsheet },
  { id: "events", label: "События", icon: Clock3 },
];

function statusRu(value?: string | null) {
  if (!value) return "Не указано";
  return statusLabels[value] || value;
}

function statusTone(value?: string | null) {
  if (["active", "completed", "finalized", "call_disconnected", "hangup", "client_hangup", "ok", "recording_ready", "ready", "transcription_completed", "analysis_completed", "attended", "arrived", "yes"].includes(value || "")) return "good";
  if (["failed", "call_failed", "call_timeout", "dial_error", "max_call_duration", "error", "recording_failed", "download_error", "transcription_failed", "analysis_failed", "skipped_no_assemblyai_key", "skipped_no_gemini_key", "not_attended", "no_show", "no"].includes(value || "")) return "bad";
  if (["started", "starting", "in_progress", "queued", "scheduled", "retry_wait", "transcription_started", "analysis_started", "transcription_waiting_recording"].includes(value || "")) return "busy";
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

function campaignShortName(campaign?: Campaign | null) {
  const text = compactText(campaign?.name, "");
  if (!text) return "Вне кампании";
  return text.length > 18 ? `${text.slice(0, 18).trim()}...` : text;
}

function campaignLabel(campaigns: Campaign[], call: Call) {
  if (!call.campaign_id) return "Входящий";
  const campaign = campaigns.find((item) => item.id === call.campaign_id);
  if (!campaign) return `#${call.campaign_id}`;
  return `#${campaign.id} ${campaignShortName(campaign)}`;
}

function callDirection(call: Call): { type: CallDirection; label: string; Icon: typeof PhoneIncoming } {
  const scriptName = String(call.script_name || "").toLowerCase();
  if (scriptName.includes("inbound") || (!call.campaign_id && !call.outbound_task_id && call.caller_phone)) {
    return { type: "incoming", label: "Входящий", Icon: PhoneIncoming };
  }
  return { type: "outgoing", label: "Исходящий", Icon: PhoneOutgoing };
}

function providerRu(value?: string | null) {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider) return "";
  if (provider === "assemblyai") return "AssemblyAI";
  if (provider.includes("gemini") || provider.includes("google")) return "Gemini";
  if (provider.includes("openai")) return "OpenAI";
  return value || "";
}

function processingLabel(base: string, provider?: string | null) {
  const providerName = providerRu(provider);
  return providerName ? `${base} ${providerName}` : base;
}

function modelMeta(provider?: string | null, model?: string | null) {
  return [providerRu(provider), model].filter(Boolean).join(" · ");
}

function normalizePhoneForCompare(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function sameCallPhone(call: Call, phone?: string | null) {
  const target = normalizePhoneForCompare(phone);
  if (!target) return false;
  return [call.client_phone, call.caller_phone].some((value) => normalizePhoneForCompare(value) === target);
}

function callDateValue(call: Call) {
  return call.finished_at || call.updated_at || call.started_at || call.connected_at;
}

function inferDialogueRole(label: string): DialogueRole {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (/(ai|assistant|model|bot|gemini|екатерин|бот|робот|нейросет|ассистент|менеджер)/i.test(normalized)) return "ai";
  if (/(client|user|caller|клиент|пользователь|собеседник|абонент|человек|участник)/i.test(normalized)) return "client";
  return "unknown";
}

function parseDialogue(text?: string | null, clientName?: string | null): DialogueTurn[] {
  const source = String(text || "").trim();
  if (!source) return [];

  const client = compactText(clientName, "Клиент");
  const turns: DialogueTurn[] = [];
  const lines = source
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const cleaned = line.replace(/^\[[^\]]+\]\s*/, "").trim();
    const match = cleaned.match(/^([^:：]{2,42})[:：]\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const role = inferDialogueRole(label);
      turns.push({
        role,
        label: role === "ai" ? "Екатерина AI" : role === "client" ? client : label,
        text: match[2].trim(),
      });
      return;
    }

    const last = turns[turns.length - 1];
    if (last && last.role === "unknown") {
      last.text = `${last.text}\n${cleaned}`;
      return;
    }
    turns.push({ role: "unknown", label: "Фрагмент", text: cleaned });
  });

  return turns;
}

function transcriptParagraphs(text?: string | null) {
  const clean = String(text || "")
    .replace(/\bSpeaker\s+[A-ZА-Я]\s*[:：]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((item) => item.trim()).filter(Boolean) || [clean];
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs;
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

function SkeletonLine({ wide = false }: { wide?: boolean }) {
  return <span className={`skeleton-line ${wide ? "wide" : ""}`} aria-hidden="true" />;
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
  onOpenCalls,
}: {
  dashboard: Dashboard | null;
  campaigns: Campaign[];
  calls: Call[];
  loading: boolean;
  onOpenCampaign: (campaign: Campaign) => void;
  onOpenCall: (call: Call) => void;
  onOpenCalls: () => void;
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
              <button type="button" className="campaign-card" key={campaign.id} onClick={() => onOpenCampaign(campaign)}>
                <span>
                  <strong>{campaign.name}</strong>
                  <small>
                    <i className={`status-dot ${campaign.status === "active" ? "good" : "muted"}`} />
                    {statusRu(campaign.status)}
                  </small>
                  <span className="campaign-progress" aria-label={`Прогресс ${campaignProgress(campaign)}%`}>
                    <span style={{ width: `${campaignProgress(campaign)}%` }} />
                  </span>
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
            <button type="button" className="section-title-button" onClick={onOpenCalls}>
              <h2>Последние звонки</h2>
              <small>Открыть весь журнал</small>
            </button>
            <span>{dashboard?.calls.total ?? calls.length}</span>
          </div>
          <div className="compact-call-list">
            {calls.slice(0, 5).map((call) => {
              const direction = callDirection(call);
              const DirectionIcon = direction.Icon;
              return (
                <button type="button" key={call.id} className="compact-call" onClick={() => onOpenCall(call)}>
                  <span>
                    <strong>{callName(call)}</strong>
                    <small>{callPhone(call)}</small>
                    <span className="compact-call-meta">
                      <DirectionIcon size={13} />
                      {direction.label}
                      <i>{formatDate(callDateValue(call))}</i>
                    </span>
                  </span>
                  <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
                </button>
              );
            })}
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

function CampaignPageSkeleton({
  campaign,
  tab,
  onBack,
  onTab,
}: {
  campaign: CampaignShell;
  tab: DetailTab;
  onBack: () => void;
  onTab: (tab: DetailTab) => void;
}) {
  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Назад</span>
      </button>

      <section className="campaign-detail-card loading-shell">
        <div className="campaign-detail-head">
          <div>
            <h2>{campaign.name}</h2>
            <p>Файл базы: {compactText(campaign.source_filename, "загружаю данные")}</p>
          </div>
          <span className="loading-chip"><RefreshCw size={15} className="spin" />Загружаю кампанию</span>
        </div>

        <div className="detail-metrics">
          {["Всего задач", "В очереди", "Завершено", "Ошибки"].map((label) => (
            <section className="metric-card skeleton-card" key={label}>
              <span>{label}</span>
              <SkeletonLine />
            </section>
          ))}
        </div>

        <div className="campaign-info-grid">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton-info-card">
              <SkeletonLine />
              <SkeletonLine wide />
              <SkeletonLine />
            </div>
          ))}
        </div>
      </section>

      <section className="detail-tabs-card loading-shell">
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
          <TableSkeleton rows={6} columns={tab === "calls" ? 5 : tab === "tasks" ? 4 : 5} />
        </div>
      </section>
    </div>
  );
}

function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="data-table skeleton-table" aria-label="Загружаю данные">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="table-row static skeleton-row" key={rowIndex} style={{ ["--columns" as string]: columns }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <SkeletonLine key={columnIndex} wide={columnIndex === columns - 1} />
          ))}
        </div>
      ))}
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
        <span>Тип</span>
        <span>Клиент</span>
        <span>Итог</span>
        <span>Длительность</span>
        <span>Саммари</span>
      </div>
      {calls.map((call) => {
        const direction = callDirection(call);
        const DirectionIcon = direction.Icon;
        return (
          <button type="button" key={call.id} className="table-row" onClick={() => onOpen(call)}>
            <span><span className={`direction-pill ${direction.type}`}><DirectionIcon size={14} />{direction.label}</span></span>
            <span>
              <strong>{callName(call)}</strong>
              <small>{callPhone(call)}</small>
            </span>
            <span><span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span></span>
            <span>{formatDuration(call.duration)}</span>
            <span className="summary-cell">{callSummary(call)}</span>
          </button>
        );
      })}
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
  onOpenHistory,
}: {
  contact: Contact;
  onBack: () => void;
  onSaved: () => void;
  onOpenHistory: (phone: string, name: string) => void;
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
          <div className="object-actions">
            <button type="button" className="action-button secondary" onClick={() => onOpenHistory(contact.phone, compactText(contact.name, "Без имени"))}>
              <Clock3 size={17} />
              <span>История звонков</span>
            </button>
            <span className={`status-pill ${statusTone(contact.task?.status)}`}>{statusRu(contact.task?.status)}</span>
          </div>
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

function CallDetail({
  call,
  loading,
  onBack,
  onOpenHistory,
}: {
  call: Call;
  loading: boolean;
  onBack: () => void;
  onOpenHistory: (phone: string, name: string) => void;
}) {
  const facts = splitFacts(call.summary || call.outcome || call.dialogue_text);
  const src = recordingSource(call);
  const externalRecordingUrl = recordingExternalUrl(call);
  const recordingWasNotStarted = call.recording_status === "not_started";
  const recordingUrlMissing = !src && !externalRecordingUrl && ["ready", "recording_ready"].includes(call.recording_status || "");
  const direction = callDirection(call);
  const DirectionIcon = direction.Icon;
  const dialogueText = call.transcription_text || call.dialogue_text || "";
  const dialogueTurns = parseDialogue(dialogueText, call.client_name);
  const dialogueSourceTitle = call.transcription_text
    ? processingLabel("Расшифровка", call.transcription_provider)
    : "Диалог агента";
  const dialogueSourceMeta = call.transcription_text
    ? modelMeta(call.transcription_provider, call.transcription_model)
    : compactText(call.model, "Voximplant / Gemini");

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
            <p>{callPhone(call)} · {formatDate(callDateValue(call))}</p>
          </div>
          <div className="object-actions">
            {loading ? <span className="loading-chip"><RefreshCw size={15} className="spin" />Обновляю звонок</span> : null}
            <span className={`direction-pill ${direction.type}`}><DirectionIcon size={15} />{direction.label}</span>
            <button type="button" className="action-button secondary" onClick={() => onOpenHistory(callPhone(call), callName(call))}>
              <Clock3 size={17} />
              <span>История клиента</span>
            </button>
            <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
          </div>
        </div>

        <div className="call-result-hero">
          <span>Итог разговора</span>
          <strong>{callSummary(call)}</strong>
        </div>

        <div className="contact-facts call-facts">
          <ResultLine label="Тип звонка" value={direction.label} />
          <ResultLine label="Статус звонка" value={statusRu(call.status)} />
          <ResultLine label="Длительность" value={formatDuration(call.duration)} />
          <ResultLine label="Следующий шаг" value={call.next_step} />
          <ResultLine label="Запись" value={statusRu(call.recording_status)} />
          <ResultLine label={processingLabel("Расшифровка", call.transcription_provider)} value={statusRu(call.transcription_status)} />
          <ResultLine label={processingLabel("AI-сводка", call.analysis_provider)} value={statusRu(call.analysis_status)} />
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
          <div className="summary-panel">
            <ResultLine label="Итог" value={call.outcome || statusRu(call.status)} />
            <ResultLine label="Следующий шаг" value={call.next_step} />
            <ResultLine label="Кратко" value={call.summary || call.outcome} />
            {call.transcription_error && <ResultLine label="Ошибка расшифровки" value={call.transcription_error} />}
            {call.analysis_error && <ResultLine label="Ошибка AI-сводки" value={call.analysis_error} />}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-title-row">
            <div>
              <h3>{dialogueSourceTitle}</h3>
              <span>{dialogueSourceMeta}</span>
            </div>
            {call.transcription_status ? (
              <span className={`status-pill ${statusTone(call.transcription_status)}`}>{statusRu(call.transcription_status)}</span>
            ) : null}
          </div>
          <DialogueThread
            turns={dialogueTurns}
            rawText={dialogueText}
            sourceTitle={dialogueSourceTitle}
            sourceMeta={dialogueSourceMeta}
          />
        </section>
      </section>
    </div>
  );
}

function DialogueThread({
  turns,
  rawText,
  sourceTitle,
  sourceMeta,
}: {
  turns: DialogueTurn[];
  rawText?: string | null;
  sourceTitle: string;
  sourceMeta?: string | null;
}) {
  if (!turns.length) {
    return <EmptyBlock title="Диалог пока не сохранен" text="Когда сервер получит текст разговора, он появится здесь по репликам клиента и AI." compact />;
  }

  const structuredTurns = turns.filter((turn) => turn.role !== "unknown");
  const shouldUseTranscriptPanel = structuredTurns.length < 2;
  if (shouldUseTranscriptPanel) {
    const paragraphs = transcriptParagraphs(rawText);
    const note = sourceTitle.includes("AssemblyAI")
      ? "AssemblyAI вернул этот фрагмент без надежного разделения по ролям, поэтому текст показан как единая расшифровка."
      : "Роли собеседников в этом фрагменте не разделены автоматически, поэтому текст показан единым блоком.";
    return (
      <article className="transcript-panel">
        <div className="transcript-head">
          <span>Единая расшифровка</span>
          <small>{sourceMeta || "Роли собеседников не разделены автоматически"}</small>
        </div>
        <div className="transcript-copy">
          {paragraphs.map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}
        </div>
        <small className="transcript-note">{note}</small>
      </article>
    );
  }

  return (
    <div className="dialogue-thread">
      {turns.map((turn, index) => (
        <article className={`dialogue-turn ${turn.role}`} key={`${turn.label}-${index}`}>
          <span className="speaker-badge">{turn.label}</span>
          <p>{turn.text}</p>
        </article>
      ))}
    </div>
  );
}

function ContactHistoryPage({
  history,
  campaigns,
  loading,
  onBack,
  onOpenCall,
  onOpenCampaign,
}: {
  history: ContactHistory;
  campaigns: Campaign[];
  loading: boolean;
  onBack: () => void;
  onOpenCall: (call: Call) => void;
  onOpenCampaign: (id: number) => void;
}) {
  const completed = history.calls.filter((call) => statusTone(call.status) === "good").length;
  const missed = history.calls.filter((call) => statusTone(call.status) === "bad").length;
  const lastCall = history.calls[0];

  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Назад</span>
      </button>

      <section className="object-detail-card history-detail-card">
        <div className="object-head">
          <div>
            <p className="eyebrow">История клиента</p>
            <h2>{history.name}</h2>
            <p>{history.phone} · {formatCount(history.calls.length, "касание", "касания", "касаний")}</p>
          </div>
          {loading ? <span className="loading-chip"><RefreshCw size={15} className="spin" />Обновляю историю</span> : lastCall ? <span className={`status-pill ${statusTone(lastCall.status)}`}>{statusRu(lastCall.status)}</span> : null}
        </div>

        <div className="detail-metrics compact-metrics">
          <MetricCard label="Всего звонков" value={history.calls.length} />
          <MetricCard label="Разговоры" value={completed} tone="good" />
          <MetricCard label="Не состоялись" value={missed} tone="bad" />
        </div>

        <div className="history-timeline">
          {history.calls.map((call) => {
            const direction = callDirection(call);
            const DirectionIcon = direction.Icon;
            const campaign = campaigns.find((item) => item.id === call.campaign_id);
            return (
              <article className="history-item" key={call.id}>
                <button type="button" className={`history-rail ${direction.type}`} onClick={() => onOpenCall(call)} aria-label="Открыть звонок">
                  <DirectionIcon size={18} />
                </button>
                <div className="history-body">
                  <div className="history-row">
                    <span className={`direction-pill ${direction.type}`}><DirectionIcon size={14} />{direction.label}</span>
                    <time>{formatDate(callDateValue(call))}</time>
                    <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
                  </div>
                  <button type="button" className="history-summary" onClick={() => onOpenCall(call)}>
                    <strong>{callSummary(call)}</strong>
                    <span>{formatDuration(call.duration)} · сессия {shortId(call.session_id)}</span>
                  </button>
                  {campaign ? (
                    <button type="button" className="history-campaign-link" onClick={() => onOpenCampaign(campaign.id)}>
                      Перейти в кампанию: {campaign.name}
                    </button>
                  ) : (
                    <span className="history-campaign-link muted">Входящий звонок вне кампании</span>
                  )}
                </div>
              </article>
            );
          })}
          {loading && !history.calls.length ? <TableSkeleton rows={3} columns={3} /> : null}
          {!loading && !history.calls.length ? <EmptyBlock title="Истории пока нет" text="По этому номеру еще не найдено входящих или исходящих звонков." /> : null}
        </div>
      </section>
    </div>
  );
}

function AllCallsPage({
  calls,
  campaigns,
  loading,
  onBack,
  onOpenCall,
  onOpenCampaign,
  onOpenHistory,
}: {
  calls: Call[];
  campaigns: Campaign[];
  loading: boolean;
  onBack: () => void;
  onOpenCall: (call: Call) => void;
  onOpenCampaign: (id: number) => void;
  onOpenHistory: (phone: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCalls = calls.filter((call) => {
    if (!normalizedQuery) return true;
    return [
      callName(call),
      callPhone(call),
      callSummary(call),
      statusRu(call.status),
      campaignLabel(campaigns, call),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const incoming = calls.filter((call) => callDirection(call).type === "incoming").length;
  const outgoing = calls.length - incoming;
  const completed = calls.filter((call) => statusTone(call.status) === "good").length;

  return (
    <div className="screen-stack enter">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={20} />
        <span>Назад</span>
      </button>

      <section className="object-detail-card calls-page-card">
        <div className="object-head">
          <div>
            <p className="eyebrow">Журнал звонков</p>
            <h2>Все последние звонки</h2>
            <p>Входящие и исходящие касания, записи, сводки и переходы к кампаниям.</p>
          </div>
          <div className="object-actions">
            {loading ? <span className="loading-chip"><RefreshCw size={15} className="spin" />Обновляю журнал</span> : null}
            <span className="status-pill busy">{formatCount(filteredCalls.length, "звонок", "звонка", "звонков")}</span>
          </div>
        </div>

        <div className="detail-metrics compact-metrics">
          <MetricCard label="Всего" value={calls.length} />
          <MetricCard label="Исходящие" value={outgoing} tone="good" />
          <MetricCard label="Входящие" value={incoming} />
          <MetricCard label="Завершено" value={completed} tone="good" />
        </div>

        <label className="calls-search field">
          <span>Поиск по имени, телефону, итогу или кампании</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: Никита, 7995, Amix" />
        </label>

        <div className="all-calls-list">
          {filteredCalls.map((call) => {
            const direction = callDirection(call);
            const DirectionIcon = direction.Icon;
            const campaign = call.campaign_id ? campaigns.find((item) => item.id === call.campaign_id) : null;
            const phone = callPhone(call);
            const hasPhone = Boolean(call.client_phone || call.caller_phone);
            const name = callName(call);
            return (
              <article
                className="all-call-row"
                key={call.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenCall(call)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenCall(call);
                  }
                }}
                aria-label={`Открыть звонок: ${name}, ${phone}`}
              >
                <span className={`call-direction-mark ${direction.type}`} aria-hidden="true">
                  <DirectionIcon size={18} />
                </span>
                <div className="all-call-main">
                  <span className="all-call-title">
                    <strong>{name}</strong>
                    <small>{phone}</small>
                  </span>
                  <span className="all-call-summary">{callSummary(call)}</span>
                </div>
                <span className="all-call-meta">
                  <span className={`direction-pill ${direction.type}`}><DirectionIcon size={14} />{direction.label}</span>
                  <time>{formatDate(callDateValue(call))}</time>
                </span>
                <span className="all-call-status">
                  <span className={`status-pill ${statusTone(call.status)}`}>{statusRu(call.status)}</span>
                  <small>{formatDuration(call.duration)}</small>
                </span>
                <span className="all-call-actions">
                  {campaign ? (
                    <button
                      type="button"
                      className="history-campaign-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenCampaign(campaign.id);
                      }}
                      title={campaign.name}
                    >
                      {campaignLabel(campaigns, call)}
                    </button>
                  ) : (
                    <span className="history-campaign-link muted">Входящий</span>
                  )}
                  <button
                    type="button"
                    className="history-campaign-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenHistory(phone, name);
                    }}
                    disabled={!hasPhone}
                    title={hasPhone ? "Открыть историю клиента" : "Телефон не указан"}
                  >
                    История клиента
                  </button>
                </span>
              </article>
            );
          })}
          {loading && !filteredCalls.length ? <TableSkeleton rows={6} columns={5} /> : null}
          {!loading && !filteredCalls.length ? <EmptyBlock title="Звонки не найдены" text="Измените поиск или обновите журнал звонков." /> : null}
        </div>
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
  const [selectedHistory, setSelectedHistory] = useState<ContactHistory | null>(null);
  const [callsPage, setCallsPage] = useState<CallsPageState | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("calls");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const refreshRequestRef = useRef(0);
  const campaignRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const callRequestRef = useRef(0);
  const callsPageRequestRef = useRef(0);

  const selectedCallFromList = useMemo(() => {
    if (!selectedCall) return null;
    const listCall = calls.find((call) => call.id === selectedCall.id);
    const campaignCall = selectedCampaign?.calls.find((call) => call.id === selectedCall.id);
    return { ...(listCall || {}), ...(campaignCall || {}), ...selectedCall } as Call;
  }, [calls, selectedCall, selectedCampaign]);

  const selectedCampaignShell = useMemo(() => {
    if (!selectedCampaignId) return null;
    const campaign = selectedCampaign?.campaign || campaigns.find((item) => item.id === selectedCampaignId);
    return campaign ? { id: campaign.id, name: campaign.name, source_filename: campaign.source_filename } : null;
  }, [campaigns, selectedCampaign, selectedCampaignId]);

  const activeViewKey = useMemo(() => {
    if (!authenticated) return checkingAuth ? "checking-auth" : "login";
    if (selectedCall?.session_id) return `call:${selectedCall.session_id}`;
    if (selectedHistory) return `history:${selectedHistory.phone}`;
    if (selectedContact) return `contact:${selectedContact.id}`;
    if (selectedCampaignId) return `campaign:${selectedCampaignId}:${detailTab}`;
    if (callsPage) return `calls:${callsPage.source}`;
    return "dashboard";
  }, [
    authenticated,
    checkingAuth,
    callsPage,
    detailTab,
    selectedCall?.session_id,
    selectedCampaignId,
    selectedContact,
    selectedHistory,
  ]);

  async function refresh(targetCampaignId = selectedCampaignId) {
    if (!authenticated) return;
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const [dashboardData, campaignData, callsData] = await Promise.all([
        api.dashboard(),
        api.campaigns(),
        api.calls(callsPage ? 500 : 100),
      ]);
      if (refreshRequestRef.current !== requestId) return;
      setDashboard(dashboardData);
      setCampaigns(campaignData);
      setCalls(callsData);

      const idToLoad = targetCampaignId || selectedCampaignId;
      if (idToLoad) {
        const detail = await api.campaign(idToLoad);
        if (refreshRequestRef.current !== requestId) return;
        setSelectedCampaign(detail);
        setSelectedCampaignId(idToLoad);
        if (selectedContact) {
          const nextContact = detail.contacts.find((item) => item.id === selectedContact.id) || null;
          setSelectedContact(nextContact);
        }
      }
    } catch (err) {
      if (refreshRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
      }
    } finally {
      if (refreshRequestRef.current === requestId) {
        setLoading(false);
      }
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

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [activeViewKey]);

  async function openCampaign(campaign: Campaign | CampaignShell | number) {
    const campaignId = typeof campaign === "number" ? campaign : campaign.id;
    const requestId = campaignRequestRef.current + 1;
    campaignRequestRef.current = requestId;
    setLoading(true);
    setError("");
    setSelectedCampaignId(campaignId);
    setSelectedCampaign(null);
    setSelectedContact(null);
    setSelectedCall(null);
    setSelectedHistory(null);
    setCallsPage(null);
    setHistoryLoading(false);
    setDetailTab("calls");
    try {
      const detail = await api.campaign(campaignId);
      if (campaignRequestRef.current === requestId) {
        setSelectedCampaign(detail);
      }
    } catch (err) {
      if (campaignRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Не удалось открыть кампанию");
      }
    } finally {
      if (campaignRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function openContactHistory(phone: string, name: string) {
    const normalizedPhone = normalizePhoneForCompare(phone);
    if (!normalizedPhone) {
      setError("У контакта нет номера для поиска истории.");
      return;
    }

    setLoading(true);
    setHistoryLoading(true);
    setError("");
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    const localCalls = [
      ...(selectedCampaign?.calls || []),
      ...calls,
    ].filter((call) => sameCallPhone(call, normalizedPhone));
    setSelectedCall(null);
    setSelectedContact(null);
    setSelectedHistory({ phone: normalizedPhone, name, calls: localCalls });

    try {
      const historyCalls = await api.callHistory(normalizedPhone, 100);
      if (historyRequestRef.current !== requestId) return;
      const byId = new Map<number, Call>();
      [...historyCalls, ...localCalls].forEach((call) => byId.set(call.id, call));
      const mergedCalls = Array.from(byId.values()).sort((a, b) => {
        const aTime = new Date(callDateValue(a) || 0).getTime();
        const bTime = new Date(callDateValue(b) || 0).getTime();
        return bTime - aTime || b.id - a.id;
      });
      setSelectedHistory({ phone: normalizedPhone, name, calls: mergedCalls });
    } catch (err) {
      if (historyRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить историю клиента");
      }
    } finally {
      if (historyRequestRef.current === requestId) {
        setHistoryLoading(false);
        setLoading(false);
      }
    }
  }

  function mergeCallIntoState(nextCall: Call) {
    setCalls((items) => items.map((item) => (item.id === nextCall.id ? nextCall : item)));
    setSelectedCampaign((detail) => (
      detail
        ? { ...detail, calls: detail.calls.map((item) => (item.id === nextCall.id ? nextCall : item)) }
        : detail
    ));
    setSelectedHistory((history) => (
      history
        ? { ...history, calls: history.calls.map((item) => (item.id === nextCall.id ? nextCall : item)) }
        : history
    ));
  }

  async function openCall(call: Call) {
    const requestId = callRequestRef.current + 1;
    callRequestRef.current = requestId;
    setSelectedCall(call);
    setSelectedContact(null);
    setError("");
    if (!call.session_id) return;
    setCallLoading(true);
    try {
      const freshCall = await api.call(call.session_id);
      if (callRequestRef.current !== requestId) return;
      setSelectedCall(freshCall);
      mergeCallIntoState(freshCall);
    } catch (err) {
      if (callRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Не удалось обновить карточку звонка");
      }
    } finally {
      if (callRequestRef.current === requestId) {
        setCallLoading(false);
      }
    }
  }

  async function openCallsPage(source: CallsPageState["source"] = "dashboard") {
    const requestId = callsPageRequestRef.current + 1;
    callsPageRequestRef.current = requestId;
    setCallsPage({ source });
    setSelectedCampaign(null);
    setSelectedCampaignId(null);
    setSelectedContact(null);
    setSelectedCall(null);
    setSelectedHistory(null);
    setHistoryLoading(false);
    setError("");
    setLoading(true);
    try {
      const [callsData, campaignData, dashboardData] = await Promise.all([
        api.calls(500),
        api.campaigns(),
        api.dashboard(),
      ]);
      if (callsPageRequestRef.current !== requestId) return;
      setCalls(callsData);
      setCampaigns(campaignData);
      setDashboard(dashboardData);
    } catch (err) {
      if (callsPageRequestRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить журнал звонков");
      }
    } finally {
      if (callsPageRequestRef.current === requestId) {
        setLoading(false);
      }
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
    setSelectedHistory(null);
    setCallsPage(null);
    setHistoryLoading(false);
    setCallLoading(false);
    setLoading(false);
    refreshRequestRef.current += 1;
    campaignRequestRef.current += 1;
    historyRequestRef.current += 1;
    callRequestRef.current += 1;
    callsPageRequestRef.current += 1;
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
        <CallDetail
          call={selectedCallFromList}
          loading={callLoading}
          onBack={() => {
            callRequestRef.current += 1;
            setCallLoading(false);
            setSelectedCall(null);
          }}
          onOpenHistory={(phone, name) => void openContactHistory(phone, name)}
        />
      ) : selectedHistory ? (
        <ContactHistoryPage
          history={selectedHistory}
          campaigns={campaigns}
          loading={historyLoading}
          onBack={() => {
            historyRequestRef.current += 1;
            setHistoryLoading(false);
            setSelectedHistory(null);
          }}
          onOpenCall={(call) => void openCall(call)}
          onOpenCampaign={(id) => void openCampaign(id)}
        />
      ) : selectedContact ? (
        <ContactDetail
          contact={selectedContact}
          onBack={() => setSelectedContact(null)}
          onSaved={() => void refresh(selectedCampaignId)}
          onOpenHistory={(phone, name) => void openContactHistory(phone, name)}
        />
      ) : selectedCampaign ? (
        <CampaignPage
          detail={selectedCampaign}
          tab={detailTab}
          loading={loading}
          onBack={() => {
            campaignRequestRef.current += 1;
            setSelectedCampaign(null);
            setSelectedCampaignId(null);
            setLoading(false);
          }}
          onTab={setDetailTab}
          onAction={(action) => void campaignAction(action)}
          onDelay={(seconds) => void saveDelay(seconds)}
          onOpenCall={(call) => void openCall(call)}
          onOpenContact={setSelectedContact}
        />
      ) : selectedCampaignShell ? (
        <CampaignPageSkeleton
          campaign={selectedCampaignShell}
          tab={detailTab}
          onBack={() => {
            campaignRequestRef.current += 1;
            setSelectedCampaign(null);
            setSelectedCampaignId(null);
            setLoading(false);
          }}
          onTab={setDetailTab}
        />
      ) : callsPage ? (
        <AllCallsPage
          calls={calls}
          campaigns={campaigns}
          loading={loading}
          onBack={() => {
            callsPageRequestRef.current += 1;
            setCallsPage(null);
            setLoading(false);
          }}
          onOpenCall={(call) => void openCall(call)}
          onOpenCampaign={(id) => void openCampaign(id)}
          onOpenHistory={(phone, name) => void openContactHistory(phone, name)}
        />
      ) : (
        <DashboardPage
          dashboard={dashboard}
          campaigns={campaigns}
          calls={calls}
          loading={loading}
          onOpenCampaign={(campaign) => void openCampaign(campaign)}
          onOpenCall={(call) => void openCall(call)}
          onOpenCalls={() => void openCallsPage("dashboard")}
        />
      )}
    </main>
  );
}
