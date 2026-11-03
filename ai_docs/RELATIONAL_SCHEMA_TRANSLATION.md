# Relational Database Schema & Column Translation Reference

This document details how raw spreadsheet columns (such as those from `test1.ods`) translate and normalize into the relational SQLite database schema for the **Aildata** framework.

---

## 1. Entity-Relationship (ER) Overview

The normalized database separates subjects, bookings, legal proceedings, charges, and correspondence into dedicated relational tables connected via Foreign Keys (`detainee_id`, `detention_id`).

```
[ detainees ] <---(1:N)---> [ detentions ] <---(1:N)---> [ charges ]
     |                           |
     +---(1:N)---> [ correspondence ]  +---(1:N)---> [ legal_proceedings ]
```

---

## 2. Column-to-Table Translation Mapping

| Source Spreadsheet Column | Target Relational Table | Target Database Column | Data Type | Description / Normalization Note |
| :--- | :--- | :--- | :--- | :--- |
| **`Jacket Number`** | `detainees` | `jacket_number` | `TEXT` | Primary unique identifier for the individual. |
| **`Name (From Jail Tracker)`** | `detainees` | `name` | `TEXT` | Subject's full name. |
| **`Age`** | `detainees` | `age` | `TEXT` | Subject's recorded age. |
| **`Race`** | `detainees` | `race` | `TEXT` | Subject's recorded race. |
| **`Sex`** | `detainees` | `sex` | `TEXT` | Subject's recorded sex. |
| **`Country`** | `detainees` | `country` | `TEXT` | Country of origin / COO. |
| **`ICE Case Number/A#`** | `detainees` | `ice_case_number` | `TEXT` | Alien Registration Number (A#). |
| **`Book Date in GCJ`** | `detentions` | `book_date_gcj` | `TEXT` | Greene County Jail booking date. |
| **`Departure date (or today)`** | `detentions` | `departure_date` | `TEXT` | Release or transfer date. |
| **`Cell`** | `detentions` | `cell` | `TEXT` | Assigned housing cell. |
| **`Days in GCJ`** | `detentions` | `days_in_gcj` | `TEXT` | Total duration spent in GCJ. |
| **`Days Prior Facility`** | `detentions` | `days_prior_facility` | `TEXT` | Duration in previous detention facility. |
| **`Came From`** | `detentions` | `came_from` | `TEXT` | Origin facility or agency. |
| **`Sent To (or note)`** | `detentions` | `sent_to_note` | `TEXT` | Transfer destination or release note. |
| **`Delivering Agency`** | `detentions` | `delivering_agency` | `TEXT` | Agency responsible for delivery/arrest. |
| **`Duplicate Jacket # (came back?)`** | `detentions` | `duplicate_jacket_returned` | `TEXT` | Tracks return visits / repeat bookings. |
| **`Charges`** | `charges` | `charge_description` | `TEXT` | Split by semicolon `;` into individual charge rows. |
| **`Judge ordered?`** | `legal_proceedings` | `judge_ordered` | `TEXT` | Judicial order status. |
| **`Decision date?`** | `legal_proceedings` | `decision_date` | `TEXT` | Date of legal/judicial decision. |
| **`Day wait`** | `legal_proceedings` | `day_wait` | `TEXT` | Waiting duration for hearings/orders. |
| **`Notes for habeas, ongoing etc`** | `legal_proceedings` | `notes` | `TEXT` | Ongoing legal notes and habeas filings. |
| **`Penpal`** | `correspondence` | `penpal` | `TEXT` | Associated penpal or contact information. |
| **`LocNote & Fmr. Penpal`** | `correspondence` | `loc_note` | `TEXT` | Location notes and former penpal records. |

---

## 3. Migration Script

The transformation and normalization script is located at:
`scripts/migrate_to_relational.py`

To run the migration against your SQLite database:
```bash
python3 scripts/migrate_to_relational.py
```
