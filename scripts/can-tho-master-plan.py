"""Read-only Cần Thơ master workbook reconciliation.

The plan is private evidence, not permission to write production. This module
uses only the Python standard library so CI needs no Excel dependency.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
from uuid import UUID
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


SOURCE_SHA256 = "0c21addfc5e5971a45c635ea2bfacb9b0d4188536f033e26a9e658382c5e5dcc"
HISTORICAL_SHA256 = "8ad3a441cb601c7973ad3792e7eaddb29312e403c62b874a5bb8d514be186761"
PROJECT_REF = "qhznfywwrhmcwbkujclm"
BATCH_ID = "b52d8476-7446-5130-abf8-04f0a67c992c"
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": DOC_REL}
MAX_XLSX_BYTES = 12_000_000
MAX_XML_BYTES = 16_000_000
HEADERS = (
    "student_code", "full_name", "date_of_birth", "gender", "phone", "Column1",
    "parent_name", "parent_phone", "email", "branch_code", "student_status",
    "instrument_or_program", "curriculum_code", "current_grade", "academic_start_date",
    "start date", "end date", "migration_baseline", "current_teacher", "current_class_code",
    "tuition_plan", "tuition_status", "tuition_start_date", "base_end_date",
    "effective_end_date", "currency", "list_price", "discount_type", "discount_value",
    "discount_name", "final_amount", "opening_paid_amount", "opening_outstanding",
    "payment_status", "last_payment_date", "pause_status", "pause_start_date",
    "pause_end_date", "pause_days", "legacy_reference", "migration_note", "needs_review",
)
CANONICAL_PROGRAMS = frozenset(("PIANO", "GUITAR", "VIOLIN", "DRUMS"))


class PlanError(ValueError):
    """A source, snapshot or output contract is unsafe to use."""


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_digest(path: Path, expected: str, kind: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise PlanError(f"{kind}: expected SHA-256 is invalid")
    actual = digest(path)
    if actual != expected:
        raise PlanError(f"{kind}: SHA-256 mismatch")
    return actual


def clean(value: object) -> str:
    if value is None:
        return ""
    return " ".join(unicodedata.normalize("NFC", str(value)).split())


def valid_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return str(UUID(value)) == value.lower()
    except (ValueError, AttributeError):
        return False


def column_number(address: str) -> int:
    letters = re.match(r"^([A-Z]+)[1-9][0-9]*$", address)
    if not letters:
        raise PlanError("Workbook has an invalid cell address")
    number = 0
    for letter in letters.group(1):
        number = number * 26 + ord(letter) - ord("A") + 1
    return number - 1


def _xml(archive: ZipFile, name: str) -> ET.Element:
    try:
        entry = archive.getinfo(name)
    except KeyError as error:
        raise PlanError("Workbook is missing required XML") from error
    if entry.file_size > MAX_XML_BYTES:
        raise PlanError("Workbook XML is unexpectedly large")
    try:
        return ET.fromstring(archive.read(name))
    except ET.ParseError as error:
        raise PlanError("Workbook XML is malformed") from error


def _worksheet_path(archive: ZipFile, sheet_name: str) -> tuple[str, bool]:
    workbook = _xml(archive, "xl/workbook.xml")
    date_1904 = workbook.find("m:workbookPr", NS)
    if date_1904 is not None and date_1904.get("date1904", "false").lower() in ("1", "true"):
        raise PlanError("Workbook uses the unsupported 1904 date system")
    sheets = workbook.findall("m:sheets/m:sheet", NS)
    found = [sheet for sheet in sheets if sheet.get("name") == sheet_name]
    if len(found) != 1:
        raise PlanError("Required worksheet is missing or duplicated")
    relationship_id = found[0].get(f"{{{DOC_REL}}}id")
    relations = _xml(archive, "xl/_rels/workbook.xml.rels")
    matching = [relation for relation in relations.findall(f"{{{PKG_REL}}}Relationship")
                if relation.get("Id") == relationship_id]
    if len(matching) != 1 or matching[0].get("TargetMode") == "External":
        raise PlanError("Worksheet relationship is invalid")
    target = matching[0].get("Target", "")
    path = PurePosixPath(target.lstrip("/")) if target.startswith("/") else PurePosixPath("xl") / target
    path = PurePosixPath(os.path.normpath(str(path)))
    if not str(path).startswith("xl/worksheets/") or ".." in path.parts:
        raise PlanError("Worksheet relationship points outside worksheets")
    return str(path), False


def _read_cells(path: Path, sheet_name: str) -> dict[int, dict[int, tuple[str, str, bool]]]:
    if path.stat().st_size > MAX_XLSX_BYTES:
        raise PlanError("Workbook is unexpectedly large")
    with ZipFile(path) as archive:
        worksheet_path, _ = _worksheet_path(archive, sheet_name)
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = _xml(archive, "xl/sharedStrings.xml")
            shared = ["".join(node.text or "" for node in item.findall(".//m:t", NS))
                      for item in strings.findall("m:si", NS)]
        worksheet = _xml(archive, worksheet_path)
        result: dict[int, dict[int, tuple[str, str, bool]]] = {}
        for row in worksheet.findall("m:sheetData/m:row", NS):
            try:
                row_number = int(row.get("r", "0"))
            except ValueError as error:
                raise PlanError("Workbook row numbering is invalid") from error
            if row_number < 1 or row_number in result:
                raise PlanError("Workbook row numbering is invalid")
            cells: dict[int, tuple[str, str, bool]] = {}
            for cell in row.findall("m:c", NS):
                index = column_number(cell.get("r", ""))
                if index in cells:
                    raise PlanError("Workbook contains a duplicated cell")
                kind = cell.get("t", "n")
                value = cell.findtext("m:v", default="", namespaces=NS)
                if kind == "s":
                    try:
                        value = shared[int(value)]
                    except (ValueError, IndexError) as error:
                        raise PlanError("Workbook shared string index is invalid") from error
                elif kind == "inlineStr":
                    inline = cell.find("m:is", NS)
                    value = "" if inline is None else "".join(
                        node.text or "" for node in inline.findall(".//m:t", NS))
                elif kind not in ("n", "str", "b"):
                    raise PlanError("Workbook contains an unsupported cell type")
                cells[index] = (value, kind, cell.find("m:f", NS) is not None)
            result[row_number] = cells
        return result


def _table(path: Path, *, modern: bool) -> dict[int, dict[str, tuple[str, str, bool]]]:
    cells = _read_cells(path, "Students_Current_State")
    header_cells = cells.get(4)
    if not header_cells:
        raise PlanError("Workbook header row 4 is missing")
    if any(formula for _, _, formula in header_cells.values()):
        raise PlanError("Workbook header formulas are unsupported")
    headers = [clean(header_cells.get(index, ("", "", False))[0])
               for index in range(max(header_cells) + 1)]
    if modern:
        if tuple(headers) != HEADERS:
            raise PlanError("Master workbook headers or columns changed")
    elif len(headers) != len(set(headers)) or not {"full_name", "date_of_birth", "curriculum_code", "legacy_reference"}.issubset(headers):
        raise PlanError("Historical workbook headers changed")
    expected = set(range(5, 117 if modern else 116))
    populated = {number for number, row in cells.items()
                 if number > 4 and any(clean(value) for value, _, _ in row.values())}
    if populated != expected:
        raise PlanError("Workbook source row range changed")
    result = {}
    for number in sorted(expected):
        row = cells[number]
        mapped = {header: row.get(index, ("", "", False)) for index, header in enumerate(headers)}
        if not clean(mapped["full_name"][0]):
            raise PlanError("Workbook contains an empty source name")
        decision_fields = ("full_name", "date_of_birth", "phone", "curriculum_code",
                           "instrument_or_program", "legacy_reference")
        if modern:
            decision_fields += ("Column1", "start date", "end date", "student_code", "branch_code")
        if any(mapped[field][2] for field in decision_fields):
            raise PlanError("Workbook decision fields cannot be formulas")
        result[number] = mapped
    example = result[5]
    if clean(example["legacy_reference"][0]) != "EXCEL-OLD-125":
        raise PlanError("Workbook template row changed")
    if modern:
        for number in range(6, 117):
            row = result[number]
            if any(clean(row[field][0]) for field in ("student_code", "branch_code", "legacy_reference")):
                raise PlanError("Master workbook gained unverified identity keys")
    else:
        for number in range(6, 116):
            if clean(result[number]["legacy_reference"][0]) != f"VIBE-CT-LEGACY-20261023-R{number}":
                raise PlanError("Historical source reference drifted")
    return result


def _date(cell: tuple[str, str, bool]) -> tuple[str | None, str | None]:
    value, kind, formula = cell
    if formula:
        return None, "DATE_FORMULA_UNSUPPORTED"
    if not clean(value):
        return None, "DATE_MISSING"
    if kind != "n":
        return None, "DATE_TEXT_OR_INVALID"
    try:
        serial = Decimal(value)
    except InvalidOperation:
        return None, "DATE_SERIAL_INVALID"
    if not serial.is_finite() or serial != int(serial) or serial < 61 or serial > 2_958_465:
        return None, "DATE_SERIAL_INVALID"
    try:
        return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat(), None
    except (ValueError, OverflowError):
        return None, "DATE_SERIAL_INVALID"


def _load_json(path: Path, expected_sha: str | None, kind: str):
    if expected_sha is None:
        raise PlanError(f"{kind}: SHA-256 must be supplied")
    check_digest(path, expected_sha, kind)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise PlanError(f"{kind}: invalid JSON") from error


def _ledger(data: object, historical_sha256: str) -> dict[int, dict]:
    if not isinstance(data, dict) or data.get("project_ref") != PROJECT_REF \
       or data.get("import_batch_id") != BATCH_ID \
       or data.get("source_sha256") != historical_sha256:
        raise PlanError("Ledger provenance does not match the verified production import")
    rows = data.get("rows")
    if not isinstance(rows, list) or len(rows) != 111:
        raise PlanError("Ledger source row count changed")
    by_row = {}
    targets = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict) or type(row.get("source_excel_row")) is not int:
            raise PlanError("Ledger row is invalid")
        number = row["source_excel_row"]
        if number in by_row or number not in range(5, 116):
            raise PlanError("Ledger source row is duplicated or out of range")
        expected_ref = "EXCEL-OLD-125" if number == 5 else f"VIBE-CT-LEGACY-20261023-R{number}"
        if row.get("source_reference") != expected_ref or row.get("batch") != BATCH_ID:
            raise PlanError("Ledger row/reference/batch identity does not match")
        if row.get("disposition") not in ("IMPORT", "HELD", "EXCLUDED"):
            raise PlanError("Ledger disposition is invalid")
        if row.get("profile_action") not in (
            "CREATED", "LINKED_SOURCE", "LINKED_EXISTING", "HELD", "EXCLUDED",
            "IDENTITY_CONFLICT", "ROLLED_BACK",
        ):
            raise PlanError("Ledger profile action is invalid")
        target = row.get("target_student_id")
        if target:
            if not valid_uuid(target):
                raise PlanError("Ledger target student ID is invalid")
            targets[target].append(number)
        by_row[number] = row
    if set(by_row) != set(range(5, 116)):
        raise PlanError("Ledger source rows are incomplete")
    if any(numbers != [96, 97] for numbers in targets.values() if len(numbers) > 1):
        raise PlanError("Ledger contains an unapproved shared student ID")
    if by_row[60]["disposition"] != "EXCLUDED" or by_row[94]["disposition"] != "HELD":
        raise PlanError("Ledger exception dispositions changed")
    return by_row


def _catalog(data: object) -> dict[str, dict]:
    if not isinstance(data, dict) or data.get("project_ref") != PROJECT_REF:
        raise PlanError("Catalog provenance does not match production")
    curricula = data.get("curriculums")
    if not isinstance(curricula, list):
        raise PlanError("Catalog has no curriculum list")
    by_code = {}
    catalog_ids = set()
    for item in curricula:
        if not isinstance(item, dict) or not isinstance(item.get("code"), str):
            raise PlanError("Catalog curriculum row is invalid")
        if not valid_uuid(item.get("id")) or item["id"] in catalog_ids:
            raise PlanError("Catalog curriculum ID is missing, invalid or duplicated")
        catalog_ids.add(item["id"])
        code = clean(item["code"]).upper()
        if code in by_code:
            raise PlanError("Catalog has a duplicated curriculum code")
        levels = item.get("levels")
        if not isinstance(levels, list):
            raise PlanError("Catalog levels are missing")
        level_map = {}
        for level in levels:
            if not isinstance(level, dict) or not isinstance(level.get("code"), str):
                raise PlanError("Catalog level row is invalid")
            if not valid_uuid(level.get("id")) or level["id"] in catalog_ids:
                raise PlanError("Catalog level ID is missing, invalid or duplicated")
            catalog_ids.add(level["id"])
            level_code = clean(level["code"]).upper()
            if level_code in level_map:
                raise PlanError("Catalog has a duplicated level code")
            level_map[level_code] = level
        by_code[code] = {**item, "levels": level_map}
    return by_code


def _status(status: str, reason: str | None = None, **extra) -> dict:
    answer = {"status": status}
    if reason:
        answer["reason"] = reason
    return {**answer, **extra}


def _level_code(label: str, row_number: int) -> tuple[str | None, str | None]:
    normalized = clean(label).upper()
    matched = re.fullmatch(r"GRADE ([1-8])", normalized)
    if matched:
        return f"GRADE_{matched.group(1)}", None
    if normalized == "GARDE 1" and row_number == 24:
        return "GRADE_1", "SOURCE_TYPO_GARDE_1_ROW_24"
    if not normalized:
        return None, "LEVEL_F_MISSING"
    if normalized.startswith("PRE STEP ") or normalized.startswith("PRE GRADE "):
        return None, "PRE_SEGMENT_MAPPING_NOT_APPROVED"
    return None, "LEVEL_LABEL_UNMAPPED"


def build_plan(source: Path, *, historical: Path | None = None,
               ledger: Path | None = None, ledger_sha256: str | None = None,
               catalog: Path | None = None, catalog_sha256: str | None = None,
               expected_source_sha256: str = SOURCE_SHA256,
               expected_historical_sha256: str = HISTORICAL_SHA256) -> dict:
    """Compute a private plan; never open a database or network connection."""
    check_digest(source, expected_source_sha256, "Master workbook")
    current = _table(source, modern=True)
    previous = None
    if historical is not None:
        check_digest(historical, expected_historical_sha256, "Historical workbook")
        previous = _table(historical, modern=False)
    ledger_data = _load_json(ledger, ledger_sha256, "Ledger snapshot") if ledger else None
    catalog_data = _load_json(catalog, catalog_sha256, "Catalog snapshot") if catalog else None
    ledger_rows = _ledger(ledger_data, expected_historical_sha256) if ledger_data is not None else None
    catalog_rows = _catalog(catalog_data) if catalog_data is not None else None

    rows = []
    for number in range(5, 117):
        row = current[number]
        level_raw = clean(row["Column1"][0]) if number != 5 else ""
        program_raw = clean(row["curriculum_code"][0]).upper()
        instrument_raw = clean(row["instrument_or_program"][0]).upper()
        start, start_issue = _date(row["start date"])
        end, end_issue = _date(row["end date"])
        record = {
            "source_excel_row": number,
            "source_reference": f"VIBE-CT-LEGACY-20261023-R{number}" if 6 <= number <= 115 else None,
            "source_program": program_raw,
            "source_level_f_raw": level_raw,
            "source_fee_starts_on": start,
            "source_fee_ends_on_inclusive": end,
            "source_fee_start_raw": clean(row["start date"][0]),
            "source_fee_end_raw": clean(row["end date"][0]),
            "target_student_id": None,
            "identity": _status("HOLD", "UNVERIFIED"),
        }
        if number == 5:
            record["identity"] = _status("EXCLUDED", "TEMPLATE_EXAMPLE")
        elif number == 60:
            record["identity"] = _status("EXCLUDED", "OWNER_EXCLUDED_ROW_60")
        elif number == 116:
            record["identity"] = _status("HOLD", "NEW_ROW_116_TARGET_NOT_VERIFIED")
        elif previous is None:
            record["identity"] = _status("HOLD", "HISTORICAL_SOURCE_NOT_PROVIDED")
        elif ledger_rows is None:
            record["identity"] = _status("HOLD", "PRODUCTION_LEDGER_NOT_PROVIDED")
        else:
            old = previous[number]
            ledger_row = ledger_rows[number]
            old_program = clean(old["curriculum_code"][0]).upper()
            old_name = clean(old["full_name"][0]).casefold()
            new_name = clean(row["full_name"][0]).casefold()
            old_birth = clean(old["date_of_birth"][0])
            new_birth = clean(row["date_of_birth"][0])
            old_phone = clean(old["phone"][0])
            new_phone = clean(row["phone"][0])
            if old_program != program_raw or old_program != clean(ledger_row.get("source_program")).upper():
                record["identity"] = _status("HOLD", "SOURCE_PROGRAM_OR_LEDGER_CONFLICT")
            elif old_birth != new_birth:
                record["identity"] = _status("HOLD", "SOURCE_BIRTH_DATE_CHANGED")
            elif old_name != new_name:
                record["identity"] = _status("HOLD", "SOURCE_NAME_CHANGED_REQUIRES_ID_REVIEW")
            elif old_phone != new_phone:
                record["identity"] = _status("HOLD", "SOURCE_PHONE_CHANGED_REQUIRES_ID_REVIEW")
            elif ledger_row["disposition"] == "HELD":
                reason = ("ROW_26_TARGET_STUDENT_ID_NOT_VERIFIED" if number == 26
                          else "ROW_94_PAUSE_AND_TARGET_ID_UNVERIFIED" if number == 94
                          else "LEGACY_IMPORT_HELD")
                record["identity"] = _status("HOLD", reason)
            elif ledger_row["disposition"] == "EXCLUDED":
                record["identity"] = _status("EXCLUDED", "LEGACY_IMPORT_EXCLUDED")
            elif ledger_row["profile_action"] not in ("CREATED", "LINKED_SOURCE", "LINKED_EXISTING"):
                record["identity"] = _status("HOLD", "LEDGER_PROFILE_ACTION_NOT_ACTIVE")
            elif not ledger_row.get("target_student_id"):
                record["identity"] = _status("HOLD", "TARGET_STUDENT_ID_MISSING")
            else:
                record["identity"] = _status("LEDGER_LINK_MATCHED", "SOURCE_ROW_LEDGER_AND_HISTORY_MATCH",
                                              live_student_verified=False)
                record["target_student_id"] = ledger_row["target_student_id"]

        if record["identity"]["status"] == "EXCLUDED":
            tuition_reference = academic_reference = _status("EXCLUDED", record["identity"]["reason"])
            tuition_operational = academic_operational = _status("EXCLUDED", record["identity"]["reason"])
        elif record["identity"]["status"] != "LEDGER_LINK_MATCHED":
            tuition_reference = academic_reference = _status("HOLD", record["identity"]["reason"])
            tuition_operational = academic_operational = _status("HOLD", record["identity"]["reason"])
        else:
            ledger_row = ledger_rows[number]
            program_columns_conflict = program_raw != instrument_raw and not (
                program_raw == "DRUM" and instrument_raw in ("DRUM", "DRUMS"))
            if number == 22 and start_issue == end_issue == "DATE_MISSING":
                tuition_reference = _status("HOLD", "UNLIMITED_KEEP_EXISTING_NO_DATE_UPDATE")
            elif start_issue or end_issue:
                tuition_reference = _status("HOLD", start_issue or end_issue)
            elif end <= start:
                tuition_reference = _status("HOLD", "FEE_END_MUST_FOLLOW_START")
            else:
                tuition_reference = (_status("MATCHED_COLUMNS_ONLY", "REFERENCE_DATE_COLUMNS_MATCH",
                                             normalized_payload_verified=False)
                                     if ledger_row.get("fee_starts_on") == start
                                     and ledger_row.get("source_effective_ends_on") == end
                                     else _status("CANDIDATE_REFERENCE", "DATES_VALID_LEDGER_LINK_MATCHED",
                                                  live_student_verified=False))
            tuition_operational = _status("HOLD", "UNLIMITED_PERIOD_MODEL_NOT_VERIFIED" if number == 22
                                          else "TUITION_PERIOD_ID_NOT_VERIFIED")
            academic_operational = _status("HOLD", "ACADEMIC_START_AND_ENROLLMENT_NOT_VERIFIED")
            if program_columns_conflict:
                academic_reference = _status("HOLD", "PROGRAM_COLUMNS_CONFLICT")
            else:
                code, label_note = _level_code(level_raw, number)
                target_program = "DRUMS" if program_raw == "DRUM" else program_raw
                if not code:
                    academic_reference = _status("HOLD", label_note)
                elif catalog_rows is None:
                    academic_reference = _status("HOLD", "PRODUCTION_CATALOG_NOT_PROVIDED", proposed_level_code=code)
                elif target_program not in CANONICAL_PROGRAMS:
                    # A Vocal mapping already present in the import can be reused
                    # for its source label. Never create or change its curriculum/level.
                    existing = catalog_rows.get("VOCAL") if target_program == "VOCAL" else None
                    existing_level = existing["levels"].get(code) if existing and existing.get("status") == "ACTIVE" else None
                    reusable = existing and existing_level and existing_level.get("status") == "ACTIVE" \
                        and ledger_row.get("curriculum_id") == existing.get("id") \
                        and ledger_row.get("level_id") == existing_level.get("id")
                    if reusable:
                        same_label = clean(ledger_row.get("original_grade")).upper() == level_raw.upper()
                        academic_reference = _status("MATCHED_REFERENCE_FIELDS_ONLY" if same_label else "CANDIDATE_REFERENCE",
                                                     "EXISTING_VOCAL_REFERENCE_REUSED",
                                                     proposed_program_code="VOCAL", proposed_level_code=code,
                                                     proposed_curriculum_id=existing.get("id"),
                                                     proposed_level_id=existing_level.get("id"),
                                                     normalization_notes=[label_note] if label_note else [])
                    else:
                        academic_reference = _status("HOLD", "PROGRAM_NOT_APPROVED_FOR_NEW_MAPPING")
                else:
                    program = catalog_rows.get(target_program)
                    level = program["levels"].get(code) if program and program.get("status") == "ACTIVE" else None
                    if not program or not level or level.get("status") != "ACTIVE":
                        academic_reference = _status("HOLD", "ACTIVE_PROGRAM_LEVEL_NOT_FOUND", proposed_level_code=code)
                    elif ledger_row.get("curriculum_id") not in (None, program.get("id")):
                        academic_reference = _status("HOLD", "EXISTING_PROGRAM_ID_CONFLICT")
                    else:
                        note = [label_note] if label_note else []
                        same = ledger_row.get("curriculum_id") == program.get("id") \
                            and ledger_row.get("level_id") == level.get("id") \
                            and clean(ledger_row.get("original_grade")).upper() == level_raw.upper()
                        academic_reference = _status("MATCHED_REFERENCE_FIELDS_ONLY" if same else "CANDIDATE_REFERENCE",
                                                     "REFERENCE_LEVEL_MATCH" if same else "LEVEL_F_AND_CATALOG_VERIFIED",
                                                     proposed_program_code=target_program,
                                                     proposed_level_code=code,
                                                     proposed_curriculum_id=program.get("id"),
                                                     proposed_level_id=level.get("id"),
                                                     normalization_notes=note)
        schedule = (_status("EXCLUDED", record["identity"]["reason"])
                    if record["identity"]["status"] == "EXCLUDED"
                    else _status("HOLD", "NO_APPROVED_SCHEDULE_START_OR_CONFIRMED_GROUP"))
        if number == 94:
            schedule = _status("HOLD", "ROW_94_PAUSED_LEGACY_AND_NO_APPROVED_SCHEDULE_START")
        record["tuition_date_action"] = {"reference": tuition_reference, "operational": tuition_operational}
        record["academic_action"] = {"reference": academic_reference, "operational": academic_operational}
        record["schedule_action"] = schedule
        rows.append(record)

    if len(rows) != 112 or sum(row["identity"]["status"] == "EXCLUDED" for row in rows) < 2:
        raise PlanError("Expected source exclusions changed")
    counts = {
        field: dict(sorted(Counter(row[field][part]["status"] for row in rows[1:]).items()))
        for field, part in (("tuition_date_action", "reference"), ("academic_action", "reference"))
    }
    counts["identity"] = dict(sorted(Counter(row["identity"]["status"] for row in rows[1:]).items()))
    counts["schedule_action"] = dict(sorted(Counter(row["schedule_action"]["status"] for row in rows[1:]).items()))
    return {
        "schema_version": "CAN_THO_MASTER_PREPARATION_V1",
        "read_only": True,
        "production_write_allowed": False,
        "requires_live_recheck_before_any_write": True,
        "release_gate": "NO_GO_FULL_RESTORE_AND_RELEASE_NOT_PROVEN",
        "project_ref": PROJECT_REF if ledger_rows else None,
        "import_batch_id": BATCH_ID if ledger_rows else None,
        "source_sha256": expected_source_sha256,
        "historical_source_sha256": expected_historical_sha256 if previous else None,
        "ledger_sha256": ledger_sha256 if ledger_rows else None,
        "ledger_extracted_at_utc": ledger_data.get("extracted_at_utc") if ledger_rows else None,
        "catalog_sha256": catalog_sha256 if catalog_rows else None,
        "catalog_extracted_at_utc": catalog_data.get("extracted_utc") if catalog_rows else None,
        "source_rows": 111,
        "template_rows": [5],
        "counts": counts,
        "rows": rows,
    }


def _write_private(plan: dict, output: Path) -> None:
    root = Path(__file__).resolve().parent.parent
    path = output.expanduser().resolve(strict=False)
    if path == root or root in path.parents:
        raise PlanError("Private manifest output must be outside the repository")
    parent = path.parent
    if any((ancestor / ".git").exists() for ancestor in (parent, *parent.parents)):
        raise PlanError("Private manifest output must be outside every Git checkout")
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if parent.is_symlink() or parent.stat().st_mode & 0o077:
        raise PlanError("Private manifest directory must have mode 0700")
    payload = json.dumps(plan, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a read-only, private Cần Thơ master plan")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--historical", type=Path)
    parser.add_argument("--ledger", type=Path)
    parser.add_argument("--ledger-sha256")
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--catalog-sha256")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        plan = build_plan(args.source, historical=args.historical,
                          ledger=args.ledger, ledger_sha256=args.ledger_sha256,
                          catalog=args.catalog, catalog_sha256=args.catalog_sha256)
        _write_private(plan, args.output)
    except (PlanError, OSError, KeyError, TypeError, OverflowError, BadZipFile) as error:
        print(f"Preparation stopped: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"source_rows": plan["source_rows"], "counts": plan["counts"],
                      "release_gate": plan["release_gate"], "private_manifest_sha256": digest(args.output)},
                     ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
