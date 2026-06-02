from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = [
    ROOT / "scenarios" / "outbound_gemini_server_edition.js",
    ROOT / "scenarios" / "outbound_gemini_web_edition.js",
    ROOT / "scenarios" / "inbound_gemini_callback_server_edition.js",
    ROOT / "scenarios" / "inbound_gemini_web_edition.js",
]


class ScenarioAiHangupToolTest(unittest.TestCase):
    def test_scenarios_let_ai_end_non_human_calls(self):
        for scenario_path in SCENARIOS:
            with self.subTest(scenario=scenario_path.name):
                text = scenario_path.read_text(encoding="utf-8")

                self.assertIn("const END_CALL_FUNCTION_NAME = 'end_current_call'", text)
                self.assertIn("name: END_CALL_FUNCTION_NAME", text)
                self.assertIn("умная защита", text)
                self.assertIn("автоответчик", text)
                self.assertIn("ai_requested_hangup", text)
                self.assertIn("sendToolResponse", text)


if __name__ == "__main__":
    unittest.main()
