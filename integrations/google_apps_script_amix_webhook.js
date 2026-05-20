const CONFIG = {
  // Leave empty to use the spreadsheet where this Apps Script is installed.
  SPREADSHEET_ID: '',
  SHEET_NAME: 'Sheet1',
  PHONE_COLUMN: 5,
};

const COLUMNS = {
  id: 1,
  firstName: 2,
  lastName: 3,
  email: 4,
  phone: 5,
  company: 6,
  attended: 7,
  reached: 8,
  activityType: 9,
  decisionMaker: 10,
  averageCheck: 11,
  trafficSource: 12,
  comment: 13,
  botImpression: 14,
  transcript: 15,
  summary: 16,
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = parsePayload_(e);
    const sheet = getSheet_();
    const row = findOrAppendRow_(sheet, payload);
    writeResult_(sheet, row, payload);
    return json_({ ok: true, row });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Empty POST body');
  }
  return JSON.parse(e.postData.contents);
}

function getSheet_() {
  const spreadsheet = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error(`Sheet not found: ${CONFIG.SHEET_NAME}`);
  return sheet;
}

function normalizePhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') return `7${digits.slice(1)}`;
  return digits;
}

function findOrAppendRow_(sheet, payload) {
  const phone = normalizePhone_(payload.client_phone || payload.caller_phone);
  if (!phone) throw new Error('Payload has no client_phone');

  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow >= 2) {
    const phones = sheet.getRange(2, CONFIG.PHONE_COLUMN, lastRow - 1, 1).getValues();
    for (let index = 0; index < phones.length; index += 1) {
      if (normalizePhone_(phones[index][0]) === phone) {
        return index + 2;
      }
    }
  }

  const row = lastRow + 1;
  sheet.getRange(row, COLUMNS.phone).setValue(phone);
  return row;
}

function writeResult_(sheet, row, payload) {
  const fields = payload.summary_fields || {};
  const phone = normalizePhone_(payload.client_phone || payload.caller_phone);
  const clientName = firstNonEmpty_(fields.client_name, payload.client_name);
  const reached = isReached_(payload) ? 'Да' : 'Нет';
  const comment = compact_([
    valueLine_('Итог', firstNonEmpty_(fields.outcome, payload.outcome)),
    valueLine_('Следующий шаг', firstNonEmpty_(fields.next_step, payload.next_step)),
    valueLine_('Собранные ответы', firstNonEmpty_(fields.manager_offer, payload.manager_offer)),
  ]);

  if (clientName) sheet.getRange(row, COLUMNS.firstName).setValue(clientName);
  if (phone) sheet.getRange(row, COLUMNS.phone).setValue(phone);
  if (payload.company) sheet.getRange(row, COLUMNS.company).setValue(payload.company);

  sheet.getRange(row, COLUMNS.reached).setValue(reached);
  sheet.getRange(row, COLUMNS.activityType).setValue(firstNonEmpty_(fields.activity_type));
  sheet.getRange(row, COLUMNS.decisionMaker).setValue(firstNonEmpty_(fields.is_decision_maker));
  sheet.getRange(row, COLUMNS.averageCheck).setValue(firstNonEmpty_(fields.average_check));
  sheet.getRange(row, COLUMNS.trafficSource).setValue(firstNonEmpty_(fields.traffic_source));
  sheet.getRange(row, COLUMNS.comment).setValue(comment);
  sheet.getRange(row, COLUMNS.botImpression).setValue(firstNonEmpty_(fields.bot_impression));
  sheet.getRange(row, COLUMNS.transcript).setValue(payload.dialogue_text || '');
  sheet.getRange(row, COLUMNS.summary).setValue(firstNonEmpty_(fields.summary, payload.summary));
}

function isReached_(payload) {
  const reason = String(payload.finalization_reason || '').toLowerCase();
  if (['call_failed', 'call_timeout', 'no_answer', 'busy', 'cancelled'].indexOf(reason) !== -1) {
    return false;
  }
  return Boolean(payload.dialogue_text || payload.summary || Number(payload.call_duration_sec || 0) > 0);
}

function firstNonEmpty_(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function valueLine_(label, value) {
  return value ? `${label}: ${value}` : '';
}

function compact_(values) {
  return values.filter(Boolean).join('\n');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
