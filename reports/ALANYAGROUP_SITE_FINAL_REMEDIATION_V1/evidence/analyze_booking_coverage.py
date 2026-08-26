#!/usr/bin/env python3
"""Reproducible analysis of the SEL-117/121/122/123 booking coverage inventory.

Source: ALGRP/AGOS -> ag-platform-v2-admin-cms/fixtures/AG_BOOKING_COVERAGE_INVENTORY.csv
Read-only. Produces the BOOKING_ENGINE_MATRIX for ALANYAGROUP_SITE_FINAL_REMEDIATION_V1.
Usage: python3 analyze_booking_coverage.py <inventory.csv> [priority_matrix.csv]
"""
import csv, sys, re, collections

MONEY = re.compile(r'transfer|shuttle|private|vip|airport|havaalan|havalimani|flughafen|chauffeur', re.I)

def main(inv_path, pri_path=None):
    rows = list(csv.DictReader(open(inv_path)))
    print(f"TOTAL URLS: {len(rows)}")

    def tally(key):
        return dict(collections.Counter(r[key] for r in rows).most_common())

    print("\n[1] ENGINE DISTRIBUTION       :", tally('booking_engine'))
    print("[2] DISTINCT FORM COUNT       :", tally('distinct_form_count'))
    print("[3] HTTP STATUS               :", tally('http_status'))
    print("[4] LITERAL SHORTCODE TEXT    :", tally('literal_shortcode_text'))
    print("[5] PAGE TYPE                 :", tally('page_type'))

    # Acceptance-criteria checks demanded by the task
    dupes   = [r for r in rows if r['distinct_form_count'] not in ('0', '1')]
    literal = [r for r in rows if r['literal_shortcode_text'] != 'none']
    non200  = [r for r in rows if r['http_status'] != '200']
    print(f"\nACCEPTANCE CHECKS (against this dataset)")
    print(f"  duplicate form (>1)   : {len(dupes)}   -> {'PASS' if not dupes else 'FAIL'}")
    print(f"  raw shortcode visible : {len(literal)}   -> {'PASS' if not literal else 'FAIL'}")
    print(f"  non-200 URLs          : {len(non200)}   -> {'PASS' if not non200 else 'FAIL'}")

    money = [r for r in rows if MONEY.search(r['url'])]
    noform = [r for r in money if r['distinct_form_count'] == '0']
    print(f"\nMONEY PAGES: {len(money)}")
    print("  engine:", dict(collections.Counter(r['booking_engine'] for r in money)))
    print(f"  ZERO booking form: {len(noform)}  ({len(noform)*100//max(len(money),1)}%)")

    print("\nLEGACY c6 (migration candidates):")
    for r in rows:
        if r['booking_engine'] == 'c6':
            print(f"  {r['url']}  id={r['page_post_id']}")

    print("\nCANONICAL ag_home (all):")
    for r in rows:
        if r['booking_engine'] == 'ag_home':
            print(f"  {r['url']}  id={r['page_post_id']}")

    if pri_path:
        pri = list(csv.DictReader(open(pri_path)))
        print(f"\nPRIORITY MATRIX ({len(pri)} zero-form URLs)")
        print("  priority_group:", dict(collections.Counter(r['priority_group'] for r in pri).most_common()))
        print("  proposed_batch:", dict(collections.Counter(r['proposed_batch'] for r in pri).most_common()))
        print("  language_scope:", dict(collections.Counter(r['language_scope_note'] for r in pri).most_common()))

if __name__ == '__main__':
    main(*sys.argv[1:])
