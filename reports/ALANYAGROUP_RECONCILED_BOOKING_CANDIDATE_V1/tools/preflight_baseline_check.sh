#!/usr/bin/env bash
# preflight_baseline_check.sh
#
# ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1 — baseline completeness preflight.
#
# PURPOSE
#   Satisfies the task rule: "If the production pull is incomplete, stop and report exactly
#   which required runtime files are absent. Do not invent missing source."
#   Run on the Mac holding the working folder. Answers BASELINE_COMPLETE=YES|NO and prints
#   the absent-file manifest.
#
# SAFETY
#   READ-ONLY. Creates nothing inside ROOT, modifies nothing, deletes nothing, sends nothing.
#   Never touches single-booking-engine-candidate/, deploy-package/, production pulls,
#   backups, or proof/evidence folders. No network. Safe to re-run.
#   (Uses one temp file under $TMPDIR, removed on exit.)
#
# COMPATIBILITY
#   POSIX-ish bash; works on macOS default bash 3.2 (no mapfile, no associative arrays).
#
# USAGE
#   chmod +x preflight_baseline_check.sh
#   ./preflight_baseline_check.sh [ROOT]
#   Default ROOT: /Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04
#
# EXIT CODES
#   0 = baseline complete   (reconciliation may proceed)
#   1 = baseline incomplete (STOP — do not implement)
#   2 = root folder not found

ROOT="${1:-/Users/a1453/Documents/ALANYAGROUP-REVENUE-RECOVERY-2026-08-04}"
TMP="${TMPDIR:-/tmp}/agpf.$$"
MISS="$TMP.miss"; PULLS="$TMP.pulls"
trap 'rm -f "$MISS" "$PULLS"' EXIT
: > "$MISS"; : > "$PULLS"

BASE=""
FOUND=0

say()  { printf '%s\n' "$*"; }
hdr()  { printf '\n== %s ==\n' "$*"; }
mark_missing() { say "  MISSING  $1"; printf '%s\n' "$1" >> "$MISS"; }
# stat(1) differs: GNU uses -c, BSD/macOS uses -f. Detect once — note that on GNU
# `stat -f` means *filesystem* info and SUCCEEDS, so a plain || fallback picks the wrong one.
if stat -c '%Y' . >/dev/null 2>&1; then STAT_KIND=gnu; else STAT_KIND=bsd; fi
mtime()   { if [ "$STAT_KIND" = gnu ]; then stat -c '%Y' "$1" 2>/dev/null; else stat -f '%m'  "$1" 2>/dev/null; fi; }
mtime_h() { if [ "$STAT_KIND" = gnu ]; then stat -c '%y' "$1" 2>/dev/null; else stat -f '%Sm' "$1" 2>/dev/null; fi; }

say "ALANYAGROUP baseline preflight"
say "root : $ROOT"
say "date : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "mode : READ-ONLY (nothing inside root is created or modified)"

if [ ! -d "$ROOT" ]; then
  say ""; say "RESULT: ROOT NOT FOUND — cannot assess baseline."; exit 2
fi

# ---- 1. locate newest production pull ---------------------------------------
hdr "1. Production pull candidates (newest first)"
find "$ROOT" -maxdepth 3 -type d \
  \( -iname '*production*pull*' -o -iname '*prod*pull*' -o -iname '*live*pull*' -o -iname '*production*' \) \
  -not -path '*/single-booking-engine-candidate/*' \
  -not -path '*/deploy-package/*' 2>/dev/null \
| while IFS= read -r d; do
    [ -n "$d" ] && printf '%s\t%s\n' "$(mtime "$d")" "$d"
  done | sort -rn | cut -f2- > "$PULLS"

if [ ! -s "$PULLS" ]; then
  say "  (none found)"
else
  while IFS= read -r p; do say "  $p"; done < "$PULLS"
  BASE=$(head -1 "$PULLS")
  say ""
  say "  -> newest (BASELINE_SOURCE candidate): $BASE"
  say "  -> mtime: $(mtime_h "$BASE")"
fi

# ---- 2. required runtime files ----------------------------------------------
# Paths as named in AGOS-MASTER-STATUS.md / AGOS_MASTER_ROADMAP_2026_V2.md.
check_in_base() { # $1 = wp-content-relative path
  [ -n "$BASE" ] || return 1
  if [ -f "$BASE/$1" ]; then say "  FOUND    $1"; FOUND=$((FOUND+1)); return 0; fi
  # tolerate a pull rooted at wp-content/ or mu-plugins/
  for a in "${1#wp-content/}" "${1#wp-content/mu-plugins/}"; do
    if [ -f "$BASE/$a" ]; then say "  FOUND    $1  (at $a)"; FOUND=$((FOUND+1)); return 0; fi
  done
  return 1
}

hdr "2. Required booking runtime files"
for f in \
  "wp-content/mu-plugins/ag-booking-core.php" \
  "wp-content/mu-plugins/ag-booking-component-v1.php" \
  "wp-content/mu-plugins/ag-home-booking-shortcode.php" \
  "wp-content/mu-plugins/ag-homepage-live-pilot/plugin.php" ; do
  check_in_base "$f" || mark_missing "$f"
done

hdr "3. Related runtime (noted, not blocking)"
for f in "wp-content/mu-plugins/ag-voucher.php" "wp-content/mu-plugins/ag-control-panel.php"; do
  check_in_base "$f" || say "  absent   $f"
done

# ---- 4. canonical renderer ---------------------------------------------------
hdr "4. Canonical renderer ag_hlp_render_booking_engine()"
if [ -n "$BASE" ] && grep -rql 'ag_hlp_render_booking_engine' "$BASE" 2>/dev/null; then
  say "  FOUND in:"; grep -rl 'ag_hlp_render_booking_engine' "$BASE" 2>/dev/null | sed 's/^/    /'
else
  mark_missing "ag_hlp_render_booking_engine() canonical renderer"
fi

# ---- 5. CLE module -----------------------------------------------------------
hdr "5. CLE received/confirmed email module"
CLE=""
[ -n "$BASE" ] && CLE=$(grep -rl -iE 'cle[_-]?(email|send|received|confirmed)|customer_lifecycle' "$BASE" 2>/dev/null | head -20)
if [ -n "$CLE" ]; then
  say "  FOUND candidate module files:"; printf '%s\n' "$CLE" | sed 's/^/    /'
else
  mark_missing "CLE received/confirmed email module"
  say "  (Explicit STOP CONDITION: 'the CLE module cannot be located'.)"
fi

# ---- 6. protected paths ------------------------------------------------------
hdr "6. Protected paths (must exist; must NOT be modified)"
for p in "single-booking-engine-candidate" "single-booking-engine-candidate/deploy-package"; do
  if [ -d "$ROOT/$p" ]; then say "  present  $p"; else say "  absent   $p"; fi
done

# ---- verdict -----------------------------------------------------------------
NMISS=$(wc -l < "$MISS" | tr -d ' ')
hdr "VERDICT"
say "  required files found : $FOUND"
say "  items missing        : $NMISS"
say ""
if [ "$NMISS" -eq 0 ] && [ -n "$BASE" ]; then
  say "  BASELINE_COMPLETE=YES"
  say "  BASELINE_SOURCE=$BASE"
  say "  BASELINE_SOURCE_DATE=$(mtime_h "$BASE")"
  say "  -> Reconciliation may proceed."
  exit 0
fi
say "  BASELINE_COMPLETE=NO"
[ -n "$BASE" ] && say "  BASELINE_SOURCE(candidate)=$BASE" || say "  BASELINE_SOURCE=(no production pull found)"
say "  ABSENT REQUIRED ITEMS:"
sed 's/^/    - /' "$MISS"
say ""
say "  -> STOP. Do not implement. Do not invent missing source."
say "  -> Supply the missing files (or a complete production pull), then re-run."
exit 1
