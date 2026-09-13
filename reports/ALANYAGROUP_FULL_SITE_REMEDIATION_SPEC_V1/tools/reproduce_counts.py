#!/usr/bin/env python3
"""reproduce_counts.py — ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1

Re-derives every deterministic aggregate quoted in the public spec
(01 §1, §4.1–4.5, §5.1; 04 §2.2, §4, §7.2; 05 §4.4; README §2/§5) from the two
PRIVATE fixtures. Prints aggregates only — never a URL list, never a post ID.

Usage:
    python3 reproduce_counts.py <AG_BOOKING_COVERAGE_INVENTORY.csv> <AG_BOOKING_PRIORITY_MATRIX.csv>

Both files live in the private repository ALGRP/AGOS (repo root). They are NOT
in ALGRP/AG and must not be copied here (AG/CLAUDE.md §6).

Read-only. No network. Python 3.8+, standard library only.

Rows marked HEURISTIC are NOT reproduced by this script: the spec quotes them
from a per-session url+title regex whose exact pattern was not preserved in the
record (01 §5.1 "TR 31 / DE 18", "transfer-intent RU 20 / AR 9"), or from an
earlier package's own table (04 §7.2 "DE 21 / TR 14",
SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L128-129). They are listed
so a verifier knows which numbers this script does and does not cover.
"""
import csv
import re
import sys
from collections import Counter

MONEY = re.compile(r'transfer|shuttle|private|vip|airport|havaalan|havalimani|flughafen|chauffeur', re.I)
SCAND = re.compile(r'overf[oø]r|flyplass|pendelbuss|lufthavn|flygplats', re.I)
RU_ENC = re.compile(r'%d0|%d1', re.I)
AR_ENC = re.compile(r'%d8|%d9', re.I)
HUB_AYT = '/antalya-transfer/'
HUB_GZP = '/gazipasa-transfer/'


def segs(url):
    return [s for s in url.split('/') if s]


def depth(url):
    return len(segs(url))


def section(title):
    print('\n== %s ==' % title)


def row(label, value, ref):
    print('  %-58s %-28s %s' % (label, value, ref))


def main(inv_path, pri_path):
    inv = list(csv.DictReader(open(inv_path, newline='', encoding='utf-8')))
    pri = list(csv.DictReader(open(pri_path, newline='', encoding='utf-8')))
    pri_by_id = {r['page_post_id']: r for r in pri}

    # ---------------------------------------------------------------- 01 §1
    section('01 §1 Envanter')
    row('rows (= distinct page_post_id)', len(inv), 'inventory')
    row('distinct url', len({r['url'] for r in inv}), 'inventory url')
    dup_urls = [u for u, n in Counter(r['url'] for r in inv).items() if n > 1]
    row('urls appearing twice', len(dup_urls), '01 §4.2 (page+post pair)')
    row('page_type', dict(Counter(r['page_type'] for r in inv)), '')
    row('http_status', dict(Counter(r['http_status'] for r in inv)), '')
    alias = [r for r in inv if r['final_url'] != r['url']]
    row('alias rows (final_url != url)', len(alias), '01 §1 "13"')
    row('  alias page_type / engine / dfc',
        (dict(Counter(r['page_type'] for r in alias)),
         dict(Counter(r['booking_engine'] for r in alias)),
         dict(Counter(r['distinct_form_count'] for r in alias))), '')
    row('distinct final_url', len({r['final_url'] for r in inv}), '01 §1 "892"')
    row('booking_engine', dict(Counter(r['booking_engine'] for r in inv)), '01 §1; 04 §4')
    row('distinct_form_count', dict(Counter(r['distinct_form_count'] for r in inv)), '01 §1')
    row('literal_shortcode_text', dict(Counter(r['literal_shortcode_text'] for r in inv)), '01 §1')

    # -------------------------------------------------------------- 01 §4.1
    section('01 §4.1 AYT <-> GZP mirror')
    clusters = {}
    for hub in (HUB_AYT, HUB_GZP):
        rows = [r for r in inv if r['url'].startswith(hub)]
        clusters[hub] = rows
        row('%s total' % hub, len(rows), '01 §4.1 "97 / 98"')
        row('  depth 1/2/3/4', dict(sorted(Counter(depth(r['url']) for r in rows).items())), '')
        row('  engine (all)', dict(Counter(r['booking_engine'] for r in rows)), '04 §4 "92 / 98 agsc-v6"')
        row('  hub row(s) page_type/engine',
            [(r['page_type'], r['booking_engine']) for r in rows if depth(r['url']) == 1],
            '04 §2.2 (hub engine)')
        row('  engine (depth>=2)',
            dict(Counter(r['booking_engine'] for r in rows if depth(r['url']) >= 2)), '')
    tails = {}
    d4 = {}
    for hub, rows in clusters.items():
        tails[hub] = {r['url'][len(hub):] for r in rows if depth(r['url']) >= 2}
        d4[hub] = {segs(r['url'])[-1] for r in rows if depth(r['url']) == 4}
    row('common sub-path tails (depth>=2)',
        '%d / %d / %d' % (len(tails[HUB_AYT] & tails[HUB_GZP]), len(tails[HUB_AYT]), len(tails[HUB_GZP])),
        '01 §4.1 "96/96"')
    row('common depth-4 hotel slugs',
        '%d / %d / %d' % (len(d4[HUB_AYT] & d4[HUB_GZP]), len(d4[HUB_AYT]), len(d4[HUB_GZP])),
        '01 §4.1 "66/66"')
    row('depth-2 districts (AYT)',
        sorted({segs(r['url'])[1] for r in clusters[HUB_AYT] if depth(r['url']) == 2}), '01 §4.1')
    both = clusters[HUB_AYT] + clusters[HUB_GZP]
    row('engine depth>=2, both clusters',
        dict(Counter(r['booking_engine'] for r in both if depth(r['url']) >= 2)), '01 §4.1 "188 + 4"')
    row('formless depth>=2, both clusters',
        sum(1 for r in both if depth(r['url']) >= 2 and r['booking_engine'] == 'none'), '01 §4.1 "0"')

    # -------------------------------------------------------------- 01 §4.2
    section('01 §4.2 one permalink, two rows')
    gz = [r for r in inv if r['url'] == HUB_GZP]
    row('/gazipasa-transfer/ rows (page_type, engine, dfc)',
        [(r['page_type'], r['booking_engine'], r['distinct_form_count']) for r in gz], '01 §4.2')

    # -------------------------------------------------------------- 01 §4.3
    section('01 §4.3 flat hotel-transfer pages')
    flat = [r for r in inv if depth(r['url']) == 1 and re.search(r'(hotel|otel)-transfer/$', r['url'])]
    row('depth-1 url ending (hotel|otel)-transfer/', len(flat), '01 §4.3 "141"')
    row('  page_type / engine',
        (dict(Counter(r['page_type'] for r in flat)), dict(Counter(r['booking_engine'] for r in flat))), '')
    b2 = [r for r in pri if r['proposed_batch'].startswith('Batch 2')]
    row('Batch 2 rows', len(b2), '01 §4.3 "321"')
    row('  Batch 2 not ending (hotel|otel)-transfer/',
        sum(1 for r in b2 if not re.search(r'(hotel|otel)-transfer/$', r['url'])), '01 §4.3 "180"')
    row('  Batch 2 not ending -hotel-transfer/ (stricter)',
        sum(1 for r in b2 if not re.search(r'-hotel-transfer/$', r['url'])), '(190 — regex variant)')

    # -------------------------------------------------------------- 01 §4.4
    section('01 §4.4 engine x structure (money pages, record regex on url)')
    money = [r for r in inv if MONEY.search(r['url'])]
    row('money pages', len(money), '01 §4.4 "587"')
    row('  engine', dict(Counter(r['booking_engine'] for r in money)), '"384 / 191 / 10 / 2"')
    nf = [r for r in money if r['booking_engine'] == 'none']
    row('  formless: depth', dict(Counter(depth(r['url']) for r in nf)), '"hepsi derinlik-1"')
    row('  formless: page_type', dict(Counter(r['page_type'] for r in nf)), '"377 post + 7 page"')
    row('  formless share', '%d%%' % (100 * len(nf) // max(len(money), 1)), '"%65"')
    row('  formless & SEL-124 NO_BOOKING_NEEDED',
        sum(1 for r in nf if pri_by_id.get(r['page_post_id'], {}).get('priority_group') == 'NO_BOOKING_NEEDED'),
        '01 §4.4 "4"')
    row('agsc-v6 outside money regex',
        sum(1 for r in inv if r['booking_engine'] == 'agsc-v6' and not MONEY.search(r['url'])), '"1"')
    row('ag_home outside money regex',
        sum(1 for r in inv if r['booking_engine'] == 'ag_home' and not MONEY.search(r['url'])), '"3"')
    row('c6 rows', sum(1 for r in inv if r['booking_engine'] == 'c6'), '"2"')

    # ------------------------------------------------------------------ 04 §4
    section('04 §4 engine technical debt')
    ag = [r for r in inv if r['booking_engine'] == 'agsc-v6']
    row('agsc-v6 page/post', dict(Counter(r['page_type'] for r in ag)), '04 §4 "191 / 1"')
    row('agsc-v6 under the two hubs',
        sum(1 for r in ag if r['url'].startswith(HUB_AYT) or r['url'].startswith(HUB_GZP)), '"190"')
    row('agsc-v6 at depth 4', sum(1 for r in ag if depth(r['url']) == 4), '"132"')
    row('agsc-v6 elsewhere (count)',
        sum(1 for r in ag if not (r['url'].startswith(HUB_AYT) or r['url'].startswith(HUB_GZP))), '"2"')
    row('ag_home inside the two hubs',
        sum(1 for r in inv if r['booking_engine'] == 'ag_home'
            and (r['url'].startswith(HUB_AYT) or r['url'].startswith(HUB_GZP))), '"5"')

    # -------------------------------------------------------------- 01 §4.5
    section('01 §4.5 page-type bucket sizes (deterministic ones)')
    row('PT01 root /', sum(1 for r in inv if r['url'] == '/'), '"1"')
    row('PT02/03 /destinations/ depth', dict(Counter(depth(r['url']) for r in inv if r['url'].startswith('/destinations/'))), '"1 · 1"')
    row('PT04 hub rows', sum(1 for r in both if depth(r['url']) == 1), '"3 satır (2 URL)"')
    pt05 = [r for r in both if depth(r['url']) in (2, 3)]
    row('PT05 cluster route depth 2-3', (len(pt05), dict(Counter(r['booking_engine'] for r in pt05))), '"60 (56 + 4)"')
    pt06 = [r for r in both if depth(r['url']) == 4]
    row('PT06 cluster hotel depth 4', (len(pt06), dict(Counter(r['booking_engine'] for r in pt06))), '"132"')
    row('PT07 /tours/ depth', dict(Counter(depth(r['url']) for r in inv if r['url'].startswith('/tours/'))), '"2 · 12"')
    row('PT11 /faq/', sum(1 for r in inv if r['url'].startswith('/faq/')), '"1"')
    ru = [r for r in inv if RU_ENC.search(r['url'])]
    ar = [r for r in inv if AR_ENC.search(r['url'])]
    row('percent-encoded RU (%d0|%d1)', (len(ru), dict(Counter(r['page_type'] for r in ru)), dict(Counter(r['booking_engine'] for r in ru))), '"47 (46 post + 1 page)"')
    row('percent-encoded AR (%d8|%d9)', (len(ar), dict(Counter(r['page_type'] for r in ar)), dict(Counter(r['booking_engine'] for r in ar))), '"17"')
    row('RU ∩ AR', len({r['url'] for r in ru} & {r['url'] for r in ar}), '"0" (64 total)')

    # -------------------------------------------------------------- 01 §5.1
    section('01 §5.1 / 04 §7.2 language (measurable rows)')
    row('language_scope_note (699)', dict(Counter(r['language_scope_note'] for r in pri)), '"521 / 178"')
    scand = [r for r in pri if SCAND.search(r['url'])]
    row('Scandinavian slug (priority matrix)', (len(scand), dict(Counter(r['priority_group'] for r in scand)), dict(Counter(r['current_booking_engine'] for r in scand))), '"12; 11 MUST, 1 NO"')
    row('Scandinavian slug (inventory)', sum(1 for r in inv if SCAND.search(r['url'])), '"12"')
    bx = Counter((r['proposed_batch'][:7], r['language_scope_note'].startswith('NON_EN')) for r in pri)
    row('batch x NON_EN',
        {b: '%d / %d' % (bx[(b, True)], bx[(b, True)] + bx[(b, False)]) for b in ('Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5')},
        '"58/94 · 39/321 · 5/51 · 1/16 · 35/108"')
    print('  HEURISTIC (not reproduced here): TR 31 / DE 18 and transfer-intent RU 20 / AR 9 (01 §5.1,'
          ' per-session url+title regex, pattern not preserved); DE 21 / TR 14 (04 §7.2, from'
          ' SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L128-129, that package\'s own slug scan).')

    # -------------------------------------------------------------- 05 §4.4
    section('05 §4.4 coverage-fill backlog')
    row('priority_group', dict(Counter(r['priority_group'] for r in pri)), '"466 / 124 / 92 / 17"')
    must = [r for r in pri if r['priority_group'] == 'MUST_HAVE_BOOKING']
    row('MUST page_type', dict(Counter(r['page_type'] for r in must)), '"442 post + 24 page"')
    row('MUST & NON_EN', sum(1 for r in must if r['language_scope_note'].startswith('NON_EN')), '"102"')
    row('proposed_batch', dict(Counter(r['proposed_batch'] for r in pri)), '"94 / 321 / 51 / 16 / 108"')
    b1 = [r for r in pri if r['proposed_batch'].startswith('Batch 1')]
    row('Batch 1 priority_score', dict(Counter(r['priority_score'] for r in b1)), '"6 × 106, 88 × 100"')
    row('NON_EN total (699)', sum(1 for r in pri if r['language_scope_note'].startswith('NON_EN')), '"178"')

    # ------------------------------------------------------------------ join
    section('join sanity (packet §1-D)')
    inv_ids = {r['page_post_id'] for r in inv}
    row('priority rows joinable on page_post_id', sum(1 for r in pri if r['page_post_id'] in inv_ids), '"699 / 699"')
    inv_urls = {r['url'] for r in inv}
    row('priority rows NOT joinable on url', sum(1 for r in pri if r['url'] not in inv_urls), 'packet §1-D "64 drop on url join"')
    print('\nNo URL, slug, title or post ID was printed. Aggregates only.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.stderr.write(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
