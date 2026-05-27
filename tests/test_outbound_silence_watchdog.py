from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
OUTBOUND_SCENARIOS = [
    ROOT / "scenarios" / "outbound_gemini_server_edition.js",
    ROOT / "scenarios" / "outbound_gemini_web_edition.js",
]


class OutboundSilenceWatchdogTest(unittest.TestCase):
    def test_outbound_scenarios_have_silence_watchdog(self):
        for scenario_path in OUTBOUND_SCENARIOS:
            with self.subTest(scenario=scenario_path.name):
                text = scenario_path.read_text(encoding="utf-8")

                self.assertIn("INPUT_SILENCE_PROMPT_MS = 20 * 1000", text)
                self.assertIn("INPUT_SILENCE_HANGUP_MS = 40 * 1000", text)
                self.assertIn("startInputSilenceWatchdog", text)
                self.assertIn("markInboundTranscriptActivity", text)
                self.assertIn("finishAndContinue('input_silence_timeout', true)", text)
                self.assertIn("hasReconnectDialogueHistory", text)
                self.assertIn("RECONNECT_WITHOUT_DIALOGUE_RESTART_OPENING", text)
                self.assertIn("if (!hasReconnectDialogueHistory())", text)
                self.assertNotIn("Истории реплик нет. Просто извинись за обрыв", text)
                self.assertNotIn("Если последний незавершенный вопрос был про оценку", text)
                self.assertIn("Абонент молчит, завершаю звонок", text)


if __name__ == "__main__":
    unittest.main()
