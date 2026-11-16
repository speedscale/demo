import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from ci_plan import IMAGES, changed_files, select_jobs


def names(plan, job):
    return {item['name'] for item in plan[job]}


class PlanTest(unittest.TestCase):
    def test_csharp_change_does_not_build_java(self):
        plan = select_jobs(['csharp/Program.cs'])
        self.assertEqual(names(plan, 'unit'), {'csharp'})
        self.assertEqual(names(plan, 'build'), {'csharp'})
        self.assertEqual(names(plan, 'docker'), {'csharp', 'csharp-client'})
        self.assertEqual(plan['integration'], [])
        self.assertEqual(plan['load'], [])

    def test_auth_shared_change_runs_both_clients_and_server(self):
        plan = select_jobs(['java-auth/Makefile'])
        self.assertEqual(names(plan, 'unit'), {'java-auth-server', 'java-auth-client'})
        self.assertEqual(names(plan, 'docker'), {'java-auth', 'java-auth-client'})

    def test_nested_service_change_is_isolated(self):
        plan = select_jobs(['llm-simulation-demo/backend/app/main.py'])
        self.assertEqual(names(plan, 'unit'), {'llm-simulation-backend'})
        self.assertEqual(names(plan, 'docker'), {'llm-simulation-backend'})
        self.assertEqual(plan['build'], [])

    def test_ruby_keeps_integration_and_load_coverage(self):
        plan = select_jobs(['ruby-api/app.rb'])
        self.assertEqual(names(plan, 'integration'), {'ruby-api'})
        self.assertEqual(names(plan, 'load'), {'ruby-api'})
        self.assertEqual(names(plan, 'build'), {'ruby-api', 'ruby-client'})

    def test_image_only_change_does_not_need_host_builds(self):
        plan = select_jobs(['php/index.php'])
        self.assertEqual(names(plan, 'docker'), {'php'})
        self.assertEqual(plan['unit'], [])
        self.assertEqual(plan['build'], [])

    def test_docs_and_empty_changes_have_no_service_jobs(self):
        for files in ([], ['README.md'], ['docs/ci.md']):
            with self.subTest(files=files):
                self.assertTrue(all(not jobs for jobs in select_jobs(files).values()))

    def test_shared_changes_and_unknown_history_run_everything(self):
        for files in (None, ['VERSION'], ['Makefile'], ['scripts/ci_plan.py'], ['.github/workflows/ci.yaml']):
            with self.subTest(files=files):
                plan = select_jobs(files)
                self.assertEqual(len(plan['unit']), 8)
                self.assertEqual(len(plan['build']), 10)
                self.assertEqual(names(plan, 'docker'), {item[0] for item in IMAGES})

    def test_service_prefix_does_not_match_a_different_demo(self):
        self.assertTrue(all(not jobs for jobs in select_jobs(['java-other/main.java']).values()))


class GitDiffTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.previous = Path.cwd()
        os.chdir(self.root)
        self.addCleanup(os.chdir, self.previous)
        self.git('init', '-q')
        self.git('config', 'user.email', 'ci@example.com')
        self.git('config', 'user.name', 'CI Test')
        (self.root / 'java').mkdir()
        (self.root / 'java/old.txt').write_text('example\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'Initial fixture')
        self.base = self.git('rev-parse', 'HEAD').strip()

    def git(self, *args):
        return subprocess.check_output(['git', *args], text=True)

    def test_push_rename_selects_old_and_new_services(self):
        (self.root / 'node').mkdir()
        self.git('mv', 'java/old.txt', 'node/new.txt')
        self.git('commit', '-qm', 'Move fixture')
        files = changed_files({'before': self.base}, 'push')
        self.assertEqual(set(files), {'java/old.txt', 'node/new.txt'})
        self.assertEqual(names(select_jobs(files), 'docker'), {'java', 'node'})

    def test_pull_request_uses_event_base(self):
        (self.root / 'java/old.txt').unlink()
        self.git('add', '.')
        self.git('commit', '-qm', 'Delete fixture')
        event = {'pull_request': {'base': {'sha': self.base}}}
        self.assertEqual(changed_files(event, 'pull_request'), ['java/old.txt'])

    def test_missing_or_unavailable_base_falls_back_to_full_coverage(self):
        self.assertIsNone(changed_files({'before': '0' * 40}, 'push'))
        with patch('ci_plan.subprocess.check_output', side_effect=subprocess.CalledProcessError(128, 'git')):
            self.assertIsNone(changed_files({'before': 'f' * 40}, 'push'))

    def test_script_writes_compact_json_outputs(self):
        event = self.root / 'event.json'
        output = self.root / 'output.txt'
        event.write_text(json.dumps({'before': self.base}))
        script = Path(__file__).resolve().with_name('ci_plan.py')
        with patch.dict(os.environ, GITHUB_EVENT_PATH=str(event), GITHUB_EVENT_NAME='push', GITHUB_OUTPUT=str(output)):
            subprocess.run(['python3', str(script)], check=True, capture_output=True)
        plan = dict(line.split('=', 1) for line in output.read_text().splitlines())
        self.assertEqual(set(plan), {'unit', 'integration', 'load', 'build', 'docker'})
        self.assertTrue(all(json.loads(value) == [] for value in plan.values()))


if __name__ == '__main__':
    unittest.main()
