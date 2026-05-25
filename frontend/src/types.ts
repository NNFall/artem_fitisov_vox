export type StatusMap = Record<string, number>;

export type Campaign = {
  id: number;
  name: string;
  status: string;
  source_filename?: string | null;
  prompt_context?: string | null;
  default_max_attempts?: number | null;
  call_delay_seconds?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  paused_at?: string | null;
  stats?: StatusMap;
};

export type Task = {
  id: number;
  campaign_id: number;
  contact_id: number;
  phone: string;
  status?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  voximplant_session_id?: string | null;
  last_status?: string | null;
  last_status_message?: string | null;
  result_status?: string | null;
  result_summary?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export type Contact = {
  id: number;
  campaign_id: number;
  phone: string;
  name?: string | null;
  company?: string | null;
  city?: string | null;
  source?: string | null;
  context?: string | null;
  preferred_time?: string | null;
  timezone?: string | null;
  attendance_status?: string | null;
  activity_type?: string | null;
  is_decision_maker?: string | null;
  average_check?: string | null;
  traffic_source?: string | null;
  bot_impression?: string | null;
  task?: Task | null;
};

export type Call = {
  id: number;
  session_id: string;
  campaign_id?: number | null;
  outbound_task_id?: number | null;
  project?: string | null;
  script_name?: string | null;
  model?: string | null;
  client_phone?: string | null;
  caller_phone?: string | null;
  client_name?: string | null;
  status?: string | null;
  duration?: number | null;
  summary?: string | null;
  outcome?: string | null;
  next_step?: string | null;
  dialogue_text?: string | null;
  recording_status?: string | null;
  recording_url?: string | null;
  recording_download_url?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  connected_at?: string | null;
  finished_at?: string | null;
};

export type Dashboard = {
  campaigns: {
    total: number;
    active: number;
    paused: number;
    recent: Campaign[];
  };
  contacts: {
    total: number;
  };
  tasks: {
    total: number;
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
  calls: {
    total: number;
    recent: Call[];
  };
  worker: {
    enabled: boolean;
    rule_id?: string | null;
    public_backend_url?: string | null;
    queue_interval_seconds: number;
    max_concurrent_calls: number;
  };
};

export type CampaignDetail = {
  campaign: Campaign;
  contacts: Contact[];
  tasks: Task[];
  calls: Call[];
  events: Array<Record<string, unknown>>;
};

export type ImportResult = {
  campaign: Campaign;
  stats: StatusMap;
  preview: Array<Record<string, string>>;
};
