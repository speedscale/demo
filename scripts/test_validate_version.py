import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).with_name('validate-version.py')
REPO = SCRIPT.resolve().parents[1]
spec = importlib.util.spec_from_file_location('versions', SCRIPT)
versions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(versions)


class VersionValidationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for path in ['VERSION', *versions.MANIFESTS, *versions.POMS, *versions.PACKAGES, *versions.PYTHON_APPS]:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO / path, target)

    def run_check(self):
        return subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root)], capture_output=True, text=True)

    def test_current_repository_passes(self):
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_reports_all_mismatches_and_rejects_version_prefix(self):
        version = (self.root / 'VERSION').read_text().strip()
        manifest = self.root / 'node/manifest.yaml'
        manifest.write_text(manifest.read_text().replace('v' + version, 'v' + version + '0'))
        package = self.root / 'node/package.json'
        data = json.loads(package.read_text())
        data['version'] = '9.9.9'
        package.write_text(json.dumps(data))
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('node/manifest.yaml', result.stdout)
        self.assertIn('node/package.json', result.stdout)
        self.assertIn('2 version check(s) failed', result.stdout)

    def test_missing_manifest_fails(self):
        (self.root / 'node/manifest.yaml').unlink()
        self.assertNotEqual(self.run_check().returncode, 0)

    def test_missing_image_fails(self):
        (self.root / 'node/manifest.yaml').write_text('kind: Deployment\n')
        self.assertNotEqual(self.run_check().returncode, 0)

    def test_dependency_version_is_not_an_application_version(self):
        path = self.root / 'node/package.json'
        data = json.loads(path.read_text())
        data['dependencies']['version'] = '9.9.9'
        path.write_text(json.dumps(data))
        self.assertEqual(self.run_check().returncode, 0)

    def test_invalid_package_and_python_app_version_fail(self):
        (self.root / 'node/package.json').write_text('{broken')
        path = self.root / versions.PYTHON_APPS[0]
        version = (self.root / 'VERSION').read_text().strip()
        path.write_text(path.read_text().replace('version="' + version + '"', 'version="9.9.9"'))
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('2 version check(s) failed', result.stdout)


if __name__ == '__main__':
    unittest.main()
