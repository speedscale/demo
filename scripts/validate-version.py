#!/usr/bin/env python3
"""Check release versions without treating dependency versions as app versions."""
import argparse
import ast
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

MANIFESTS = [
    'java-auth/k8s/base/auth-server/auth-deployment.yaml',
    'java-auth/k8s/base/auth-client/auth-client-deployment.yaml',
    'java/manifest.yaml', 'node/manifest.yaml', 'smart-replace-demo/manifest.yaml',
    'ruby-api/k8s/base/ruby-server/ruby-deployment.yaml',
    'ruby-api/k8s/base/ruby-client/client-deployment.yaml',
    'csharp/manifest.yaml', 'php/manifest.yaml',
    'scenarios/microservices/k8s/gateway.yaml',
    'scenarios/microservices/k8s/java-server.yaml',
    'scenarios/microservices/k8s/csharp-weather.yaml',
    'scenarios/microservices/k8s/node-server.yaml',
    'scenarios/microservices/k8s/php-server.yaml',
    'llm-simulation-demo/k8s/tools.yaml',
    'llm-simulation-demo/k8s/backend.yaml',
    'llm-simulation-demo/k8s/frontend.yaml',
]
POMS = ['java-auth/server/pom.xml', 'java-auth/client/pom.xml', 'java/server/pom.xml']
PACKAGES = ['node/package.json', 'node-auth/package.json',
            'smart-replace-demo/package.json', 'scenarios/microservices/gateway/package.json',
            'llm-simulation-demo/frontend/package.json']
PYTHON_APPS = ['llm-simulation-demo/backend/app/main.py',
               'llm-simulation-demo/tools-service/app/main.py']


def validate(root):
    errors = []
    try:
        version = (root / 'VERSION').read_text().strip()
        if not re.fullmatch(r'\d+\.\d+\.\d+', version):
            raise ValueError('expected MAJOR.MINOR.PATCH')
    except (OSError, ValueError) as error:
        print(f'ERROR VERSION: {error}')
        return 1

    def check(path, read_versions, allowed):
        try:
            versions = read_versions(root / path)
            if not versions or any(value not in allowed for value in versions):
                raise ValueError(f'found {versions!r}; expected {sorted(allowed)!r}')
        except (OSError, ValueError, SyntaxError, ET.ParseError) as error:
            errors.append(f'{path}: {error}')

    for path in MANIFESTS:
        check(path, lambda p: re.findall(r'^\s*image:\s*[\"\']?gcr\.io/speedscale-demos/[^:\s]+:([^\s\"\']+)', p.read_text(), re.M), {version, 'v' + version})
    for path in POMS:
        check(path, lambda p: [ET.parse(p).getroot().findtext('{*}version')], {version})
    for path in PACKAGES:
        check(path, lambda p: [json.loads(p.read_text()).get('version')], {version})
    for path in PYTHON_APPS:
        check(path, lambda p: [ast.literal_eval(keyword.value)
              for node in ast.walk(ast.parse(p.read_text()))
              if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'FastAPI'
              for keyword in node.keywords if keyword.arg == 'version'], {version})
    for error in errors:
        print('ERROR ' + error)
    if errors:
        print(f'{len(errors)} version check(s) failed')
        return 1
    print(f'All application versions match {version}')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    sys.exit(validate(parser.parse_args().root))
