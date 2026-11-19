#!/bin/bash
# Runs the fast lane check on a set of upgrades, each the one-line change a
# dependency bot would open, and prints the four answers and verdict for each.
# The last three rows are controls: deliberate changes that show the lane failing.
set -uo pipefail

BASE_TAG="${BASE_TAG:-21.0.12}"
OUT="proxymock/results/matrix"
rm -rf "$OUT" && mkdir -p "$OUT"
SEC=server/src/main/java/com/example/auth/security/SecurityConfig.java

# build <name> <corretto tag> [file] [sed expression]: build the app with one change applied
build() {
  local name="$1" tag="$2" file="${3:-}" edit="${4:-}" dir="$OUT/$1"
  mkdir -p "$dir"
  cp -R server "$dir/server"
  [ -n "$file" ] && sed -i.orig "$edit" "$dir/${file}" && rm -f "$dir/${file}.orig"
  docker build -q --build-arg CORRETTO_TAG="$tag" -t "java-auth-fast-lane:$name" "$dir/server" >"$dir/build.log" 2>&1
}

# row <label> <image name> [jvm options]: check the image against the deployed one
row() {
  local label="$1" name="$2" jvm="${3:-}" dir="$OUT/$2${3:+-jvm}"
  mkdir -p "$dir"
  RUN="$dir/run" JAVA_TOOL_OPTIONS="$jvm" ./fast-lane-check.sh "java-auth-fast-lane:$name" java-auth-fast-lane:deployed >"$dir/check.txt" 2>&1
  [ -f "$dir/run/summary.json" ] || { echo "| $label | check did not run, see $dir/check.txt | | | | NOT READY |"; return; }
  jq -r --arg label "$label" '
    def mark: if . then "pass" else "FAIL" end;
    "| \($label) | \(.functionality.pass | mark): \(.functionality.detail | sub(" match the recording"; "")) | \(.performance.pass | mark): \(.performance.detail | sub(", budget.*"; ")")) | \(.security.pass | mark): \(.security.detail | sub("; auth probe: 0 endpoints answered without a credential"; "") | sub("auth probe: "; "")) | \(.gate.detail) | \(if .ship then "READY" else "NOT READY" end) |"' "$dir/run/summary.json"
}

# upgrade <label> <name> <corretto tag> [file] [sed expression]
upgrade() {
  if build "$2" "$3" "${4:-}" "${5:-}"; then row "$1" "$2"; else echo "| $1 | build failed | | | | NOT READY |"; fi
}

build deployed "$BASE_TAG"
echo "| Upgrade | Functionality | Performance (p95) | Security | Readiness gate | Verdict |"
echo "|---|---|---|---|---|---|"
upgrade "JDK 21.0.12 to 21.0.13 (CVE patch)"   jdk-21.0.13          21.0.13
upgrade "JDK 21 to 25.0.5"                     jdk-25.0.5           25.0.5
upgrade "Spring Boot 4.0.9 to 4.1.2"           spring-boot-4.1.2    "$BASE_TAG" server/pom.xml 's|<version>4.0.9</version>|<version>4.1.2</version>|'
upgrade "MySQL driver 8.2.0 to 9.7.0"          mysql-driver-9.7.0   "$BASE_TAG" server/pom.xml 's|<version>8.2.0</version>|<version>9.7.0</version>|'
upgrade "MySQL driver 8.2.0 to 26.10.0"        mysql-driver-26.10.0 "$BASE_TAG" server/pom.xml 's|<version>8.2.0</version>|<version>26.10.0</version>|'
upgrade "jjwt 0.12.3 to 0.13.0"                jjwt-0.13.0          "$BASE_TAG" server/pom.xml 's|<version>0.12.3</version>|<version>0.13.0</version>|'
upgrade "MyBatis starter 4.0.1 to 4.1.0"       mybatis-4.1.0        "$BASE_TAG" server/pom.xml 's|<version>4.0.1</version>|<version>4.1.0</version>|'
upgrade "springdoc 3.0.3 to 3.2.0"             springdoc-3.2.0      "$BASE_TAG" server/pom.xml 's|<version>3.0.3</version>|<version>3.2.0</version>|'
row     "CVE mitigation flag on the deployed JDK" deployed "-XX:-UseBASE64Intrinsics"
row     "Control: default time zone changed"   jdk-21.0.13 "-Duser.timezone=America/New_York"
row     "Control: JIT compiler turned off"     jdk-25.0.5  "-Xint"
upgrade "Control: security headers turned off" security-headers-off "$BASE_TAG" "$SEC" 's|\.csrf(csrf -> csrf\.disable())|.csrf(csrf -> csrf.disable()).headers(headers -> headers.disable())|'
