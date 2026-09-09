#!/bin/sh
# Test-only command double. Never forwards a command to Docker or restic.
name=${0##*/}
printf '%s %s\n' "$name" "$*" >> "$MOCK_LOG"
case "$name" in
  flock) [ "${MOCK_FAIL:-}" != lock ]; exit $?;;
  timeout) shift; exec "$@";;
  restic)
    echo 'SECRET-MUST-NOT-LEAK' >&2
    [ "${MOCK_FAIL:-}" != offsite ]; exit $?;;
  docker)
    case "$*" in
      'compose '*pg_dump*)
        [ "${MOCK_FAIL:-}" != dump ] || exit 1
        printf 'PGDMP-mocked-archive';;
      'compose '*pg_restore*)
        cat >/dev/null
        [ "${MOCK_FAIL:-}" != archive ] || exit 1;;
      create*) printf 'isolated-test-container\n';;
      start*) [ "${MOCK_FAIL:-}" != start ] || exit 1;;
      'exec -i '*pg_restore*)
        cat >/dev/null
        [ "${MOCK_FAIL:-}" != restore ] || exit 1;;
      exec*psql*) [ "${MOCK_FAIL:-}" != schema ] || exit 1;;
      exec*pg_isready*) exit 0;;
      'rm -f -v isolated-test-container') [ "${MOCK_FAIL:-}" != cleanup ] || exit 1;;
      *) echo 'Unexpected mock invocation' >&2; exit 90;;
    esac;;
  *) exit 91;;
esac
