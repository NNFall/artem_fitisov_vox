import shutil
import subprocess
import unittest
from pathlib import Path


class VoximplantScenarioSyntaxTest(unittest.TestCase):
    def test_voximplant_scenarios_are_valid_javascript(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node executable is required for JavaScript syntax checks")

        repo_root = Path(__file__).resolve().parents[1]
        scenario_paths = [
            repo_root / "scenarios" / "outbound_gemini_server_edition.js",
            repo_root / "scenarios" / "outbound_gemini_web_edition.js",
            repo_root / "scenarios" / "inbound_gemini_callback_server_edition.js",
            repo_root / "scenarios" / "inbound_gemini_web_edition.js",
        ]

        for scenario_path in scenario_paths:
            with self.subTest(scenario=scenario_path.name):
                result = subprocess.run(
                    [node, "--check", str(scenario_path)],
                    cwd=repo_root,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(
                    result.returncode,
                    0,
                    result.stdout + result.stderr,
                )
