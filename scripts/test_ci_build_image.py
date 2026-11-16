import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from ci_build_image import TRANSIENT, build_command, run_build
from ci_plan import IMAGES


class ImageCommandTest(unittest.TestCase):
    def test_validation_builds_both_platforms_without_publishing(self):
        command = build_command('java')
        self.assertIn('linux/amd64,linux/arm64', command)
        self.assertIn('--output=type=cacheonly', command)
        self.assertNotIn('--push', command)

    def test_publication_preserves_context_and_tags(self):
        version = Path('VERSION').read_text().strip()
        for name, context, image, latest in IMAGES:
            with self.subTest(name=name):
                command = build_command(name, push=True)
                self.assertEqual(command[-1], context)
                self.assertTrue(Path(context, 'Dockerfile').is_file())
                self.assertIn('--push', command)
                self.assertIn(f'gcr.io/speedscale-demos/{image}:v{version}', command)
                self.assertEqual(f'gcr.io/speedscale-demos/{image}:latest' in command, latest)

    def test_images_have_separate_persistent_cache_scopes(self):
        for name in ('java', 'java-auth', 'java-auth-client'):
            command = build_command(name, cache=True)
            cache_from = command[command.index('--cache-from') + 1]
            cache_to = command[command.index('--cache-to') + 1]
            self.assertIn(f'scope=ci-{name},', cache_from)
            self.assertIn('version=2', cache_from)
            self.assertIn('mode=max,ignore-error=true', cache_to)


class RetryTest(unittest.TestCase):
    def run_fixture(self, failures, message):
        with tempfile.TemporaryDirectory() as directory:
            counter = Path(directory) / 'count'
            script = Path(directory) / 'build.py'
            script.write_text('''import pathlib, sys
counter = pathlib.Path(sys.argv[1])
attempt = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(attempt))
if attempt <= int(sys.argv[2]):
    print(sys.argv[3])
    sys.exit(7)
print('build succeeded')
''')
            with patch('ci_build_image.time.sleep') as sleep, contextlib.redirect_stdout(io.StringIO()) as output:
                status = run_build([sys.executable, str(script), str(counter), str(failures), message])
            return status, int(counter.read_text()), sleep.call_args_list, output.getvalue()

    def test_recorded_maven_429_recovers_after_backoff(self):
        message = '[FATAL] Could not transfer artifact from central: status code: 429, reason phrase: Too Many Requests (429)'
        status, attempts, sleeps, output = self.run_fixture(1, message)
        self.assertEqual((status, attempts), (0, 2))
        self.assertEqual([call.args[0] for call in sleeps], [15])
        self.assertIn(message, output)

    def test_persistent_network_error_stops_after_three_attempts(self):
        status, attempts, sleeps, _ = self.run_fixture(10, 'ERROR: unexpected status from GET: 503 Service Unavailable')
        self.assertEqual((status, attempts), (7, 3))
        self.assertEqual([call.args[0] for call in sleeps], [15, 30])

    def test_compilation_tests_auth_and_missing_packages_fail_immediately(self):
        for message in ('[ERROR] COMPILATION ERROR', 'Tests run: 1, Failures: 1',
                        '401 Unauthorized', '403 Forbidden', '404 Not Found',
                        'No matching distribution found', 'manifest unknown'):
            with self.subTest(message=message):
                status, attempts, sleeps, _ = self.run_fixture(10, message)
                self.assertEqual((status, attempts, sleeps), (7, 1, []))

    def test_success_runs_once(self):
        status, attempts, sleeps, _ = self.run_fixture(0, '')
        self.assertEqual((status, attempts, sleeps), (0, 1, []))

    def test_recovered_network_warning_does_not_hide_compilation_failure(self):
        status, attempts, sleeps, _ = self.run_fixture(10, 'warning: HTTP 429 recovered\n[ERROR] COMPILATION ERROR')
        self.assertEqual((status, attempts, sleeps), (7, 1, []))

    def test_supported_transient_signatures(self):
        for message in ('HTTP/1.1 502 Bad Gateway', 'status: 504', 'connection reset by peer',
                        'TLS handshake timeout', 'temporary failure in name resolution'):
            with self.subTest(message=message):
                self.assertIsNotNone(TRANSIENT.search(message))


if __name__ == '__main__':
    unittest.main()
