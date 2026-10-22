import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("audit_result", Path(__file__).with_name("audit-result.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditResultTests(unittest.TestCase):
    def test_findings_and_execution_errors_stay_distinct(self):
        finding = audit.summarize("failure", "go", "GO-2026-6809 CVE-2026-111943 CRITICAL")
        self.assertTrue(finding["failed"])
        self.assertFalse(finding["error"])
        mixed = audit.summarize("failure", "go", "GO-2026-6809\nfailed to download scanner database")
        self.assertTrue(mixed["error"])
        self.assertTrue(audit.summarize("failure", "node", "NIGHTLY_EXECUTION_ERROR: npm ci")['error'])
        self.assertFalse(audit.summarize("success", "node", "low vulnerabilities reported below threshold")['failed'])

    def test_dotnet_findings_without_an_advisory_identifier(self):
        result = audit.summarize("failure", "dotnet", "  > Example.Package 1.0.0 1.0.0 High")
        self.assertFalse(result["error"])
        self.assertEqual(["HIGH"], result["severity"])

    def test_raw_logs_and_credentials_are_excluded(self):
        result = audit.summarize("failure", "python", "token=private-value CVE-2026-111943 CVE-2026-111943")
        self.assertNotIn("private-value", str(result))
        self.assertEqual(["CVE-2026-111943"], result["advisories"])


if __name__ == "__main__":
    unittest.main()
