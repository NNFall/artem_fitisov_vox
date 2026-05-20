const SHEET_NAME = 'Обзвон Amix';
const LEGACY_SHEET_NAMES = ['Sheet1', 'Лист1', 'Форум Амих Участники', 'Форум Amix Участники'];
const SHEET_TITLE = 'Отчет по обзвону базы участников форума Amix';
const SHEET_TIMEZONE = 'Europe/Moscow';
const STANDARD_ROW_HEIGHT = 21;
const UNIFIED_ROW_HEIGHT = Math.round(STANDARD_ROW_HEIGHT * 1.5);
const TITLE_ROW = 1;
const HEADER_ROW = 2;
const DATA_START_ROW = 3;

const VIEW_COLUMNS = [
  { key: 'id', title: 'ID', width: 70, kind: 'text', align: 'center' },
  { key: 'first_name', title: 'Имя', width: 135, kind: 'text', align: 'left' },
  { key: 'last_name', title: 'Фамилия', width: 145, kind: 'text', align: 'left' },
  { key: 'email', title: 'E-mail', width: 210, kind: 'text', align: 'left' },
  { key: 'phone', title: 'Контактныйтелефон', width: 155, kind: 'phone', align: 'center' },
  { key: 'company', title: 'Компания', width: 230, kind: 'text', align: 'left', wrap: true },
  { key: 'attended', title: 'Пришёл', width: 95, kind: 'text', align: 'center' },
  { key: 'reached', title: 'Дозвон Да/Нет', width: 120, kind: 'text', align: 'center' },
  { key: 'activity_type', title: 'Вид деятельности', width: 245, kind: 'text', wrap: true },
  { key: 'decision_maker', title: 'Руководитель компании, Да/Нет', width: 230, kind: 'text', wrap: true },
  { key: 'average_check', title: 'Средний чек', width: 150, kind: 'text', align: 'center', wrap: true },
  { key: 'traffic_source', title: 'Трафик Сарафан/Входящий', width: 230, kind: 'text', wrap: true },
  { key: 'comment', title: 'Комментарий', width: 360, kind: 'text', wrap: true },
  { key: 'bot_impression', title: 'Для бота: Приятно или не приятно говорить с Ботом? Да/Нет', width: 300, kind: 'text', wrap: true },
  { key: 'transcript', title: 'Для бота: Транскрибация диалога', width: 520, kind: 'text', wrap: true },
  { key: 'summary', title: 'Для бота: Саммари разговора', width: 420, kind: 'text', wrap: true },
];

const DISPLAY_HEADERS = VIEW_COLUMNS.map((column) => column.title);
const PHONE_COLUMN = getColumnIndexByKey_('phone');
const RESULT_COLUMNS_START = getColumnIndexByKey_('reached');
const RESULT_COLUMNS_END = getColumnIndexByKey_('summary');

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'empty_post_body' });
    }

    const payload = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();
    ensureSheetView_(sheet);

    const rowNumber = findOrAppendRowByPhone_(sheet, payload);
    writePayloadResult_(sheet, rowNumber, payload);
    applySheetLayout_(sheet);

    return jsonResponse_({
      ok: true,
      sheet: sheet.getName(),
      row: rowNumber,
      phone: normalizePhone_(pickPayloadPhone_(payload)),
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'amix_calls_google_sheets_webhook',
    sheet: SHEET_NAME,
  });
}

function applyManagerSheetView() {
  const sheet = getOrCreateSheet_();
  ensureSheetView_(sheet);
}

function setupCallsSheetView() {
  applyManagerSheetView();
}

function setupAmixSheetView() {
  applyManagerSheetView();
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensureSpreadsheetTimezone_(spreadsheet);

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    for (let i = 0; i < LEGACY_SHEET_NAMES.length; i += 1) {
      sheet = spreadsheet.getSheetByName(LEGACY_SHEET_NAMES[i]);
      if (sheet) break;
    }
  }

  if (!sheet) {
    sheet = spreadsheet.getSheets()[0] || spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getName() !== SHEET_NAME) {
    sheet.setName(SHEET_NAME);
  }

  return sheet;
}

function ensureSpreadsheetTimezone_(spreadsheet) {
  if (spreadsheet.getSpreadsheetTimeZone() !== SHEET_TIMEZONE) {
    spreadsheet.setSpreadsheetTimeZone(SHEET_TIMEZONE);
  }
}

function ensureSheetView_(sheet) {
  syncColumnCount_(sheet);
  ensureTitleAndHeaderRows_(sheet);
  writeTitleAndHeaders_(sheet);
  applySheetLayout_(sheet);
}

function syncColumnCount_(sheet) {
  const requiredColumns = VIEW_COLUMNS.length;
  const currentColumns = sheet.getMaxColumns();

  if (currentColumns < requiredColumns) {
    sheet.insertColumnsAfter(currentColumns, requiredColumns - currentColumns);
  } else if (currentColumns > requiredColumns) {
    sheet.deleteColumns(requiredColumns + 1, currentColumns - requiredColumns);
  }
}

function ensureTitleAndHeaderRows_(sheet) {
  const row1 = getRowValues_(sheet, TITLE_ROW);
  const row2 = getRowValues_(sheet, HEADER_ROW);

  if (matchesDisplayHeaders_(row1)) {
    sheet.insertRowsBefore(TITLE_ROW, 1);
    return;
  }

  if (matchesDisplayHeaders_(row2)) return;

  const firstRowHasData = rowHasContent_(row1);
  const secondRowHasData = rowHasContent_(row2);
  if (firstRowHasData && !looksLikeTitleRow_(row1) && !secondRowHasData) {
    sheet.insertRowsBefore(TITLE_ROW, 1);
  }
}

function getRowValues_(sheet, rowNumber) {
  if (sheet.getMaxRows() < rowNumber) return [];
  return sheet.getRange(rowNumber, 1, 1, VIEW_COLUMNS.length).getValues()[0];
}

function matchesDisplayHeaders_(rowValues) {
  if (!rowValues || rowValues.length < DISPLAY_HEADERS.length) return false;
  for (let i = 0; i < DISPLAY_HEADERS.length; i += 1) {
    if (normalizeHeader_(rowValues[i]) !== normalizeHeader_(DISPLAY_HEADERS[i])) {
      return false;
    }
  }
  return true;
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function looksLikeTitleRow_(rowValues) {
  return String(rowValues && rowValues[0] ? rowValues[0] : '').trim() === SHEET_TITLE;
}

function writeTitleAndHeaders_(sheet) {
  syncColumnCount_(sheet);

  const titleRange = sheet.getRange(TITLE_ROW, 1, 1, VIEW_COLUMNS.length);
  titleRange.breakApart();
  titleRange.clearContent();
  titleRange.merge();
  titleRange.setValue(SHEET_TITLE);

  sheet.getRange(HEADER_ROW, 1, 1, VIEW_COLUMNS.length).setValues([DISPLAY_HEADERS]);
}

function applySheetLayout_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), DATA_START_ROW);
  const dataRowCount = Math.max(lastRow - DATA_START_ROW + 1, 1);

  const titleRange = sheet.getRange(TITLE_ROW, 1, 1, VIEW_COLUMNS.length);
  const headerRange = sheet.getRange(HEADER_ROW, 1, 1, VIEW_COLUMNS.length);
  const dataRange = sheet.getRange(DATA_START_ROW, 1, dataRowCount, VIEW_COLUMNS.length);

  sheet.setFrozenRows(HEADER_ROW);
  sheet.setFrozenColumns(0);

  titleRange
    .setFontWeight('bold')
    .setFontSize(15)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');

  headerRange
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBackground('#dbeafe')
    .setFontColor('#0f172a');

  sheet.getRange(HEADER_ROW, 1, 1, 7).setBackground('#e0f2fe');
  sheet.getRange(HEADER_ROW, RESULT_COLUMNS_START, 1, RESULT_COLUMNS_END - RESULT_COLUMNS_START + 1).setBackground('#fef3c7');

  dataRange
    .setVerticalAlignment('top')
    .setHorizontalAlignment('left')
    .setWrap(true);

  VIEW_COLUMNS.forEach((column, index) => {
    const columnIndex = index + 1;
    const columnRange = sheet.getRange(DATA_START_ROW, columnIndex, dataRowCount, 1);
    sheet.setColumnWidth(columnIndex, column.width);
    columnRange.setWrap(Boolean(column.wrap));
    columnRange.setHorizontalAlignment(column.align || 'left');
  });

  sheet.getRange(DATA_START_ROW, PHONE_COLUMN, dataRowCount, 1).setNumberFormat('@');
  sheet.getRange(DATA_START_ROW, RESULT_COLUMNS_START, dataRowCount, RESULT_COLUMNS_END - RESULT_COLUMNS_START + 1).setBackground('#f8fafc');
  sheet.getRange(DATA_START_ROW, getColumnIndexByKey_('attended'), dataRowCount, 1).setBackground('#fff7ed');

  applyDataValidation_(sheet);
  removeAllBandings_(sheet);
  if (sheet.getLastRow() >= DATA_START_ROW) {
    sheet
      .getRange(DATA_START_ROW, 1, Math.max(sheet.getLastRow() - DATA_START_ROW + 1, 1), VIEW_COLUMNS.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
  }

  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet
    .getRange(HEADER_ROW, 1, Math.max(sheet.getLastRow() - HEADER_ROW + 1, 1), VIEW_COLUMNS.length)
    .createFilter();

  dataRange.setBorder(false, false, true, false, false, false, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
  setFixedRowHeights_(sheet, TITLE_ROW, 1, UNIFIED_ROW_HEIGHT);
  setFixedRowHeights_(sheet, HEADER_ROW, 1, UNIFIED_ROW_HEIGHT);
  if (sheet.getLastRow() >= DATA_START_ROW) {
    setFixedRowHeights_(sheet, DATA_START_ROW, sheet.getLastRow() - DATA_START_ROW + 1, UNIFIED_ROW_HEIGHT);
  }
}

function setFixedRowHeights_(sheet, startRow, rowCount, height) {
  if (rowCount < 1) return;
  if (typeof sheet.setRowHeightsForced === 'function') {
    sheet.setRowHeightsForced(startRow, rowCount, height);
    return;
  }
  sheet.setRowHeights(startRow, rowCount, height);
}

function applyDataValidation_(sheet) {
  const rowCount = Math.max(sheet.getMaxRows() - DATA_START_ROW + 1, 1);
  const attendedColumn = getColumnIndexByKey_('attended');
  const reachedColumn = getColumnIndexByKey_('reached');

  const attendedRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ДА'], true)
    .setAllowInvalid(true)
    .build();

  const reachedRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Да', 'Нет'], true)
    .setAllowInvalid(true)
    .build();

  sheet.getRange(DATA_START_ROW, attendedColumn, rowCount, 1).setDataValidation(attendedRule);
  sheet.getRange(DATA_START_ROW, reachedColumn, rowCount, 1).setDataValidation(reachedRule);
}

function findOrAppendRowByPhone_(sheet, payload) {
  const phone = normalizePhone_(pickPayloadPhone_(payload));
  if (!phone) throw new Error('Payload has no client phone');

  const lastRow = sheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    const phones = sheet.getRange(DATA_START_ROW, PHONE_COLUMN, lastRow - DATA_START_ROW + 1, 1).getValues();
    for (let index = 0; index < phones.length; index += 1) {
      if (normalizePhone_(phones[index][0]) === phone) {
        return DATA_START_ROW + index;
      }
    }
  }

  const rowNumber = Math.max(lastRow + 1, DATA_START_ROW);
  const clientName = firstNonEmpty_(payload.client_name, getSummaryFields_(payload).client_name);
  sheet.getRange(rowNumber, PHONE_COLUMN).setValue(phone);
  if (clientName) sheet.getRange(rowNumber, getColumnIndexByKey_('first_name')).setValue(clientName);
  return rowNumber;
}

function writePayloadResult_(sheet, rowNumber, payload) {
  const fields = getSummaryFields_(payload);
  const phone = normalizePhone_(pickPayloadPhone_(payload));
  const clientName = firstNonEmpty_(fields.client_name, payload.client_name);

  if (clientName && !sheet.getRange(rowNumber, getColumnIndexByKey_('first_name')).getValue()) {
    sheet.getRange(rowNumber, getColumnIndexByKey_('first_name')).setValue(clientName);
  }
  if (phone) sheet.getRange(rowNumber, PHONE_COLUMN).setValue(phone);

  sheet.getRange(rowNumber, getColumnIndexByKey_('reached')).setValue(isReached_(payload) ? 'Да' : 'Нет');
  sheet.getRange(rowNumber, getColumnIndexByKey_('activity_type')).setValue(firstNonEmpty_(fields.activity_type));
  sheet.getRange(rowNumber, getColumnIndexByKey_('decision_maker')).setValue(firstNonEmpty_(fields.is_decision_maker));
  sheet.getRange(rowNumber, getColumnIndexByKey_('average_check')).setValue(firstNonEmpty_(fields.average_check));
  sheet.getRange(rowNumber, getColumnIndexByKey_('traffic_source')).setValue(firstNonEmpty_(fields.traffic_source));
  sheet.getRange(rowNumber, getColumnIndexByKey_('comment')).setValue(buildComment_(payload, fields));
  sheet.getRange(rowNumber, getColumnIndexByKey_('bot_impression')).setValue(firstNonEmpty_(fields.bot_impression));
  sheet.getRange(rowNumber, getColumnIndexByKey_('transcript')).setValue(firstNonEmpty_(payload.dialogue_text));
  sheet.getRange(rowNumber, getColumnIndexByKey_('summary')).setValue(firstNonEmpty_(fields.summary, payload.summary));

  applyRecordingNote_(sheet, rowNumber, payload);
}

function getSummaryFields_(payload) {
  const fields = payload && payload.summary_fields;
  return fields && typeof fields === 'object' ? fields : {};
}

function pickPayloadPhone_(payload) {
  return firstNonEmpty_(payload && payload.client_phone, payload && payload.caller_phone);
}

function buildComment_(payload, fields) {
  return compact_([
    valueLine_('Итог', firstNonEmpty_(fields.outcome, payload.outcome)),
    valueLine_('Следующий шаг', firstNonEmpty_(fields.next_step, payload.next_step)),
    valueLine_('Собранные ответы', firstNonEmpty_(fields.manager_offer, payload.manager_offer)),
    valueLine_('Длительность', formatDuration_(payload.call_duration_sec)),
  ]);
}

function applyRecordingNote_(sheet, rowNumber, payload) {
  const commentColumn = getColumnIndexByKey_('comment');
  const note = compact_([
    valueLine_('Vox session', payload.session_id),
    valueLine_('Причина завершения', payload.finalization_reason),
    valueLine_('Запись', payload.recording_url),
    valueLine_('Статус записи', payload.recording_status),
    valueLine_('Телефония, ₽', moneyText_(payload.voximplant_total_rub || payload.telephony_cost_rub)),
    valueLine_('AI, ₽', moneyText_(payload.ai_cost_rub)),
    valueLine_('Всего, ₽', moneyText_(payload.total_cost_rub)),
  ]);
  sheet.getRange(rowNumber, commentColumn).setNote(note);
}

function isReached_(payload) {
  const reason = String(payload.finalization_reason || '').toLowerCase();
  if (['call_failed', 'call_timeout', 'no_answer', 'busy', 'cancelled', 'failed'].indexOf(reason) !== -1) {
    return false;
  }
  return Boolean(payload.dialogue_text || payload.summary || Number(payload.call_duration_sec || 0) > 0);
}

function getColumnIndexByKey_(key) {
  const index = VIEW_COLUMNS.findIndex((column) => column.key === key);
  return index >= 0 ? index + 1 : -1;
}

function normalizePhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') return `7${digits.slice(1)}`;
  return digits;
}

function firstNonEmpty_(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
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

function rowHasContent_(row) {
  return row && row.some((cell) => cell !== '' && cell !== null);
}

function removeAllBandings_(sheet) {
  sheet.getBandings().forEach((banding) => banding.remove());
}

function formatDuration_(value) {
  if (value === undefined || value === null || value === '') return '';
  const totalSeconds = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(totalSeconds)) return '';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}:${pad2_(minutes)}:${pad2_(seconds)}`;
  return `${pad2_(minutes)}:${pad2_(seconds)}`;
}

function moneyText_(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toFixed(2);
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
