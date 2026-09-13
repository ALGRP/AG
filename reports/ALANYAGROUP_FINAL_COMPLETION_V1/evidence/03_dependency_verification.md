# Evidence 03 — Dependency verification (Hermes Phase 0 inventory + task-named identifiers)

Captured: 2026-08-25T06:43:34Z
Search root: ALGRP/alanyagroup-platform @ 5c1781b (all 19 tracked files)

## Q1. Does the stated DEPENDENCY ("Hermes Phase 0 inventory completed") exist?
```
$ grep -rniE "hermes" . --exclude-dir=.git
(no matches — 0 hits)

$ grep -rniE "phase[ _-]?0" . --exclude-dir=.git
(no matches — 0 hits)
```
**Result: NOT FOUND.** No Hermes artifact of any kind exists in the shared project memory.

## Q2. Does the task-designated canonical shortcode `[ag_booking_engine]` exist?
```
$ grep -rn "ag_booking_engine" . --exclude-dir=.git
(no matches — 0 hits)
```
**Result: NOT FOUND.** Note `agp_booking_engine` (with the `p`) does exist in the record as the LOCAL/DEV engine; `ag_booking_engine` does not appear anywhere.

## Q3. Shortcodes that ARE recorded
```
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:39:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:40:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:43:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:44:[ag_booking_form
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:47:[ag_transfer_booking_form
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:47:[agp_booking_engine
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:48:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:48:[ag_transfer_booking_form
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:50:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:76:[ag_home_booking
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:76:[agp_booking_engine
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:87:[ag_investor_vault
```

## Q4. TÜRSAB licence number of record
```
$ grep -rniE "tursab|2165|12892" . --exclude-dir=.git
./AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md:18:- **Business:** Alanya Group — Antalya (AYT) + Gazipaşa (GZP) airport transfers and tours. TÜRSAB licence 12892. WordPress + Kadence theme + Rank Math SEO.
```
**Result:** record says **12892**. Task specifies **2165**. Direct conflict.

## Q5. Task-specified phone/WhatsApp number (+90 551 160 69 05)
```
$ grep -rnE "551|160 69|1606905" . --exclude-dir=.git
(no matches — 0 hits)
```
**Result: NOT RECORDED.** No phone number of any kind is stored in the shared memory; the number cannot be corroborated here.
