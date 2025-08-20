#!/bin/bash

# Release script for java-auth
set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/release.sh <version>"
    echo "Example: ./scripts/release.sh 1.0.1"
    exit 1
fi

VERSION=$1
CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "1.0.0")

echo "Current version: $CURRENT_VERSION"
echo "New version: $VERSION"
echo

# Update VERSION file
echo "$VERSION" > VERSION

# Update pom.xml - only update the project version, not dependencies
sed -i.bak "0,/<version>.*<\/version>/s//<version>$VERSION<\/version>/" server/pom.xml
rm server/pom.xml.bak

# Update client VERSION if needed
echo "$VERSION" > client/VERSION

# Update documentation
sed -i.bak "s/java-auth:.*\`/java-auth:$VERSION\`/g" IMPLEMENTATION_TASKS.md
sed -i.bak "s/java-auth-client:.*\`/java-auth-client:$VERSION\`/g" IMPLEMENTATION_TASKS.md
rm IMPLEMENTATION_TASKS.md.bak

echo "✅ Updated version to $VERSION in:"
echo "   - VERSION file"
echo "   - server/pom.xml"
echo "   - client/VERSION"
echo "   - IMPLEMENTATION_TASKS.md"
echo
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Commit: git add -A && git commit -m 'Release version $VERSION'"
echo "3. Tag: git tag -a v$VERSION -m 'Release version $VERSION'"
echo "4. Push: git push && git push origin v$VERSION"
echo "5. Build and push images: make docker-multi"