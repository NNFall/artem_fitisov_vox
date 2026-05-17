import re
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

# ================= НАСТРОЙКИ ТАРИФОВ =================
PRICE_IN_TEXT = 0.50
PRICE_IN_AUDIO = 3.00
PRICE_OUT_TEXT = 2.00
PRICE_OUT_AUDIO = 12.00

USD_TO_RUB_RATE = 80
WEBSOCKET_PRICE_PER_MINUTE_RUB = 0.50

# ВСТАВЬ СЮДА ПОЛНЫЕ ЛОГИ
LOG_DATA = """
2026-04-22 08:38:07.176 Loading scenario crystalstone
2026-04-22 08:38:07.192 Sent event to JS onPhoneEvent with params [{name = Application.Started ; accountId = 10442873 ; domainName = callai.artemfetisov.voximplant.com ; dialplanName = Правило1 ; dialplanId = 8463781 ; userId = -1 ; applicationId = 50858303 ; accessURL = http://185.164.150.18:12092/request/204D2B479E8EF0D4.1776847087.5093751_185.164.150.18/74D42604AFE4E66E ; accessSecureURL = https://www-ru-52-18.voximplant.com:12093/request/204D2B479E8EF0D4.1776847087.5093751_185.164.150.18/74D42604AFE4E66E ; logURL = https://storage-gw-ru-02.voximplant.com/voximplant-logs-secure/2026/04/22/YzMxN2EyNDk4NDg4ODkxOWRlYWM1MTAzY2FlYzg2NDgvaHR0cDovL3d3dy1ydS01Mi0xOC52b3hpbXBsYW50LmNvbTo4MDgwL2xvZ3MvMjAyNi8wNC8yMi8wODM4MDdfMjA0RDJCNDc5RThFRjBENC4xNzc2ODQ3MDg3LjUwOTM3NTFfMTg1LjE2NC4xNTAuMTgubG9n?sessionid=4611818862 ; initiatorCountry = RU ; sessionId = 4611818862 ; nluAddresses = [https://ai-a1-1.voximplant.com/ ;  ] ; config = {acceptReInviteByDefault = true ; } ; } ;  ]
2026-04-22 08:38:07.192 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Application.CallAlerting ; callerid = 79117027598 ; sipCallId = 95f029e43e2611f18589047d7bbbc100@185.54.48.6 ; sipTransport = UDP ; destination = 79014172420 ; toURI = sip:79014172420@callai.artemfetisov.voximplant.com ; displayName = 79117027598 ; headers = {VI-Client-Device = SIP ; VI-Client-Type = pstn ; } ; } ;  ]
2026-04-22 08:38:07.192 Module loaded: gemini
2026-04-22 08:38:07.192 Module loaded: applicationstorage
2026-04-22 08:38:07.193 VoxEngine version: 7.35.0
2026-04-22 08:38:07.222 Executing JS command: EnableMediaStatistics with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; } ;  ]
2026-04-22 08:38:07.222 Executing JS command: StartAudio with params [{headers = NULL ; id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; scheme = NULL ; } ;  ]
2026-04-22 08:38:07.222 Executing JS command: CreatePlayer with params [{id = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; } ;  {loop = true ; toneScript = 425@-19;5(1/4/1) ; } ;  ]
2026-04-22 08:38:07.222 Sent event to JS onPhoneEvent with params [{id = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; name = Player.Created ; } ;  ]
2026-04-22 08:38:07.222 Executing JS command: SendMedia with params [{from = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; to = 5FA0EDE8C24FAAE7.1776847087.5093750 ; } ;  ]
2026-04-22 08:38:07.222 ===EARLY_MEDIA_RINGBACK_STARTED:RU===
2026-04-22 08:38:07.222 Sent event to JS onPhoneEvent with params [{id = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; name = Player.PlaybackReady ; } ;  ]
2026-04-22 08:38:07.222 Sent event to JS onPhoneEvent with params [{id = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; name = Player.Started ; duration = 5000 ; } ;  ]
2026-04-22 08:38:07.226 CallId=5FA0EDE8C24FAAE7.1776847087.5093750: Enable media statistics for 5FA0EDE8C24FAAE7.1776847087.5093750 : https://storage-gw-ru-02.voximplant.com/voximplant-logs-secure/2026/04/22/MDVkZDU0YWNlNWE0NDdkY2I2N2I0OTEwNWI4ZjY5OWQvaHR0cDovL3d3dy1ydS01Mi0xOC52b3hpbXBsYW50LmNvbTo4MDgwL2xvZ3MvMjAyNi8wNC8yMi8yMDREMkI0NzlFOEVGMEQ0LjE3NzY4NDcwODcuNTA5Mzc1MV8xODUuMTY0LjE1MC4xOF81RkEwRURFOEMyNEZBQUU3LjE3NzY4NDcwODcuNTA5Mzc1MC5jc3Y-?sessionid=4611818862
2026-04-22 08:38:07.285 Sent event from JS onPhoneEvent with params {"name":"Call.PlaybackReady","id":"5FA0EDE8C24FAAE7.1776847087.5093750","call":{"rism":{}}}
2026-04-22 08:38:07.285 Sent event from JS onPhoneEvent with params {"duration":5000,"name":"Call.PlaybackStarted","id":"5FA0EDE8C24FAAE7.1776847087.5093750","call":{"rism":{}}}
2026-04-22 08:38:12.195 ===ANSWER_DELAY_MS:5000===
2026-04-22 08:38:12.195 Executing JS command: AcceptCall with params [{headers = NULL ; id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; parameters = {} ; } ;  ]
2026-04-22 08:38:12.195 ===CALL_ANSWERED===
2026-04-22 08:38:12.195 Sent request from JS ApplicationStorage.get with params [{key = GEMINI_API_KEY } ;  ]
2026-04-22 08:38:12.195 Sent request from JS ApplicationStorage.get with params [{key = TELEGRAM_BOT_TOKEN } ;  ]
2026-04-22 08:38:12.195 Sent request from JS ApplicationStorage.get with params [{key = TELEGRAM_CHAT_ID_ADMIN } ;  ]
2026-04-22 08:38:12.195 Sent request from JS ApplicationStorage.get with params [{key = TELEGRAM_CHAT_ID_USER } ;  ]
2026-04-22 08:38:12.196 Sent request from JS ApplicationStorage.get with params [{key = TELEGRAM_CHAT_ID } ;  ]
2026-04-22 08:38:12.211 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.FirstAudioPacketReceived ; } ;  ]
2026-04-22 08:38:12.215 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.Connected ; sipCallId = 95f029e43e2611f18589047d7bbbc100@185.54.48.6 ; sipTransport = UDP ; headers = {} ; displayName =  ; encrypted = false ; } ;  ]
2026-04-22 08:38:12.215 ===CALL_CONNECTED===
2026-04-22 08:38:12.223 {"displayName":"","encrypted":false,"headers":{},"id":"5FA0EDE8C24FAAE7.1776847087.5093750","name":"Call.Connected","sipCallId":"95f029e43e2611f18589047d7bbbc100@185.54.48.6","sipTransport":"UDP","eventSourceField":"call","call":{"rism":{},"_isAnsweredStatus":true,"_connectedTime":1776847092215}}
2026-04-22 08:38:12.223 Executing JS command: Record with params [{classification = {} ; contentDispositionFilename =  ; dict = NULL ; expireSuffix =  ; format = text ; hd_audio = true ; id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; labels = NULL ; language =  ; lossless = false ; recordNamePrefix =  ; s3 = {} ; secure = false ; stereo = true ; transcribe = false ; video = false ; videoopt = {} ; } ;  ]
2026-04-22 08:38:12.224 ===CALL_RECORDING_START_REQUESTED===
2026-04-22 08:38:12.231 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.AudioQualityDetected ; quality = Standard ; } ;  ]
2026-04-22 08:38:12.242 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.RecordStarted ; url = https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345 ; } ;  ]
2026-04-22 08:38:12.299 ===CALL_RECORD_STARTED===
2026-04-22 08:38:12.299 {"id":"5FA0EDE8C24FAAE7.1776847087.5093750","name":"Call.RecordStarted","url":"https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345","eventSourceField":"call","call":{"rism":{},"_isAnsweredStatus":true,"_connectedTime":1776847092215}}
2026-04-22 08:38:12.299 ===CONFIG_LOADED===
2026-04-22 08:38:12.299 {"hasGeminiKey":true,"hasTelegramToken":true,"adminChats":["7476208806"],"userChats":[],"callerPhone":"79117027598"}
2026-04-22 08:38:12.299 ===MODEL_MODE:legacy_live===
2026-04-22 08:38:12.299 Executing JS command: CreateWebSocket with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; } ;  wss://local/gemini ;  {headers = ****** ; privacy = false ; } ;  ]
2026-04-22 08:38:12.300 {"url":"wss://local/gemini","onclose":null,"onerror":null,"onmessage":null,"onopen":null,"oncreated":null,"onmediastarted":null,"onmediaended":null,"readyState":"connecting","_id":"odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw"}
2026-04-22 08:38:12.300 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Created ; } ;  ]
2026-04-22 08:38:12.311 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Open ; } ;  ]
2026-04-22 08:38:12.316 ===WS_TIMER_STARTED===
2026-04-22 08:38:12.316 ===GEMINI_CLIENT_CREATED===
2026-04-22 08:38:12.467 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ConnectorInformation","payload":{"applicationVersion":"0.44.0","id":"9ec9822c9c018ff522238482c2c8360e","endpoint":"/gemini"}} ; } ;  ]
2026-04-22 08:38:12.816 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"SetupComplete","payload":{}} ; } ;  ]
2026-04-22 08:38:12.857 ===Gemini.LiveAPIEvents.SetupComplete===
2026-04-22 08:38:12.857 Executing JS command: SendMediaBetween with params [{id1 = 5FA0EDE8C24FAAE7.1776847087.5093750 ; id2 = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; } ;  ]
2026-04-22 08:38:12.858 Executing JS command: SendMessageWebSocket with params [odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ;  {"customEvent":"RealtimeInput","payload":{"text":"Начни разговор с фразы: \"Здравствуйте! Меня зовут Екатерина, я ИИ-менеджер компании Crystal Stone. Скажите, как я могу к вам обращаться?\" Говори естественно и коротко, задавай только один вопрос за раз. Если клиент сразу объясняет запрос, не перебивай и не возвращайся резко в стартовый скрипт. Если клиент диктует номер телефона, не перебивай и дослушивай номер до конца. Номер из системы: 79117027598. Уточни его актуальность по ходу разговора. Перед финальным прощанием обязательно вызови функцию save_call_summary."}} ;  ]
2026-04-22 08:38:12.858 ===MODEL_TEXT_SENT_REALTIME_INPUT:start_prompt===
2026-04-22 08:38:12.858 ===START_PROMPT_SENT===
2026-04-22 08:38:13.472 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Здравствуйте! Меня"}}} ; } ;  ]
2026-04-22 08:38:13.472 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:13.495 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:13.495 {"outputTranscription":{"text":"Здравствуйте! Меня"}}
2026-04-22 08:38:14.001 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" зовут"}}} ; } ;  ]
2026-04-22 08:38:14.044 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.044 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.044 {"outputTranscription":{"text":" зовут"}}
2026-04-22 08:38:14.106 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Екатерина,"}}} ; } ;  ]
2026-04-22 08:38:14.145 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.161 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.162 {"outputTranscription":{"text":" Екатерина,"}}
2026-04-22 08:38:14.217 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:38:14.286 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:38:14.286 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:38:14.377 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" я"}}} ; } ;  ]
2026-04-22 08:38:14.419 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.459 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.459 {"outputTranscription":{"text":" я"}}
2026-04-22 08:38:14.497 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" ИИ-менеджер"}}} ; } ;  ]
2026-04-22 08:38:14.541 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.542 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.542 {"outputTranscription":{"text":" ИИ-менеджер"}}
2026-04-22 08:38:14.717 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" компании"}}} ; } ;  ]
2026-04-22 08:38:14.718 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.722 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.722 {"outputTranscription":{"text":" компании"}}
2026-04-22 08:38:14.917 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Crystal"}}} ; } ;  ]
2026-04-22 08:38:14.917 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:14.959 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:14.959 {"outputTranscription":{"text":" Crystal"}}
2026-04-22 08:38:15.078 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Stone."}}} ; } ;  ]
2026-04-22 08:38:15.078 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.118 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.118 {"outputTranscription":{"text":" Stone."}}
2026-04-22 08:38:15.216 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Скажите,"}}} ; } ;  ]
2026-04-22 08:38:15.257 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.257 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.257 {"outputTranscription":{"text":" Скажите,"}}
2026-04-22 08:38:15.469 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" как"}}} ; } ;  ]
2026-04-22 08:38:15.470 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.480 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" я могу"}}} ; } ;  ]
2026-04-22 08:38:15.480 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.480 {"outputTranscription":{"text":" как"}}
2026-04-22 08:38:15.480 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.521 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.521 {"outputTranscription":{"text":" я могу"}}
2026-04-22 08:38:15.557 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" к вам"}}} ; } ;  ]
2026-04-22 08:38:15.598 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.617 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" обращаться?"}}} ; } ;  ]
2026-04-22 08:38:15.617 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.617 {"outputTranscription":{"text":" к вам"}}
2026-04-22 08:38:15.617 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:15.642 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:15.642 {"outputTranscription":{"text":" обращаться?"}}
2026-04-22 08:38:20.759 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":6276,"responseTokenCount":179,"totalTokenCount":6455,"promptTokensDetails":[{"modality":"TEXT","tokenCount":6276}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":179}]}} ; } ;  ]
2026-04-22 08:38:20.759 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:38:20.816 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:20.816 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:20.816 {"turnComplete":true}
2026-04-22 08:38:22.056 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 6 ; } ; } ;  ]
2026-04-22 08:38:22.101 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:38:22.101 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":6}}
2026-04-22 08:38:23.651 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" Здрав"}}} ; } ;  ]
2026-04-22 08:38:23.651 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ствуйте, Александр."}}} ; } ;  ]
2026-04-22 08:38:23.692 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:23.692 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:23.692 {"inputTranscription":{"text":" Здрав"}}
2026-04-22 08:38:23.692 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:23.692 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:23.692 {"inputTranscription":{"text":"ствуйте, Александр."}}
2026-04-22 08:38:24.348 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Очень приятно,"}}} ; } ;  ]
2026-04-22 08:38:24.391 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:24.391 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:24.391 {"outputTranscription":{"text":"Очень приятно,"}}
2026-04-22 08:38:24.765 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Александр."}}} ; } ;  ]
2026-04-22 08:38:24.806 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:24.817 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:24.817 {"outputTranscription":{"text":" Александр."}}
2026-04-22 08:38:24.941 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Подскажите,"}}} ; } ;  ]
2026-04-22 08:38:24.944 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:24.944 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:24.944 {"outputTranscription":{"text":" Подскажите,"}}
2026-04-22 08:38:25.096 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:38:25.097 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:38:25.115 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:38:25.177 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" пожалуйста,"}}} ; } ;  ]
2026-04-22 08:38:25.205 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:25.205 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:25.205 {"outputTranscription":{"text":" пожалуйста,"}}
2026-04-22 08:38:25.356 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" из"}}} ; } ;  ]
2026-04-22 08:38:25.356 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:25.391 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:25.391 {"outputTranscription":{"text":" из"}}
2026-04-22 08:38:25.450 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" какого"}}} ; } ;  ]
2026-04-22 08:38:25.491 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:25.504 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:25.504 {"outputTranscription":{"text":" какого"}}
2026-04-22 08:38:25.516 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вы города?"}}} ; } ;  ]
2026-04-22 08:38:25.517 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:25.558 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:25.558 {"outputTranscription":{"text":" вы города?"}}
2026-04-22 08:38:28.970 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":6562,"responseTokenCount":111,"totalTokenCount":6673,"promptTokensDetails":[{"modality":"TEXT","tokenCount":6548},{"modality":"AUDIO","tokenCount":14}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":111}]}} ; } ;  ]
2026-04-22 08:38:28.970 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:38:29.036 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:29.036 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:29.036 {"turnComplete":true}
2026-04-22 08:38:30.256 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 11 ; } ; } ;  ]
2026-04-22 08:38:30.312 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:38:30.312 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":11}}
2026-04-22 08:38:31.611 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" В Санкт-Петербург."}}} ; } ;  ]
2026-04-22 08:38:31.652 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:31.652 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:31.652 {"inputTranscription":{"text":" В Санкт-Петербург."}}
2026-04-22 08:38:32.194 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Поняла вас."}}} ; } ;  ]
2026-04-22 08:38:32.275 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:32.275 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:32.275 {"outputTranscription":{"text":"Поняла вас."}}
2026-04-22 08:38:32.553 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Чем"}}} ; } ;  ]
2026-04-22 08:38:32.594 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:32.594 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:32.594 {"outputTranscription":{"text":" Чем"}}
2026-04-22 08:38:32.717 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" я могу"}}} ; } ;  ]
2026-04-22 08:38:32.747 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:32.747 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:32.747 {"outputTranscription":{"text":" я могу"}}
2026-04-22 08:38:32.777 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вам помочь?"}}} ; } ;  ]
2026-04-22 08:38:32.818 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:32.859 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:32.859 {"outputTranscription":{"text":" вам помочь?"}}
2026-04-22 08:38:32.916 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:38:32.959 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:38:32.999 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:38:35.137 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":6750,"responseTokenCount":70,"totalTokenCount":6820,"promptTokensDetails":[{"modality":"TEXT","tokenCount":6728},{"modality":"AUDIO","tokenCount":22}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":70}]}} ; } ;  ]
2026-04-22 08:38:35.137 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:38:35.178 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:35.178 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:35.178 {"turnComplete":true}
2026-04-22 08:38:36.436 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 13 ; } ; } ;  ]
2026-04-22 08:38:36.477 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:38:36.477 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":13}}
2026-04-22 08:38:38.052 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" Хо"}}} ; } ;  ]
2026-04-22 08:38:38.093 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:38.093 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:38.093 {"inputTranscription":{"text":" Хо"}}
2026-04-22 08:38:38.209 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"тел"}}} ; } ;  ]
2026-04-22 08:38:38.251 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:38.291 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:38.291 {"inputTranscription":{"text":"тел"}}
2026-04-22 08:38:38.372 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" бы"}}} ; } ;  ]
2026-04-22 08:38:38.453 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:38.453 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:38.453 {"inputTranscription":{"text":" бы"}}
2026-04-22 08:38:38.873 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" про"}}} ; } ;  ]
2026-04-22 08:38:38.911 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:38.911 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:38.911 {"inputTranscription":{"text":" про"}}
2026-04-22 08:38:39.023 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"счи"}}} ; } ;  ]
2026-04-22 08:38:39.023 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:39.064 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:39.064 {"inputTranscription":{"text":"счи"}}
2026-04-22 08:38:39.182 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"тать"}}} ; } ;  ]
2026-04-22 08:38:39.198 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:39.205 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:39.205 {"inputTranscription":{"text":"тать"}}
2026-04-22 08:38:39.342 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" у"}}} ; } ;  ]
2026-04-22 08:38:39.361 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:39.362 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:39.362 {"inputTranscription":{"text":" у"}}
2026-04-22 08:38:39.503 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" вас"}}} ; } ;  ]
2026-04-22 08:38:39.503 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:39.507 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:39.507 {"inputTranscription":{"text":" вас"}}
2026-04-22 08:38:39.983 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" сто"}}} ; } ;  ]
2026-04-22 08:38:40.029 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.029 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.029 {"inputTranscription":{"text":" сто"}}
2026-04-22 08:38:40.141 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ле"}}} ; } ;  ]
2026-04-22 08:38:40.142 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.184 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.184 {"inputTranscription":{"text":"ле"}}
2026-04-22 08:38:40.304 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"шни"}}} ; } ;  ]
2026-04-22 08:38:40.346 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.346 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.346 {"inputTranscription":{"text":"шни"}}
2026-04-22 08:38:40.467 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"цы"}}} ; } ;  ]
2026-04-22 08:38:40.468 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.509 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.509 {"inputTranscription":{"text":"цы"}}
2026-04-22 08:38:40.622 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" из"}}} ; } ;  ]
2026-04-22 08:38:40.664 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.664 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.664 {"inputTranscription":{"text":" из"}}
2026-04-22 08:38:40.671 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" кварцев агломерата."}}} ; } ;  ]
2026-04-22 08:38:40.713 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:40.729 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:40.729 {"inputTranscription":{"text":" кварцев агломерата."}}
2026-04-22 08:38:41.269 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Да, конечно."}}} ; } ;  ]
2026-04-22 08:38:41.311 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:41.351 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:41.351 {"outputTranscription":{"text":"Да, конечно."}}
2026-04-22 08:38:41.615 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Чтобы"}}} ; } ;  ]
2026-04-22 08:38:41.643 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:41.643 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:41.643 {"outputTranscription":{"text":" Чтобы"}}
2026-04-22 08:38:41.759 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" подготовить"}}} ; } ;  ]
2026-04-22 08:38:41.761 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:41.792 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:41.792 {"outputTranscription":{"text":" подготовить"}}
2026-04-22 08:38:41.816 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:38:41.818 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:38:41.858 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:38:41.937 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" расчёт,"}}} ; } ;  ]
2026-04-22 08:38:41.978 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:41.978 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:41.978 {"outputTranscription":{"text":" расчёт,"}}
2026-04-22 08:38:42.077 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" нам"}}} ; } ;  ]
2026-04-22 08:38:42.128 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.128 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.128 {"outputTranscription":{"text":" нам"}}
2026-04-22 08:38:42.137 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" нужны"}}} ; } ;  ]
2026-04-22 08:38:42.137 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.150 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.150 {"outputTranscription":{"text":" нужны"}}
2026-04-22 08:38:42.297 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" размеры,"}}} ; } ;  ]
2026-04-22 08:38:42.339 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.339 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.339 {"outputTranscription":{"text":" размеры,"}}
2026-04-22 08:38:42.536 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" чертеж"}}} ; } ;  ]
2026-04-22 08:38:42.595 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.595 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.595 {"outputTranscription":{"text":" чертеж"}}
2026-04-22 08:38:42.756 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" или"}}} ; } ;  ]
2026-04-22 08:38:42.757 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.798 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.798 {"outputTranscription":{"text":" или"}}
2026-04-22 08:38:42.857 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" схема"}}} ; } ;  ]
2026-04-22 08:38:42.898 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:42.898 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:42.898 {"outputTranscription":{"text":" схема"}}
2026-04-22 08:38:43.017 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" будущих"}}} ; } ;  ]
2026-04-22 08:38:43.059 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.099 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.099 {"outputTranscription":{"text":" будущих"}}
2026-04-22 08:38:43.156 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" изделий."}}} ; } ;  ]
2026-04-22 08:38:43.157 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.157 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.157 {"outputTranscription":{"text":" изделий."}}
2026-04-22 08:38:43.297 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Как"}}} ; } ;  ]
2026-04-22 08:38:43.338 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.362 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.362 {"outputTranscription":{"text":" Как"}}
2026-04-22 08:38:43.497 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вам удобнее:"}}} ; } ;  ]
2026-04-22 08:38:43.538 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.538 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.538 {"outputTranscription":{"text":" вам удобнее:"}}
2026-04-22 08:38:43.676 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" продиктовать"}}} ; } ;  ]
2026-04-22 08:38:43.684 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.684 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.684 {"outputTranscription":{"text":" продиктовать"}}
2026-04-22 08:38:43.897 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" сейчас"}}} ; } ;  ]
2026-04-22 08:38:43.902 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:43.902 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:43.902 {"outputTranscription":{"text":" сейчас"}}
2026-04-22 08:38:44.057 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" или"}}} ; } ;  ]
2026-04-22 08:38:44.098 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.098 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.098 {"outputTranscription":{"text":" или"}}
2026-04-22 08:38:44.235 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" отправить"}}} ; } ;  ]
2026-04-22 08:38:44.247 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.247 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.247 {"outputTranscription":{"text":" отправить"}}
2026-04-22 08:38:44.357 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" нам в"}}} ; } ;  ]
2026-04-22 08:38:44.398 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.398 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.398 {"outputTranscription":{"text":" нам в"}}
2026-04-22 08:38:44.457 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" мессенджер"}}} ; } ;  ]
2026-04-22 08:38:44.516 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.516 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.516 {"outputTranscription":{"text":" мессенджер"}}
2026-04-22 08:38:44.636 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" или"}}} ; } ;  ]
2026-04-22 08:38:44.705 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.705 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.705 {"outputTranscription":{"text":" или"}}
2026-04-22 08:38:44.716 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" на почту?"}}} ; } ;  ]
2026-04-22 08:38:44.800 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:44.800 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:44.800 {"outputTranscription":{"text":" на почту?"}}
2026-04-22 08:38:53.532 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":6964,"responseTokenCount":301,"totalTokenCount":7265,"promptTokensDetails":[{"modality":"TEXT","tokenCount":6937},{"modality":"AUDIO","tokenCount":27}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":301}]}} ; } ;  ]
2026-04-22 08:38:53.532 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:38:53.537 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:53.577 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:53.577 {"turnComplete":true}
2026-04-22 08:38:54.816 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 25 ; } ; } ;  ]
2026-04-22 08:38:54.859 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:38:54.867 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":25}}
2026-04-22 08:38:56.130 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" А"}}} ; } ;  ]
2026-04-22 08:38:56.183 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:56.183 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:56.183 {"inputTranscription":{"text":" А"}}
2026-04-22 08:38:56.291 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" ска"}}} ; } ;  ]
2026-04-22 08:38:56.332 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:56.335 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:56.335 {"inputTranscription":{"text":" ска"}}
2026-04-22 08:38:56.451 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"жите"}}} ; } ;  ]
2026-04-22 08:38:56.494 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:56.534 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:56.534 {"inputTranscription":{"text":"жите"}}
2026-04-22 08:38:56.610 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":", пожал"}}} ; } ;  ]
2026-04-22 08:38:56.628 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:56.628 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:56.628 {"inputTranscription":{"text":", пожал"}}
2026-04-22 08:38:56.772 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"уйста,"}}} ; } ;  ]
2026-04-22 08:38:56.772 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:56.798 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:56.798 {"inputTranscription":{"text":"уйста,"}}
2026-04-22 08:38:57.091 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" у вас"}}} ; } ;  ]
2026-04-22 08:38:57.133 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.133 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.133 {"inputTranscription":{"text":" у вас"}}
2026-04-22 08:38:57.250 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" все"}}} ; } ;  ]
2026-04-22 08:38:57.251 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.251 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.291 {"inputTranscription":{"text":" все"}}
2026-04-22 08:38:57.409 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" ви"}}} ; } ;  ]
2026-04-22 08:38:57.410 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.451 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.451 {"inputTranscription":{"text":" ви"}}
2026-04-22 08:38:57.570 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ды"}}} ; } ;  ]
2026-04-22 08:38:57.571 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.580 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.580 {"inputTranscription":{"text":"ды"}}
2026-04-22 08:38:57.737 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" про"}}} ; } ;  ]
2026-04-22 08:38:57.770 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.770 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.770 {"inputTranscription":{"text":" про"}}
2026-04-22 08:38:57.903 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"извод"}}} ; } ;  ]
2026-04-22 08:38:57.908 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:57.908 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:57.908 {"inputTranscription":{"text":"извод"}}
2026-04-22 08:38:58.061 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ите"}}} ; } ;  ]
2026-04-22 08:38:58.066 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:58.066 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:58.066 {"inputTranscription":{"text":"ите"}}
2026-04-22 08:38:58.220 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"лей"}}} ; } ;  ]
2026-04-22 08:38:58.220 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:58.228 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:58.228 {"inputTranscription":{"text":"лей"}}
2026-04-22 08:38:58.702 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" при"}}} ; } ;  ]
2026-04-22 08:38:58.786 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:58.786 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:58.786 {"inputTranscription":{"text":" при"}}
2026-04-22 08:38:58.864 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"сут"}}} ; } ;  ]
2026-04-22 08:38:58.905 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:58.905 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:58.905 {"inputTranscription":{"text":"сут"}}
2026-04-22 08:38:59.022 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ству"}}} ; } ;  ]
2026-04-22 08:38:59.023 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:59.064 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:59.064 {"inputTranscription":{"text":"ству"}}
2026-04-22 08:38:59.182 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"ют"}}} ; } ;  ]
2026-04-22 08:38:59.228 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:59.228 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:59.228 {"inputTranscription":{"text":"ют"}}
2026-04-22 08:38:59.653 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" или"}}} ; } ;  ]
2026-04-22 08:38:59.695 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:38:59.728 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:38:59.728 {"inputTranscription":{"text":" или"}}
2026-04-22 08:38:59.971 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" вы"}}} ; } ;  ]
2026-04-22 08:39:00.017 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:00.017 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:00.017 {"inputTranscription":{"text":" вы"}}
2026-04-22 08:39:00.130 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" работ"}}} ; } ;  ]
2026-04-22 08:39:00.177 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:00.177 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:00.177 {"inputTranscription":{"text":" работ"}}
2026-04-22 08:39:00.293 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"аете с"}}} ; } ;  ]
2026-04-22 08:39:00.334 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:00.366 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:00.366 {"inputTranscription":{"text":"аете с"}}
2026-04-22 08:39:00.616 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" кем"}}} ; } ;  ]
2026-04-22 08:39:00.616 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"-то определённым."}}} ; } ;  ]
2026-04-22 08:39:00.651 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:00.651 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:00.651 {"inputTranscription":{"text":" кем"}}
2026-04-22 08:39:00.651 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:00.651 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:00.651 {"inputTranscription":{"text":"-то определённым."}}
2026-04-22 08:39:01.272 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Точную информацию"}}} ; } ;  ]
2026-04-22 08:39:01.314 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:01.344 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:01.344 {"outputTranscription":{"text":"Точную информацию"}}
2026-04-22 08:39:01.813 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" по производителям"}}} ; } ;  ]
2026-04-22 08:39:01.866 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:01.866 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:01.866 {"outputTranscription":{"text":" по производителям"}}
2026-04-22 08:39:02.016 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:39:02.017 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:39:02.017 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" и наличию"}}} ; } ;  ]
2026-04-22 08:39:02.017 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:39:02.017 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.057 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.057 {"outputTranscription":{"text":" и наличию"}}
2026-04-22 08:39:02.220 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" материалов"}}} ; } ;  ]
2026-04-22 08:39:02.262 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.262 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.262 {"outputTranscription":{"text":" материалов"}}
2026-04-22 08:39:02.418 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" менеджеры"}}} ; } ;  ]
2026-04-22 08:39:02.464 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.464 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.464 {"outputTranscription":{"text":" менеджеры"}}
2026-04-22 08:39:02.597 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" проверяют"}}} ; } ;  ]
2026-04-22 08:39:02.639 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.639 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.639 {"outputTranscription":{"text":" проверяют"}}
2026-04-22 08:39:02.736 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" в рабочее"}}} ; } ;  ]
2026-04-22 08:39:02.748 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.789 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.789 {"outputTranscription":{"text":" в рабочее"}}
2026-04-22 08:39:02.877 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" время."}}} ; } ;  ]
2026-04-22 08:39:02.919 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:02.945 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:02.945 {"outputTranscription":{"text":" время."}}
2026-04-22 08:39:03.021 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Я могу"}}} ; } ;  ]
2026-04-22 08:39:03.037 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" зафиксировать"}}} ; } ;  ]
2026-04-22 08:39:03.037 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.037 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.037 {"outputTranscription":{"text":" Я могу"}}
2026-04-22 08:39:03.038 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.078 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.078 {"outputTranscription":{"text":" зафиксировать"}}
2026-04-22 08:39:03.457 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" ваш"}}} ; } ;  ]
2026-04-22 08:39:03.458 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.498 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.498 {"outputTranscription":{"text":" ваш"}}
2026-04-22 08:39:03.517 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" запрос"}}} ; } ;  ]
2026-04-22 08:39:03.554 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.595 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.595 {"outputTranscription":{"text":" запрос"}}
2026-04-22 08:39:03.676 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" и передать"}}} ; } ;  ]
2026-04-22 08:39:03.678 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.718 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.718 {"outputTranscription":{"text":" и передать"}}
2026-04-22 08:39:03.877 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" его менеджеру,"}}} ; } ;  ]
2026-04-22 08:39:03.927 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:03.927 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:03.927 {"outputTranscription":{"text":" его менеджеру,"}}
2026-04-22 08:39:04.083 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" чтобы"}}} ; } ;  ]
2026-04-22 08:39:04.083 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:04.109 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:04.109 {"outputTranscription":{"text":" чтобы"}}
2026-04-22 08:39:04.176 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вас"}}} ; } ;  ]
2026-04-22 08:39:04.218 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:04.228 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:04.228 {"outputTranscription":{"text":" вас"}}
2026-04-22 08:39:04.250 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" подробно"}}} ; } ;  ]
2026-04-22 08:39:04.292 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:04.332 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:04.332 {"outputTranscription":{"text":" подробно"}}
2026-04-22 08:39:04.416 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" проконсультировали."}}} ; } ;  ]
2026-04-22 08:39:04.417 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:04.417 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:04.420 {"outputTranscription":{"text":" проконсультировали."}}
2026-04-22 08:39:04.676 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Подскажите,"}}} ; } ;  ]
2026-04-22 08:39:04.718 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:04.728 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:04.728 {"outputTranscription":{"text":" Подскажите,"}}
2026-04-22 08:39:04.997 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" как"}}} ; } ;  ]
2026-04-22 08:39:04.997 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:05.037 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:05.037 {"outputTranscription":{"text":" как"}}
2026-04-22 08:39:05.097 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вам удобнее,"}}} ; } ;  ]
2026-04-22 08:39:05.129 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:05.129 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:05.129 {"outputTranscription":{"text":" вам удобнее,"}}
2026-04-22 08:39:05.277 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" чтобы"}}} ; } ;  ]
2026-04-22 08:39:05.318 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:05.318 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:05.318 {"outputTranscription":{"text":" чтобы"}}
2026-04-22 08:39:05.373 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" с вами"}}} ; } ;  ]
2026-04-22 08:39:05.415 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:05.415 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:05.415 {"outputTranscription":{"text":" с вами"}}
2026-04-22 08:39:05.456 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" связались?"}}} ; } ;  ]
2026-04-22 08:39:05.456 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:05.465 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:05.465 {"outputTranscription":{"text":" связались?"}}
2026-04-22 08:39:16.132 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":7535,"responseTokenCount":371,"totalTokenCount":7906,"promptTokensDetails":[{"modality":"TEXT","tokenCount":7485},{"modality":"AUDIO","tokenCount":50}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":371}]}} ; } ;  ]
2026-04-22 08:39:16.132 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:39:16.175 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:16.175 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:16.175 {"turnComplete":true}
2026-04-22 08:39:17.416 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 39 ; } ; } ;  ]
2026-04-22 08:39:17.420 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:39:17.420 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":39}}
2026-04-22 08:39:19.108 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" Но"}}} ; } ;  ]
2026-04-22 08:39:19.149 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:19.149 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:19.149 {"inputTranscription":{"text":" Но"}}
2026-04-22 08:39:19.412 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" мне"}}} ; } ;  ]
2026-04-22 08:39:19.413 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:19.413 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:19.413 {"inputTranscription":{"text":" мне"}}
2026-04-22 08:39:19.572 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" было"}}} ; } ;  ]
2026-04-22 08:39:19.610 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:19.610 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:19.610 {"inputTranscription":{"text":" было"}}
2026-04-22 08:39:19.733 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" бы"}}} ; } ;  ]
2026-04-22 08:39:19.775 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:19.812 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:19.812 {"inputTranscription":{"text":" бы"}}
2026-04-22 08:39:19.892 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" уд"}}} ; } ;  ]
2026-04-22 08:39:19.894 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:19.897 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:19.897 {"inputTranscription":{"text":" уд"}}
2026-04-22 08:39:20.061 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"об"}}} ; } ;  ]
2026-04-22 08:39:20.109 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:20.109 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:20.109 {"inputTranscription":{"text":"об"}}
2026-04-22 08:39:20.244 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":"но"}}} ; } ;  ]
2026-04-22 08:39:20.286 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:20.286 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:20.286 {"inputTranscription":{"text":"но"}}
2026-04-22 08:39:20.693 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" по"}}} ; } ;  ]
2026-04-22 08:39:20.693 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" электронной почте."}}} ; } ;  ]
2026-04-22 08:39:20.735 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:20.775 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:20.775 {"inputTranscription":{"text":" по"}}
2026-04-22 08:39:20.775 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:20.775 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:20.775 {"inputTranscription":{"text":" электронной почте."}}
2026-04-22 08:39:21.390 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Хорошо, поняла"}}} ; } ;  ]
2026-04-22 08:39:21.407 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:21.407 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:21.407 {"outputTranscription":{"text":"Хорошо, поняла"}}
2026-04-22 08:39:21.755 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вас."}}} ; } ;  ]
2026-04-22 08:39:21.798 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:21.836 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Я зафиксирую"}}} ; } ;  ]
2026-04-22 08:39:21.837 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:21.837 {"outputTranscription":{"text":" вас."}}
2026-04-22 08:39:21.837 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:21.864 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:21.864 {"outputTranscription":{"text":" Я зафиксирую"}}
2026-04-22 08:39:22.036 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:39:22.077 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:39:22.099 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:39:22.117 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" ваш"}}} ; } ;  ]
2026-04-22 08:39:22.180 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.180 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.180 {"outputTranscription":{"text":" ваш"}}
2026-04-22 08:39:22.203 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" запрос"}}} ; } ;  ]
2026-04-22 08:39:22.226 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.226 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.226 {"outputTranscription":{"text":" запрос"}}
2026-04-22 08:39:22.359 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" и"}}} ; } ;  ]
2026-04-22 08:39:22.397 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" передам"}}} ; } ;  ]
2026-04-22 08:39:22.397 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.397 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.397 {"outputTranscription":{"text":" и"}}
2026-04-22 08:39:22.397 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.405 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.405 {"outputTranscription":{"text":" передам"}}
2026-04-22 08:39:22.536 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" контакты"}}} ; } ;  ]
2026-04-22 08:39:22.587 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.587 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.587 {"outputTranscription":{"text":" контакты"}}
2026-04-22 08:39:22.656 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" менеджеру."}}} ; } ;  ]
2026-04-22 08:39:22.698 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.704 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.704 {"outputTranscription":{"text":" менеджеру."}}
2026-04-22 08:39:22.836 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Подскажите,"}}} ; } ;  ]
2026-04-22 08:39:22.877 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:22.877 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:22.877 {"outputTranscription":{"text":" Подскажите,"}}
2026-04-22 08:39:23.156 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" номер,"}}} ; } ;  ]
2026-04-22 08:39:23.198 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.239 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.239 {"outputTranscription":{"text":" номер,"}}
2026-04-22 08:39:23.282 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" с которого"}}} ; } ;  ]
2026-04-22 08:39:23.324 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.324 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.324 {"outputTranscription":{"text":" с которого"}}
2026-04-22 08:39:23.417 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" вы сейчас"}}} ; } ;  ]
2026-04-22 08:39:23.418 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.458 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.458 {"outputTranscription":{"text":" вы сейчас"}}
2026-04-22 08:39:23.556 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" звоните,"}}} ; } ;  ]
2026-04-22 08:39:23.560 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.589 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.589 {"outputTranscription":{"text":" звоните,"}}
2026-04-22 08:39:23.716 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" актуальный"}}} ; } ;  ]
2026-04-22 08:39:23.757 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.757 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.757 {"outputTranscription":{"text":" актуальный"}}
2026-04-22 08:39:23.877 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" для связи?"}}} ; } ;  ]
2026-04-22 08:39:23.877 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:23.918 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:23.918 {"outputTranscription":{"text":" для связи?"}}
2026-04-22 08:39:30.715 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":8097,"responseTokenCount":232,"totalTokenCount":8329,"promptTokensDetails":[{"modality":"TEXT","tokenCount":8022},{"modality":"AUDIO","tokenCount":75}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":232}]}} ; } ;  ]
2026-04-22 08:39:30.715 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:39:30.721 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:30.759 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:30.759 {"turnComplete":true}
2026-04-22 08:39:31.996 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 48 ; } ; } ;  ]
2026-04-22 08:39:32.037 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:39:32.037 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":48}}
2026-04-22 08:39:33.571 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" \u003cnoise\u003e"}}} ; } ;  ]
2026-04-22 08:39:33.614 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:33.654 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:33.654 {"inputTranscription":{"text":" <noise>"}}
2026-04-22 08:39:34.170 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Отлично. Тогда"}}} ; } ;  ]
2026-04-22 08:39:34.179 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:34.179 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:34.179 {"outputTranscription":{"text":"Отлично. Тогда"}}
2026-04-22 08:39:34.677 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" я ожидаю"}}} ; } ;  ]
2026-04-22 08:39:34.718 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:34.718 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:34.718 {"outputTranscription":{"text":" я ожидаю"}}
2026-04-22 08:39:34.837 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" ваш"}}} ; } ;  ]
2026-04-22 08:39:34.876 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:39:34.878 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:34.878 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:34.878 {"outputTranscription":{"text":" ваш"}}
2026-04-22 08:39:34.878 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:39:34.878 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:39:34.897 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" запрос"}}} ; } ;  ]
2026-04-22 08:39:34.953 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:34.953 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:34.953 {"outputTranscription":{"text":" запрос"}}
2026-04-22 08:39:35.017 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" на электронной"}}} ; } ;  ]
2026-04-22 08:39:35.058 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:35.058 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:35.058 {"outputTranscription":{"text":" на электронной"}}
2026-04-22 08:39:35.178 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" почте:"}}} ; } ;  ]
2026-04-22 08:39:35.220 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:35.220 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:35.220 {"outputTranscription":{"text":" почте:"}}
2026-04-22 08:39:35.337 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" info@crystalstone.ru."}}} ; } ;  ]
2026-04-22 08:39:35.378 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:35.378 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:35.378 {"outputTranscription":{"text":" info@crystalstone.ru."}}
2026-04-22 08:39:36.137 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Менеджер"}}} ; } ;  ]
2026-04-22 08:39:36.137 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:36.178 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:36.178 {"outputTranscription":{"text":" Менеджер"}}
2026-04-22 08:39:36.441 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" свяжется"}}} ; } ;  ]
2026-04-22 08:39:36.441 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:36.479 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:36.479 {"outputTranscription":{"text":" свяжется"}}
2026-04-22 08:39:36.617 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" с вами"}}} ; } ;  ]
2026-04-22 08:39:36.685 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:36.685 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:36.685 {"outputTranscription":{"text":" с вами"}}
2026-04-22 08:39:36.737 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" в ближайшее"}}} ; } ;  ]
2026-04-22 08:39:36.758 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:36.769 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:36.769 {"outputTranscription":{"text":" в ближайшее"}}
2026-04-22 08:39:36.917 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" рабочее"}}} ; } ;  ]
2026-04-22 08:39:36.959 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:36.985 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:36.985 {"outputTranscription":{"text":" рабочее"}}
2026-04-22 08:39:37.056 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" время."}}} ; } ;  ]
2026-04-22 08:39:37.127 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:37.127 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:37.128 {"outputTranscription":{"text":" время."}}
2026-04-22 08:39:37.196 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Я могу"}}} ; } ;  ]
2026-04-22 08:39:37.197 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:37.210 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:37.210 {"outputTranscription":{"text":" Я могу"}}
2026-04-22 08:39:37.437 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" еще"}}} ; } ;  ]
2026-04-22 08:39:37.478 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:37.518 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:37.518 {"outputTranscription":{"text":" еще"}}
2026-04-22 08:39:38.776 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" чем-то"}}} ; } ;  ]
2026-04-22 08:39:38.827 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:38.827 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:38.827 {"outputTranscription":{"text":" чем-то"}}
2026-04-22 08:39:38.885 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" помочь?"}}} ; } ;  ]
2026-04-22 08:39:38.946 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:38.946 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:38.946 {"outputTranscription":{"text":" помочь?"}}
2026-04-22 08:39:39.103 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Спасибо за"}}} ; } ;  ]
2026-04-22 08:39:39.144 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:39.180 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:39.180 {"outputTranscription":{"text":"Спасибо за"}}
2026-04-22 08:39:39.315 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" звонок."}}} ; } ;  ]
2026-04-22 08:39:39.356 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:39.365 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:39.365 {"outputTranscription":{"text":" звонок."}}
2026-04-22 08:39:39.474 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Всего"}}} ; } ;  ]
2026-04-22 08:39:39.475 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:39.516 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:39.516 {"outputTranscription":{"text":" Всего"}}
2026-04-22 08:39:39.558 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" доброго."}}} ; } ;  ]
2026-04-22 08:39:39.599 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:39.599 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:39.599 {"outputTranscription":{"text":" доброго."}}
2026-04-22 08:39:39.757 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ToolCall","payload":{"functionCalls":[{"id":"function-call-3612806999080839515","args":{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для точного расчета. Проинформировала, что менеджер свяжется в рабочее время.","next_step":"Александр отправит запрос по электронной почте. Менеджер Crystal Stone свяжется с клиентом.","outcome":"Клиент получил информацию и решил отправить запрос на расчет по электронной почте. Номер телефона подтвержден.","summary":"Клиент Александр из Санкт-Петербурга обратился за расчетом стоимости столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи на электронную почту компании для подготовки точного расчета. Номер телефона клиента подтвержден. Запрос будет передан менеджеру для дальнейшей работы."},"name":"save_call_summary"}]}} ; } ;  ]
2026-04-22 08:39:39.799 ===Gemini.LiveAPIEvents.ToolCall===
2026-04-22 08:39:39.799 {"name":"Gemini.LiveAPI.ToolCall","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"data":{"customEvent":"ToolCall","payload":{"functionCalls":[{"id":"function-call-3612806999080839515","args":{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для точного расчета. Проинформировала, что менеджер свяжется в рабочее время.","next_step":"Александр отправит запрос по электронной почте. Менеджер Crystal Stone свяжется с клиентом.","outcome":"Клиент получил информацию и решил отправить запрос на расчет по электронной почте. Номер телефона подтвержден.","summary":"Клиент Александр из Санкт-Петербурга обратился за расчетом стоимости столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи на электронную почту компании для подготовки точного расчета. Номер телефона клиента подтвержден. Запрос будет передан менеджеру для дальнейшей работы."},"name":"save_call_summary"}]}}}
2026-04-22 08:39:39.799 ===TOOL_CALL_NAME:save_call_summary===
2026-04-22 08:39:39.799 ===TOOL_CALL_ID:function-call-3612806999080839515===
2026-04-22 08:39:39.799 ===TOOL_CALL_ARGS:{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для точного расчета. Проинформировала, что менеджер свяжется в рабочее время.","next_step":"Александр отправит запрос по электронной почте. Менеджер Crystal Stone свяжется с клиентом.","outcome":"Клиент получил информацию и решил отправить запрос на расчет по электронной почте. Номер телефона подтвержден.","summary":"Клиент Александр из Санкт-Петербурга обратился за расчетом стоимости столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи на электронную почту компании для подготовки точного расчета. Номер телефона клиента подтвержден. Запрос будет передан менеджеру для дальнейшей работы."}===
2026-04-22 08:39:39.799 Executing JS command: SendMessageWebSocket with params [odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ;  {"customEvent":"ToolResponse","payload":{"functionResponses":[{"id":"function-call-3612806999080839515","name":"save_call_summary","response":{"result":"ok"}}]}} ;  ]
2026-04-22 08:39:39.799 ===TOOL_RESPONSE_SENT:save_call_summary===
2026-04-22 08:39:39.799 ===SUMMARY_FUNCTION_CAPTURED===
2026-04-22 08:39:39.799 {"client_name":"Александр","client_phone":"79117027598","call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для точного расчета. Проинформировала, что менеджер свяжется в рабочее время.","outcome":"Клиент получил информацию и решил отправить запрос на расчет по электронной почте. Номер телефона подтвержден.","next_step":"Александр отправит запрос по электронной почте. Менеджер Crystal Stone свяжется с клиентом.","summary":"Клиент Александр из Санкт-Петербурга обратился за расчетом стоимости столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи на электронную почту компании для подготовки точного расчета. Номер телефона клиента подтвержден. Запрос будет передан менеджеру для дальнейшей работы."}
2026-04-22 08:39:40.503 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Спасибо за"}}} ; } ;  ]
2026-04-22 08:39:40.544 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:40.585 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:40.585 {"outputTranscription":{"text":"Спасибо за"}}
2026-04-22 08:39:40.742 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" звонок."}}} ; } ;  ]
2026-04-22 08:39:40.783 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:40.823 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:40.823 {"outputTranscription":{"text":" звонок."}}
2026-04-22 08:39:40.902 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Всего"}}} ; } ;  ]
2026-04-22 08:39:40.904 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:40.915 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" доброго."}}} ; } ;  ]
2026-04-22 08:39:40.915 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:40.915 {"outputTranscription":{"text":" Всего"}}
2026-04-22 08:39:40.916 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:40.957 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:40.957 {"outputTranscription":{"text":" доброго."}}
2026-04-22 08:39:47.890 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"interrupted":true}} ; } ;  ]
2026-04-22 08:39:47.890 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":9590,"responseTokenCount":425,"totalTokenCount":10015,"promptTokensDetails":[{"modality":"TEXT","tokenCount":9498},{"modality":"AUDIO","tokenCount":92}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":425}]}} ; } ;  ]
2026-04-22 08:39:47.890 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:39:47.932 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:47.973 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:47.973 {"interrupted":true}
2026-04-22 08:39:47.973 ===AGENT_INTERRUPTED===
2026-04-22 08:39:47.973 Executing JS command: WebSocketClearMediaBuffer with params [odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ;  {} ;  ]
2026-04-22 08:39:47.973 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:47.973 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:47.973 {"turnComplete":true}
2026-04-22 08:39:49.176 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 62 ; } ; } ;  ]
2026-04-22 08:39:49.176 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:39:49.190 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":62}}
2026-04-22 08:39:49.671 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"inputTranscription":{"text":" ده"}}} ; } ;  ]
2026-04-22 08:39:49.731 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:49.731 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:49.731 {"inputTranscription":{"text":" ده"}}
2026-04-22 08:39:51.459 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":"Спасибо за"}}} ; } ;  ]
2026-04-22 08:39:51.518 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:51.519 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:51.519 {"outputTranscription":{"text":"Спасибо за"}}
2026-04-22 08:39:51.750 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" звонок."}}} ; } ;  ]
2026-04-22 08:39:51.751 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:51.786 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:51.786 {"outputTranscription":{"text":" звонок."}}
2026-04-22 08:39:51.916 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" Всего"}}} ; } ;  ]
2026-04-22 08:39:51.939 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"outputTranscription":{"text":" доброго."}}} ; } ;  ]
2026-04-22 08:39:51.981 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:51.981 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:51.981 {"outputTranscription":{"text":" Всего"}}
2026-04-22 08:39:51.982 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:51.982 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:51.982 {"outputTranscription":{"text":" доброго."}}
2026-04-22 08:39:52.116 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventStarted ; tag =  ; encoding = PCM16 ; customParameters = void ; } ;  ]
2026-04-22 08:39:52.136 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ToolCall","payload":{"functionCalls":[{"id":"function-call-11084988088316699629","args":{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для расчета. Также подтвердила, что менеджер свяжется в рабочее время.","next_step":"Клиент отправит запрос с размерами на электронную почту. Менеджер Crystal Stone свяжется с клиентом для консультации и расчета.","outcome":"Разговор завершен, клиент получил информацию о дальнейших шагах.","summary":"Клиент Александр из Санкт-Петербурга обратился для расчета столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи по электронной почте. Номер телефона подтвержден. Запрос будет передан менеджеру для дальнейшей обработки и связи с клиентом в рабочее время."},"name":"save_call_summary"}]}} ; } ;  ]
2026-04-22 08:39:52.165 ===Gemini.Events.WebSocketMediaStarted===
2026-04-22 08:39:52.165 {"name":"Gemini.Events.WebSocketMediaStarted","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"encoding":"PCM16"}
2026-04-22 08:39:52.165 ===Gemini.LiveAPIEvents.ToolCall===
2026-04-22 08:39:52.165 {"name":"Gemini.LiveAPI.ToolCall","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"data":{"customEvent":"ToolCall","payload":{"functionCalls":[{"id":"function-call-11084988088316699629","args":{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для расчета. Также подтвердила, что менеджер свяжется в рабочее время.","next_step":"Клиент отправит запрос с размерами на электронную почту. Менеджер Crystal Stone свяжется с клиентом для консультации и расчета.","outcome":"Разговор завершен, клиент получил информацию о дальнейших шагах.","summary":"Клиент Александр из Санкт-Петербурга обратился для расчета столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи по электронной почте. Номер телефона подтвержден. Запрос будет передан менеджеру для дальнейшей обработки и связи с клиентом в рабочее время."},"name":"save_call_summary"}]}}}
2026-04-22 08:39:52.165 ===TOOL_CALL_NAME:save_call_summary===
2026-04-22 08:39:52.165 ===TOOL_CALL_ID:function-call-11084988088316699629===
2026-04-22 08:39:52.165 ===TOOL_CALL_ARGS:{"call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","client_name":"Александр","client_phone":"79117027598","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для расчета. Также подтвердила, что менеджер свяжется в рабочее время.","next_step":"Клиент отправит запрос с размерами на электронную почту. Менеджер Crystal Stone свяжется с клиентом для консультации и расчета.","outcome":"Разговор завершен, клиент получил информацию о дальнейших шагах.","summary":"Клиент Александр из Санкт-Петербурга обратился для расчета столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи по электронной почте. Номер телефона подтвержден. Запрос будет передан менеджеру для дальнейшей обработки и связи с клиентом в рабочее время."}===
2026-04-22 08:39:52.165 Executing JS command: SendMessageWebSocket with params [odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ;  {"customEvent":"ToolResponse","payload":{"functionResponses":[{"id":"function-call-11084988088316699629","name":"save_call_summary","response":{"result":"ok"}}]}} ;  ]
2026-04-22 08:39:52.165 ===TOOL_RESPONSE_SENT:save_call_summary===
2026-04-22 08:39:52.165 ===SUMMARY_FUNCTION_CAPTURED===
2026-04-22 08:39:52.165 {"client_name":"Александр","client_phone":"79117027598","call_goal":"Расчет стоимости столешницы из кварцевого агломерата.","manager_offer":"Предложила отправить размеры и чертежи на почту info@crystalstone.ru для расчета. Также подтвердила, что менеджер свяжется в рабочее время.","outcome":"Разговор завершен, клиент получил информацию о дальнейших шагах.","next_step":"Клиент отправит запрос с размерами на электронную почту. Менеджер Crystal Stone свяжется с клиентом для консультации и расчета.","summary":"Клиент Александр из Санкт-Петербурга обратился для расчета столешницы из кварцевого агломерата. Ему было предложено отправить размеры и чертежи по электронной почте. Номер телефона подтвержден. Запрос будет передан менеджеру для дальнейшей обработки и связи с клиентом в рабочее время."}
2026-04-22 08:39:53.874 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"UsageMetadata","payload":{"promptTokenCount":9321,"responseTokenCount":56,"totalTokenCount":9377,"promptTokensDetails":[{"modality":"TEXT","tokenCount":9207},{"modality":"AUDIO","tokenCount":114}],"responseTokensDetails":[{"modality":"AUDIO","tokenCount":56}]}} ; } ;  ]
2026-04-22 08:39:53.874 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Message ; text = {"customEvent":"ServerContent","payload":{"turnComplete":true}} ; } ;  ]
2026-04-22 08:39:53.911 ===Gemini.LiveAPIEvents.ServerContent===
2026-04-22 08:39:53.911 ===SERVER_CONTENT_CUSTOM_EVENT:ServerContent===
2026-04-22 08:39:53.911 {"turnComplete":true}
2026-04-22 08:39:55.156 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.MediaEventEnded ; tag =  ; mediaInfo = {duration = 64 ; } ; } ;  ]
2026-04-22 08:39:55.156 ===Gemini.Events.WebSocketMediaEnded===
2026-04-22 08:39:55.156 {"name":"Gemini.Events.WebSocketMediaEnded","id":"-bUNsqXRQu6EXO8XuG-592QySGyjm0RroavJq_3mQ-I","client":{},"mediaInfo":{"duration":64}}
2026-04-22 08:39:57.073 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.Disconnected ; headers = {Reason = [MVTSLocal;cause=10;text="BYE received" ;  Q.850;cause=16;text="Normal call clearing" ;  ] ; } ; direction = All numbers ; duration = 105 ; cost = 0.545996 ; internalCode = 10 ; reason = BYE received ; } ;  ]
2026-04-22 08:39:57.075 ===CALL_DISCONNECTED===
2026-04-22 08:39:57.075 {"cost":0.545996,"direction":"All numbers","duration":105,"headers":{"Reason":["MVTSLocal;cause=10;text=\"BYE received\"","Q.850;cause=16;text=\"Normal call clearing\""]},"id":"5FA0EDE8C24FAAE7.1776847087.5093750","internalCode":10,"name":"Call.Disconnected","reason":"BYE received","eventSourceField":"call","call":{"rism":{},"_isAnsweredStatus":true,"_connectedTime":1776847092215}}
2026-04-22 08:39:57.075 ===FINALIZE_START:call_disconnected===
2026-04-22 08:39:57.075 ===SUMMARY_REQUEST_SKIP:already_received===
2026-04-22 08:39:57.075 ===FINALIZE_AFTER_SUMMARY:already_received===
2026-04-22 08:39:57.075 ===WS_TIMER_STOPPED:close_client sec=104.761 total=104.761===
2026-04-22 08:39:57.075 ===GEMINI_CLIENT_CLOSE_START===
2026-04-22 08:39:57.075 Executing JS command: DestroyWebSocket with params [odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ;  ]
2026-04-22 08:39:57.075 ===GEMINI_CLIENT_CLOSE_DONE===
2026-04-22 08:39:57.075 ===REPORT_RECIPIENTS===
2026-04-22 08:39:57.075 {"adminIds":["7476208806"],"summaryRecipients":["7476208806"]}
2026-04-22 08:39:57.075 ===TG_SEND_START:ADMIN_REPORT#1 chat=7476208806===
2026-04-22 08:39:57.075 Sent event to JS onPhoneEvent with params [{id = odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw ; name = WebSocket.Close ; code = 1000 ; wasClean = true ; reason = Normal connection close ; } ;  ]
2026-04-22 08:39:57.075 ===ON_WEB_SOCKET_CLOSE===
2026-04-22 08:39:57.082 {"NAME":"WebSocket.Close","code":1000,"id":"odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw","name":"WebSocket.Close","reason":"Normal connection close","wasClean":true,"websocket":{"url":"wss://local/gemini","onclose":null,"onerror":null,"onmessage":null,"onopen":null,"oncreated":null,"onmediastarted":null,"onmediaended":null,"readyState":"closed","_id":"odLUPkJORFyd8IegcJhtqcMIrErl7Uz8oSPZsh95uSw"},"eventSourceField":"websocket"}
2026-04-22 08:39:57.082 ===ON_WEB_SOCKET_CLOSE_IGNORED:already_finalizing===
2026-04-22 08:39:57.088 Sent event to JS onPhoneEvent with params [{id = 5FA0EDE8C24FAAE7.1776847087.5093750 ; name = Call.RecordStopped ; reason = Stopped by user ; url = https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345 ; duration = 104 ; cost = 0.727996 ; } ;  ]
2026-04-22 08:39:57.093 ===CALL_RECORD_STOPPED===
2026-04-22 08:39:57.093 {"cost":"0.727996","duration":104,"id":"5FA0EDE8C24FAAE7.1776847087.5093750","name":"Call.RecordStopped","reason":"Stopped by user","url":"https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345","eventSourceField":"call","call":{"rism":{},"_isAnsweredStatus":true,"_connectedTime":1776847092215}}
2026-04-22 08:39:57.278 ===TG_SEND_DONE:ADMIN_REPORT#1 chat=7476208806 code=200===
2026-04-22 08:39:57.278 {"ok":true,"result":{"message_id":1033,"from":{"id":8288947109,"is_bot":true,"first_name":"\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0439","username":"demoliveapi_bot"},"chat":{"id":7476208806,"first_name":"\ud835\udc0d\ud835\udc22\ud835\udc24\ud835\udc22\ud835\udc2d\ud835\udc1a","username":"kiperovka","type":"private"},"date":1776847197,"text":"\u0417\u0432\u043e\u043d\u043e\u043a \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\n\u041d\u043e\u043c\u0435\u0440: 79117027598\n\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c: 105 \u0441\u0435\u043a\n\u0422\u0435\u043b\u0435\u0444\u043e\u043d\u0438\u044f: 0.5460 \u0440\u0443\u0431\nWebSocket: 0.8730 \u0440\u0443\u0431 (105 \u0441\u0435\u043a)\nVoximplant \u0432\u0441\u0435\u0433\u043e: 1.4190 \u0440\u0443\u0431\nAI: 0.0000 \u0440\u0443\u0431 (0.000000 USD)\n\u0418\u0442\u043e\u0433\u043e\u0432\u0430\u044f \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c: 1.4190 \u0440\u0443\u0431\n\u0417\u0430\u043f\u0438\u0441\u044c: https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345\n\n\u0422\u043e\u043a\u0435\u043d\u044b:\nin(text=0, audio=0, video=0, unknown=0); out(text=0, audio=0, video=0, unknown=0)\n\n\u0414\u0438\u0430\u043b\u043e\u0433:\n\u0410\u0433\u0435\u043d\u0442: \u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u041c\u0435\u043d\u044f \u0437\u043e\u0432\u0443\u0442 \u0415\u043a\u0430\u0442\u0435\u0440\u0438\u043d\u0430, \u044f \u0418\u0418-\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 Crystal Stone. \u0421\u043a\u0430\u0436\u0438\u0442\u0435, \u043a\u0430\u043a \u044f \u043c\u043e\u0433\u0443 \u043a \u0432\u0430\u043c \u043e\u0431\u0440\u0430\u0449\u0430\u0442\u044c\u0441\u044f?\n\u041a\u043b\u0438\u0435\u043d\u0442: \u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, \u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440.\n\u0410\u0433\u0435\u043d\u0442: \u041e\u0447\u0435\u043d\u044c \u043f\u0440\u0438\u044f\u0442\u043d\u043e, \u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0438\u0437 \u043a\u0430\u043a\u043e\u0433\u043e \u0432\u044b \u0433\u043e\u0440\u043e\u0434\u0430?\n\u041a\u043b\u0438\u0435\u043d\u0442: \u0412 \u0421\u0430\u043d\u043a\u0442-\u041f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433.\n\u0410\u0433\u0435\u043d\u0442: \u041f\u043e\u043d\u044f\u043b\u0430 \u0432\u0430\u0441. \u0427\u0435\u043c \u044f \u043c\u043e\u0433\u0443 \u0432\u0430\u043c \u043f\u043e\u043c\u043e\u0447\u044c?\n\u041a\u043b\u0438\u0435\u043d\u0442: \u0425\u043e\u0442\u0435\u043b \u0431\u044b \u043f\u0440\u043e\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u0443 \u0432\u0430\u0441 \u0441\u0442\u043e\u043b\u0435\u0448\u043d\u0438\u0446\u044b \u0438\u0437 \u043a\u0432\u0430\u0440\u0446\u0435\u0432 \u0430\u0433\u043b\u043e\u043c\u0435\u0440\u0430\u0442\u0430.\n\u0410\u0433\u0435\u043d\u0442: \u0414\u0430, \u043a\u043e\u043d\u0435\u0447\u043d\u043e. \u0427\u0442\u043e\u0431\u044b \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0440\u0430\u0441\u0447\u0451\u0442, \u043d\u0430\u043c \u043d\u0443\u0436\u043d\u044b \u0440\u0430\u0437\u043c\u0435\u0440\u044b, \u0447\u0435\u0440\u0442\u0435\u0436 \u0438\u043b\u0438 \u0441\u0445\u0435\u043c\u0430 \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u0438\u0437\u0434\u0435\u043b\u0438\u0439. \u041a\u0430\u043a \u0432\u0430\u043c \u0443\u0434\u043e\u0431\u043d\u0435\u0435: \u043f\u0440\u043e\u0434\u0438\u043a\u0442\u043e\u0432\u0430\u0442\u044c \u0441\u0435\u0439\u0447\u0430\u0441 \u0438\u043b\u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u0430\u043c \u0432 \u043c\u0435\u0441\u0441\u0435\u043d\u0434\u0436\u0435\u0440 \u0438\u043b\u0438 \u043d\u0430 \u043f\u043e\u0447\u0442\u0443?\n\u041a\u043b\u0438\u0435\u043d\u0442: \u0410 \u0441\u043a\u0430\u0436\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0443 \u0432\u0430\u0441 \u0432\u0441\u0435 \u0432\u0438\u0434\u044b \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u0439 \u043f\u0440\u0438\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044e\u0442 \u0438\u043b\u0438 \u0432\u044b \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442\u0435 \u0441 \u043a\u0435\u043c-\u0442\u043e \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0451\u043d\u043d\u044b\u043c.\n\u0410\u0433\u0435\u043d\u0442: \u0422\u043e\u0447\u043d\u0443\u044e \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044e \u043f\u043e \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044f\u043c \u0438 \u043d\u0430\u043b\u0438\u0447\u0438\u044e \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u044b \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u044e\u0442 \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u0432\u0440\u0435\u043c\u044f. \u042f \u043c\u043e\u0433\u0443 \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0432\u0430\u0448 \u0437\u0430\u043f\u0440\u043e\u0441 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u044c \u0435\u0433\u043e \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0443, \u0447\u0442\u043e\u0431\u044b \u0432\u0430\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u043e \u043f\u0440\u043e\u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0438\u0440\u043e\u0432\u0430\u043b\u0438. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, \u043a\u0430\u043a \u0432\u0430\u043c \u0443\u0434\u043e\u0431\u043d\u0435\u0435, \u0447\u0442\u043e\u0431\u044b \u0441 \u0432\u0430\u043c\u0438 \u0441\u0432\u044f\u0437\u0430\u043b\u0438\u0441\u044c?\n\u041a\u043b\u0438\u0435\u043d\u0442: \u041d\u043e \u043c\u043d\u0435 \u0431\u044b\u043b\u043e \u0431\u044b \u0443\u0434\u043e\u0431\u043d\u043e \u043f\u043e \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439 \u043f\u043e\u0447\u0442\u0435.\n\u0410\u0433\u0435\u043d\u0442: \u0425\u043e\u0440\u043e\u0448\u043e, \u043f\u043e\u043d\u044f\u043b\u0430 \u0432\u0430\u0441. \u042f \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u0443\u044e \u0432\u0430\u0448 \u0437\u0430\u043f\u0440\u043e\u0441 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043c \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0443. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, \u043d\u043e\u043c\u0435\u0440, \u0441 \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u0432\u044b \u0441\u0435\u0439\u0447\u0430\u0441 \u0437\u0432\u043e\u043d\u0438\u0442\u0435, \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u043b\u044f \u0441\u0432\u044f\u0437\u0438?\n\u041a\u043b\u0438\u0435\u043d\u0442: <noise>\n\u0410\u0433\u0435\u043d\u0442: \u041e\u0442\u043b\u0438\u0447\u043d\u043e. \u0422\u043e\u0433\u0434\u0430 \u044f \u043e\u0436\u0438\u0434\u0430\u044e \u0432\u0430\u0448 \u0437\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439 \u043f\u043e\u0447\u0442\u0435: info@crystalstone.ru. \u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u0441\u0432\u044f\u0436\u0435\u0442\u0441\u044f \u0441 \u0432\u0430\u043c\u0438 \u0432 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u0432\u0440\u0435\u043c\u044f. \u042f \u043c\u043e\u0433\u0443 \u0435\u0449\u0435 \u0447\u0435\u043c-\u0442\u043e \u043f\u043e\u043c\u043e\u0447\u044c?\u0421\u043f\u0430\u0441\u0438\u0431\u043e \u0437\u0430 \u0437\u0432\u043e\u043d\u043e\u043a. \u0412\u0441\u0435\u0433\u043e \u0434\u043e\u0431\u0440\u043e\u0433\u043e.\u0421\u043f\u0430\u0441\u0438\u0431\u043e \u0437\u0430 \u0437\u0432\u043e\u043d\u043e\u043a. \u0412\u0441\u0435\u0433\u043e \u0434\u043e\u0431\u0440\u043e\u0433\u043e. [\u043f\u0440\u0435\u0440\u0432\u0430\u043d\u043e]\n\u041a\u043b\u0438\u0435\u043d\u0442: \u062f\u0647\n\u0410\u0433\u0435\u043d\u0442: \u0421\u043f\u0430\u0441\u0438\u0431\u043e \u0437\u0430 \u0437\u0432\u043e\u043d\u043e\u043a. \u0412\u0441\u0435\u0433\u043e \u0434\u043e\u0431\u0440\u043e\u0433\u043e.","entities":[{"offset":0,"length":15,"type":"bold"},{"offset":16,"length":6,"type":"bold"},{"offset":35,"length":13,"type":"bold"},{"offset":57,"length":10,"type":"bold"},{"offset":79,"length":10,"type":"bold"},{"offset":111,"length":17,"type":"bold"},{"offset":140,"length":3,"type":"bold"},{"offset":170,"length":19,"type":"bold"},{"offset":201,"length":7,"type":"bold"},{"offset":209,"length":291,"type":"url"},{"offset":502,"length":7,"type":"bold"},{"offset":593,"length":7,"type":"bold"},{"offset":1798,"length":20,"type":"email"}],"link_preview_options":{"is_disabled":true}}}
2026-04-22 08:39:57.278 ===TG_SEND_START:SUMMARY_REPORT#1 chat=7476208806===
2026-04-22 08:39:57.469 ===TG_SEND_DONE:SUMMARY_REPORT#1 chat=7476208806 code=200===
2026-04-22 08:39:57.469 {"ok":true,"result":{"message_id":1034,"from":{"id":8288947109,"is_bot":true,"first_name":"\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0439","username":"demoliveapi_bot"},"chat":{"id":7476208806,"first_name":"\ud835\udc0d\ud835\udc22\ud835\udc24\ud835\udc22\ud835\udc2d\ud835\udc1a","username":"kiperovka","type":"private"},"date":1776847197,"text":"\u041d\u043e\u0432\u044b\u0439 \u0437\u0432\u043e\u043d\u043e\u043a (\u0441\u0443\u043c\u043c\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044f)\n\u041d\u043e\u043c\u0435\u0440: 79117027598\n\u0418\u043c\u044f: \u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440\n\u0417\u0430\u043f\u0440\u043e\u0441: \u0420\u0430\u0441\u0447\u0435\u0442 \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438 \u0441\u0442\u043e\u043b\u0435\u0448\u043d\u0438\u0446\u044b \u0438\u0437 \u043a\u0432\u0430\u0440\u0446\u0435\u0432\u043e\u0433\u043e \u0430\u0433\u043b\u043e\u043c\u0435\u0440\u0430\u0442\u0430.\n\u0427\u0442\u043e \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u043b\u0438: \u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u043b\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0440\u044b \u0438 \u0447\u0435\u0440\u0442\u0435\u0436\u0438 \u043d\u0430 \u043f\u043e\u0447\u0442\u0443 info crystalstone.ru \u0434\u043b\u044f \u0440\u0430\u0441\u0447\u0435\u0442\u0430. \u0422\u0430\u043a\u0436\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043b\u0430, \u0447\u0442\u043e \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u0441\u0432\u044f\u0436\u0435\u0442\u0441\u044f \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u0432\u0440\u0435\u043c\u044f.\n\u0418\u0442\u043e\u0433: \u0420\u0430\u0437\u0433\u043e\u0432\u043e\u0440 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d, \u043a\u043b\u0438\u0435\u043d\u0442 \u043f\u043e\u043b\u0443\u0447\u0438\u043b \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044e \u043e \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0445 \u0448\u0430\u0433\u0430\u0445.\n\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433: \u041a\u043b\u0438\u0435\u043d\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442 \u0437\u0430\u043f\u0440\u043e\u0441 \u0441 \u0440\u0430\u0437\u043c\u0435\u0440\u0430\u043c\u0438 \u043d\u0430 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u0443\u044e \u043f\u043e\u0447\u0442\u0443. \u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 Crystal Stone \u0441\u0432\u044f\u0436\u0435\u0442\u0441\u044f \u0441 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c \u0434\u043b\u044f \u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u0446\u0438\u0438 \u0438 \u0440\u0430\u0441\u0447\u0435\u0442\u0430.\n\u0417\u0430\u043f\u0438\u0441\u044c: https://storage-gw-ru-02.voximplant.com/voximplant-records-secure/2026/04/22/ZDRkNDQ5MWZmOGJhMGNiYTI2NjQzY2VlNzU5Mzc4YTIvaHR0cHM6Ly93d3ctcnUtNTItMTgudm94aW1wbGFudC5jb206ODQ0My9zZWN1cmVyZWNvcmRzLy8yMDI2LzA0LzIyL0RFOUZGNzg1MkFGMzczQjguMTc3Njg0NzA5Mi41MDk0MzE2Lm1wMw--.mp3?record_id=19630795345\n\n\u041a\u0440\u0430\u0442\u043a\u043e: \u041a\u043b\u0438\u0435\u043d\u0442 \u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440 \u0438\u0437 \u0421\u0430\u043d\u043a\u0442-\u041f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433\u0430 \u043e\u0431\u0440\u0430\u0442\u0438\u043b\u0441\u044f \u0434\u043b\u044f \u0440\u0430\u0441\u0447\u0435\u0442\u0430 \u0441\u0442\u043e\u043b\u0435\u0448\u043d\u0438\u0446\u044b \u0438\u0437 \u043a\u0432\u0430\u0440\u0446\u0435\u0432\u043e\u0433\u043e \u0430\u0433\u043b\u043e\u043c\u0435\u0440\u0430\u0442\u0430. \u0415\u043c\u0443 \u0431\u044b\u043b\u043e \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u043e \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0440\u044b \u0438 \u0447\u0435\u0440\u0442\u0435\u0436\u0438 \u043f\u043e \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439 \u043f\u043e\u0447\u0442\u0435. \u041d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d. \u0417\u0430\u043f\u0440\u043e\u0441 \u0431\u0443\u0434\u0435\u0442 \u043f\u0435\u0440\u0435\u0434\u0430\u043d \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0443 \u0434\u043b\u044f \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0435\u0439 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0438 \u0438 \u0441\u0432\u044f\u0437\u0438 \u0441 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c \u0432 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u0432\u0440\u0435\u043c\u044f.","entities":[{"offset":0,"length":27,"type":"bold"},{"offset":28,"length":6,"type":"bold"},{"offset":47,"length":4,"type":"bold"},{"offset":62,"length":7,"type":"bold"},{"offset":124,"length":15,"type":"bold"},{"offset":193,"length":15,"type":"url"},{"offset":280,"length":5,"type":"bold"},{"offset":351,"length":14,"type":"bold"},{"offset":494,"length":7,"type":"bold"},{"offset":502,"length":291,"type":"url"},{"offset":795,"length":7,"type":"bold"}],"link_preview_options":{"is_disabled":true}}}
2026-04-22 08:39:57.469 ===VOX_TERMINATE===
2026-04-22 08:39:57.469 Terminating request..., stack=VoxEngine.terminate@/voxengine.js:73:51
sendAllReportsAndTerminate/</<@crystalstone:660:31
sendNext@crystalstone:559:17
sendTelegramMessage/<@crystalstone:542:17
callbackWrapper@/net.js:127:31
2026-04-22 08:39:57.469 Executing JS command: terminating with params []
2026-04-22 08:39:57.470 Sent event to JS onPhoneEvent with params [{id = WdUEYIXWSP2IY-iaHLQAsiqE8pSpJEK8i5LugRlxubw ; name = Player.Stopped ; } ;  ]
2026-04-22 08:39:57.470 Terminating (onClose)
2026-04-22 08:39:57.474 Executing JS command: close with params {CpuMillis = 146 ; }
2026-04-22 08:39:57.474 Normal termination
2026-04-22 08:39:57.474 Session terminated

"""


def extract_timestamp(line: str) -> str:
    parts = line.split(" ", 2)
    return parts[1] if len(parts) > 1 else ""


def parse_log_datetime(line: str) -> Optional[datetime]:
    m = re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)", line)
    if not m:
        return None

    raw_dt = m.group(1)
    dt_format = "%Y-%m-%d %H:%M:%S.%f" if "." in raw_dt else "%Y-%m-%d %H:%M:%S"

    try:
        return datetime.strptime(raw_dt, dt_format)
    except ValueError:
        return None


def normalize_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([(\[])\s+", r"\1", text)
    text = re.sub(r"\s+([)\]])", r"\1", text)
    return text.strip()


def extract_json_after_text_marker(line: str) -> Optional[Dict[str, Any]]:
    """
    Надежно извлекает JSON после маркера 'text = '.
    Корректно работает с вложенными объектами и кавычками внутри JSON.
    """
    marker = "text = "
    marker_pos = line.find(marker)
    if marker_pos == -1:
        return None

    s = line[marker_pos + len(marker):]
    start = s.find("{")
    if start == -1:
        return None

    s = s[start:]

    depth = 0
    in_string = False
    escape = False

    for i, ch in enumerate(s):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    raw_json = s[: i + 1]
                    try:
                        return json.loads(raw_json)
                    except json.JSONDecodeError:
                        return None
    return None


def get_modality_counts(details: List[Dict[str, Any]]) -> Dict[str, int]:
    result = {
        "TEXT": 0,
        "AUDIO": 0,
        "VIDEO": 0,
        "UNKNOWN": 0,
    }

    for item in details or []:
        modality = str(item.get("modality", "UNKNOWN")).upper()
        count = int(item.get("tokenCount", 0) or 0)
        if modality not in result:
            modality = "UNKNOWN"
        result[modality] += count

    return result


def finalize_phrase(
    dialogue: List[Dict[str, Any]],
    role: str,
    text_parts: List[str],
    start_ts: Optional[str],
    end_ts: Optional[str],
    status: str = "complete",
) -> None:
    text = normalize_text("".join(text_parts))
    if not text:
        text_parts.clear()
        return

    dialogue.append(
        {
            "role": role,                 # user / assistant
            "start_time": start_ts,
            "end_time": end_ts,
            "status": status,             # complete / interrupted / partial
            "text": text,
        }
    )
    text_parts.clear()


def calc_ai_cost(stats: Dict[str, Any]) -> None:
    stats["cost_in_text_usd"] = (stats["in_text"] / 1_000_000) * PRICE_IN_TEXT
    stats["cost_in_audio_usd"] = (stats["in_audio"] / 1_000_000) * PRICE_IN_AUDIO
    stats["cost_out_text_usd"] = (stats["out_text"] / 1_000_000) * PRICE_OUT_TEXT
    stats["cost_out_audio_usd"] = (stats["out_audio"] / 1_000_000) * PRICE_OUT_AUDIO

    stats["total_ai_usd"] = (
        stats["cost_in_text_usd"]
        + stats["cost_in_audio_usd"]
        + stats["cost_out_text_usd"]
        + stats["cost_out_audio_usd"]
    )
    stats["total_ai_rub"] = stats["total_ai_usd"] * USD_TO_RUB_RATE
    stats["total_voximplant_rub"] = stats["telephony_rub"] + stats["websocket_rub"]
    stats["grand_total_rub"] = stats["total_ai_rub"] + stats["total_voximplant_rub"]


def analyze_logs(logs: str) -> Dict[str, Any]:
    stats = {
        "in_text": 0,
        "in_audio": 0,
        "in_video": 0,
        "in_unknown": 0,
        "out_text": 0,
        "out_audio": 0,
        "out_video": 0,
        "out_unknown": 0,
        "telephony_rub": 0.0,
        "call_duration_sec": 0.0,
        "websocket_rub": 0.0,
        "websocket_duration_sec": 0.0,
        "usage_events": [],
    }

    dialogue: List[Dict[str, Any]] = []

    current_user_parts: List[str] = []
    current_assistant_parts: List[str] = []
    current_user_start: Optional[str] = None
    current_assistant_start: Optional[str] = None
    websocket_opened_at: Optional[datetime] = None
    last_seen_dt: Optional[datetime] = None

    lines = logs.strip().splitlines()

    for line in lines:
        ts = extract_timestamp(line)
        line_dt = parse_log_datetime(line)
        if line_dt:
            last_seen_dt = line_dt

        # -------- Телефония --------
        if "Call.Disconnected" in line:
            cost_match = re.search(r"cost = ([\d\.]+)", line)
            if cost_match:
                stats["telephony_rub"] = float(cost_match.group(1))
            duration_match = re.search(r"duration = (\d+)", line)
            if duration_match:
                stats["call_duration_sec"] = float(duration_match.group(1))

        # -------- WebSocket --------
        if "name = WebSocket.Open" in line and line_dt and websocket_opened_at is None:
            websocket_opened_at = line_dt

        if "name = WebSocket.Close" in line and line_dt and websocket_opened_at:
            ws_seconds = (line_dt - websocket_opened_at).total_seconds()
            if ws_seconds > 0:
                stats["websocket_duration_sec"] += ws_seconds
            websocket_opened_at = None

        # -------- Обрабатываем только WebSocket.Message с JSON --------
        if "WebSocket.Message" not in line or "text = " not in line:
            continue

        event = extract_json_after_text_marker(line)
        if not event:
            continue

        custom_event = event.get("customEvent")
        payload = event.get("payload", {}) or {}

        # ================= USAGE METADATA =================
        if custom_event == "UsageMetadata":
            prompt_total = int(payload.get("promptTokenCount", 0) or 0)
            response_total = int(payload.get("responseTokenCount", 0) or 0)

            prompt_details = get_modality_counts(payload.get("promptTokensDetails", []))
            response_details = get_modality_counts(payload.get("responseTokensDetails", []))

            known_prompt = sum(prompt_details.values())
            known_response = sum(response_details.values())

            stats["in_text"] += prompt_details["TEXT"]
            stats["in_audio"] += prompt_details["AUDIO"]
            stats["in_video"] += prompt_details["VIDEO"]
            stats["in_unknown"] += prompt_details["UNKNOWN"]

            stats["out_text"] += response_details["TEXT"]
            stats["out_audio"] += response_details["AUDIO"]
            stats["out_video"] += response_details["VIDEO"]
            stats["out_unknown"] += response_details["UNKNOWN"]

            # Если total > сумма деталей, остаток относим в UNKNOWN
            if prompt_total > known_prompt:
                stats["in_unknown"] += prompt_total - known_prompt
            if response_total > known_response:
                stats["out_unknown"] += response_total - known_response

            stats["usage_events"].append(
                {
                    "time": ts,
                    "prompt_total": prompt_total,
                    "response_total": response_total,
                    "total": int(payload.get("totalTokenCount", 0) or 0),
                    "prompt_details": prompt_details,
                    "response_details": response_details,
                    "thoughtsTokenCount": int(payload.get("thoughtsTokenCount", 0) or 0),
                    "toolUsePromptTokenCount": int(payload.get("toolUsePromptTokenCount", 0) or 0),
                }
            )
            continue

        # ================= SERVER CONTENT / TRANSCRIPT =================
        if custom_event == "ServerContent":
            # Пользователь говорит
            if "inputTranscription" in payload:
                text = payload["inputTranscription"].get("text", "")
                if text:
                    # Если ассистент не закрыл реплику, считаем это прерыванием
                    if current_assistant_parts:
                        finalize_phrase(
                            dialogue,
                            "assistant",
                            current_assistant_parts,
                            current_assistant_start,
                            ts,
                            status="interrupted",
                        )
                        current_assistant_start = None

                    if not current_user_parts:
                        current_user_start = ts
                    current_user_parts.append(text)

            # Ассистент отвечает
            if "outputTranscription" in payload:
                text = payload["outputTranscription"].get("text", "")
                if text:
                    # Начался ответ ассистента -> закрываем фразу пользователя
                    if current_user_parts:
                        finalize_phrase(
                            dialogue,
                            "user",
                            current_user_parts,
                            current_user_start,
                            ts,
                            status="complete",
                        )
                        current_user_start = None

                    if not current_assistant_parts:
                        current_assistant_start = ts
                    current_assistant_parts.append(text)

            # Явное прерывание хода ассистента
            if payload.get("interrupted") is True and current_assistant_parts:
                finalize_phrase(
                    dialogue,
                    "assistant",
                    current_assistant_parts,
                    current_assistant_start,
                    ts,
                    status="interrupted",
                )
                current_assistant_start = None

            # Явное завершение хода модели
            if payload.get("turnComplete") is True and current_assistant_parts:
                finalize_phrase(
                    dialogue,
                    "assistant",
                    current_assistant_parts,
                    current_assistant_start,
                    ts,
                    status="complete",
                )
                current_assistant_start = None

    # Если лог оборван
    if current_user_parts:
        finalize_phrase(
            dialogue,
            "user",
            current_user_parts,
            current_user_start,
            current_user_start,
            status="partial",
        )

    if current_assistant_parts:
        finalize_phrase(
            dialogue,
            "assistant",
            current_assistant_parts,
            current_assistant_start,
            current_assistant_start,
            status="partial",
        )

    # Если WebSocket открылся, но в логе нет явного Close, считаем до последней метки
    if websocket_opened_at and last_seen_dt:
        ws_seconds = (last_seen_dt - websocket_opened_at).total_seconds()
        if ws_seconds > 0:
            stats["websocket_duration_sec"] += ws_seconds

    # Если не нашли отдельную длительность WebSocket, используем длительность звонка
    if stats["websocket_duration_sec"] <= 0 and stats["call_duration_sec"] > 0:
        stats["websocket_duration_sec"] = stats["call_duration_sec"]

    # Фиксированная стоимость WebSocket: 0.50 руб/мин (можно поменять в константе)
    stats["websocket_rub"] = (
        stats["websocket_duration_sec"] / 60.0
    ) * WEBSOCKET_PRICE_PER_MINUTE_RUB

    calc_ai_cost(stats)

    result = {
        "stats": stats,
        "dialogue": dialogue,
        "dialogue_text": "\n".join(
            f"{'Клиент' if item['role'] == 'user' else 'Агент'}: {item['text']}"
            + (
                " (прервано)"
                if item["status"] == "interrupted"
                else " (незавершено)"
                if item["status"] == "partial"
                else ""
            )
            for item in dialogue
        ),
    }
    return result


def print_report(result: Dict[str, Any]) -> None:
    stats = result["stats"]
    dialogue = result["dialogue"]

    print("=" * 100)
    print("ОТЧЕТ ПО СТОИМОСТИ ЗВОНКА")
    print("=" * 100)
    print("Токены на входе:")
    print(
        f"  Текст: {stats['in_text']}, аудио: {stats['in_audio']}, "
        f"видео: {stats['in_video']}, неизвестно: {stats['in_unknown']}"
    )
    print("Токены на выходе:")
    print(
        f"  Текст: {stats['out_text']}, аудио: {stats['out_audio']}, "
        f"видео: {stats['out_video']}, неизвестно: {stats['out_unknown']}"
    )

    print("-" * 100)
    print(f"Стоимость AI: ${stats['total_ai_usd']:.6f} (~{stats['total_ai_rub']:.2f} руб)")
    print(f"  Входящий текст:   ${stats['cost_in_text_usd']:.6f}")
    print(f"  Входящее аудио:   ${stats['cost_in_audio_usd']:.6f}")
    print(f"  Исходящий текст:  ${stats['cost_out_text_usd']:.6f}")
    print(f"  Исходящее аудио:  ${stats['cost_out_audio_usd']:.6f}")

    print("-" * 100)
    print("Стоимость Voximplant:")
    print(f"  Разговор (телефония): {stats['telephony_rub']:.4f} руб")
    print(f"  WebSocket:            {stats['websocket_rub']:.4f} руб")
    print(
        f"    (тариф {WEBSOCKET_PRICE_PER_MINUTE_RUB:.2f} руб/мин, "
        f"длительность {stats['websocket_duration_sec']:.0f} сек)"
    )
    print(f"  Всего Voximplant:     {stats['total_voximplant_rub']:.4f} руб")

    print("-" * 100)
    print(f"Итоговая стоимость (AI + Voximplant): {stats['grand_total_rub']:.2f} руб")

    if stats["in_unknown"] or stats["out_unknown"]:
        print()
        print(
            "Примечание: есть UNKNOWN-токены. Это токены, для которых в логе "
            "нет точной разбивки по modality."
        )

    print()
    print("=" * 100)
    print("ДИАЛОГ")
    print("=" * 100)

    if not dialogue:
        print("Реплики не найдены.")
        return

    for item in dialogue:
        speaker = "Клиент" if item["role"] == "user" else "Агент"
        status_note = ""
        if item["status"] == "interrupted":
            status_note = " [прервано]"
        elif item["status"] == "partial":
            status_note = " [незавершено]"

        print(f"{speaker}: {item['text']}{status_note}")

if __name__ == "__main__":
    result = analyze_logs(LOG_DATA)
    print_report(result)

