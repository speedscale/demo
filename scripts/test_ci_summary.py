import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest


class SummaryTest(unittest.TestCase):
    def run_summary(self, selections, statuses=None, validate='success'):
        statuses = statuses or {}
        keys = {'unit-tests': 'unit', 'integration-tests': 'integration', 'load-tests': 'load', 'build': 'build', 'docker': 'docker'}
        results = {'validate': {'result': validate, 'outputs': {
            key: json.dumps([{'name': 'fixture'}] if key in selections else []) for key in keys.values()
        }}}
        for job, key in keys.items():
            results[job] = {'result': statuses.get(job, 'success' if key in selections else 'skipped')}
        workflow = Path(__file__).resolve().parents[1] / '.github/workflows/ci.yaml'
        code = workflow.read_text().split("python3 - <<'PYTHON'\n", 1)[1].rsplit('        PYTHON', 1)[0]
        return subprocess.run([sys.executable, '-c', textwrap.dedent(code)],
                              env={**os.environ, 'RESULTS': json.dumps(results)}, capture_output=True, text=True)

    def test_docs_only_pass_with_all_service_jobs_skipped(self):
        self.assertEqual(self.run_summary(set()).returncode, 0)

    def test_image_only_passes_when_host_jobs_are_skipped(self):
        self.assertEqual(self.run_summary({'docker'}).returncode, 0)

    def test_selected_job_cannot_silently_skip_or_fail(self):
        for status in ('skipped', 'cancelled', 'failure'):
            with self.subTest(status=status):
                self.assertNotEqual(self.run_summary({'docker'}, {'docker': status}).returncode, 0)

    def test_validation_failure_fails_the_summary(self):
        self.assertNotEqual(self.run_summary(set(), validate='failure').returncode, 0)


if __name__ == '__main__':
    unittest.main()
