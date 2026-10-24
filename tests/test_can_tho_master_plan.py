"""Synthetic, standard-library checks for the read-only Cần Thơ planner."""

from datetime import date
from html import escape
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from zipfile import ZIP_DEFLATED, ZipFile


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "can-tho-master-plan.py"
SPEC = importlib.util.spec_from_file_location("can_tho_master_plan", SCRIPT)
planner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(planner)


def serial(year, month, day):
    return str((date(year, month, day) - date(1899, 12, 30)).days)


def address(index):
    label = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        label = chr(ord("A") + remainder) + label
    return label


def book(path, headers, source_rows, *, date1904=False):
    """Make only the OpenXML parts used by the production read path."""
    strings = []
    index = {}

    def cell(column, row, value):
        if value is None or value == "":
            return ""
        reference = f"{address(column)}{row}"
        if isinstance(value, tuple):
            if len(value) == 3 and value[0] == "formula":
                return (f'<c r="{reference}" t="str"><f>{escape(str(value[1]))}</f>'
                        f'<v>{escape(str(value[2]))}</v></c>')
            return f'<c r="{reference}"><v>{escape(str(value[0]))}</v></c>'
        value = str(value)
        if value not in index:
            index[value] = len(strings)
            strings.append(value)
        return f'<c r="{reference}" t="s"><v>{index[value]}</v></c>'

    rows = ['<row r="4">' + "".join(cell(i, 4, name) for i, name in enumerate(headers)) + '</row>']
    for number, values in sorted(source_rows.items()):
        rows.append(f'<row r="{number}">' + "".join(
            cell(i, number, values.get(header)) for i, header in enumerate(headers)) + '</row>')
    main = planner.MAIN
    rel = planner.DOC_REL
    pkg = planner.PKG_REL
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml",
                         f'<workbook xmlns="{main}" xmlns:r="{rel}">'
                         f'<workbookPr date1904="{1 if date1904 else 0}"/>'
                         '<sheets><sheet name="Students_Current_State" sheetId="1" r:id="rId1"/>'
                         '</sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels",
                         f'<Relationships xmlns="{pkg}"><Relationship Id="rId1" '
                         'Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml",
                         f'<worksheet xmlns="{main}"><sheetData>{"".join(rows)}</sheetData></worksheet>')
        archive.writestr("xl/sharedStrings.xml",
                         f'<sst xmlns="{main}">' + "".join(
                             f'<si><t>{escape(value)}</t></si>' for value in strings) + '</sst>')


def fake_ids(number):
    return f"{number:08x}-0000-4000-8000-000000000000"


class PlannerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="vibe-plan-test-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.source = self.directory / "new.xlsx"
        self.old = self.directory / "old.xlsx"
        self.ledger = self.directory / "ledger.json"
        self.catalog = self.directory / "catalog.json"
        self.old_headers = [name for name in planner.HEADERS
                            if name not in ("Column1", "start date", "end date")]
        self.old_rows = {}
        self.new_rows = {}
        for number in range(5, 117):
            common = {
                "full_name": f"Student {number}",
                "date_of_birth": "2015-01-01", "phone": "0900000000",
                "instrument_or_program": "PIANO", "curriculum_code": "PIANO",
                "current_grade": "GRADE 8", "legacy_reference": "",
            }
            if number == 5:
                common["legacy_reference"] = "EXCEL-OLD-125"
            if number <= 115:
                old = dict(common)
                if number != 5:
                    old["legacy_reference"] = f"VIBE-CT-LEGACY-20261023-R{number}"
                self.old_rows[number] = old
            new = dict(common)
            new.update({"Column1": "GRADE 1", "start date": (serial(2026, 10, 24),),
                        "end date": (serial(2027, 1, 24),)})
            self.new_rows[number] = new
        self.new_rows[6]["Column1"] = "GRADE 2"
        self.new_rows[16]["Column1"] = ""
        self.new_rows[22]["start date"] = ""
        self.new_rows[22]["end date"] = ""
        self.new_rows[24]["Column1"] = "GARDE 1"
        self.new_rows[39]["full_name"] = "Changed Student 39"
        self.new_rows[77]["phone"] = "0900000001"
        self.new_rows[80]["end date"] = (serial(2026, 10, 24),)
        self.new_rows[86]["end date"] = "13/1/22027"
        self.new_rows[94]["Column1"] = "GRADE 2"
        book(self.old, self.old_headers, self.old_rows)
        book(self.source, planner.HEADERS, self.new_rows)
        self.old_sha = planner.digest(self.old)
        self.new_sha = planner.digest(self.source)
        self.curriculum_id = fake_ids(1000)
        self.level1_id = fake_ids(1001)
        self.level2_id = fake_ids(1002)
        ledger_rows = []
        for number in range(5, 116):
            disposition = "EXCLUDED" if number in (5, 60) else "HELD" if number in (26, 94) else "IMPORT"
            ledger_rows.append({
                "batch": planner.BATCH_ID,
                "source_excel_row": number,
                "source_reference": "EXCEL-OLD-125" if number == 5 else f"VIBE-CT-LEGACY-20261023-R{number}",
                "source_program": "PIANO",
                "disposition": disposition,
                "profile_action": "CREATED" if disposition == "IMPORT" else disposition,
                "target_student_id": fake_ids(number) if disposition == "IMPORT" else None,
                "curriculum_id": self.curriculum_id,
                "level_id": self.level1_id,
                "original_grade": "GRADE 1",
                "fee_starts_on": "2026-10-24" if number == 7 else "2026-01-01",
                "source_effective_ends_on": "2027-01-24" if number == 7 else "2026-04-01",
            })
        self.ledger_data = {"project_ref": planner.PROJECT_REF, "import_batch_id": planner.BATCH_ID,
                            "source_sha256": self.old_sha, "rows": ledger_rows}
        self.ledger.write_text(json.dumps(self.ledger_data))
        self.catalog.write_text(json.dumps({"project_ref": planner.PROJECT_REF, "curriculums": [{
            "id": self.curriculum_id, "code": "PIANO", "status": "ACTIVE", "levels": [
                {"id": self.level1_id, "code": "GRADE_1", "status": "ACTIVE"},
                {"id": self.level2_id, "code": "GRADE_2", "status": "ACTIVE"},
            ]}]}))

    def plan(self):
        return planner.build_plan(
            self.source, historical=self.old, ledger=self.ledger,
            ledger_sha256=planner.digest(self.ledger),
            catalog=self.catalog, catalog_sha256=planner.digest(self.catalog),
            expected_source_sha256=self.new_sha,
            expected_historical_sha256=self.old_sha)

    def test_independent_reference_actions_and_no_operational_ready(self):
        plan = self.plan()
        self.assertEqual(plan["source_rows"], 111)
        self.assertFalse(plan["production_write_allowed"])
        by_row = {row["source_excel_row"]: row for row in plan["rows"]}
        self.assertEqual(by_row[6]["tuition_date_action"]["reference"]["status"], "CANDIDATE_REFERENCE")
        self.assertEqual(by_row[6]["academic_action"]["reference"]["proposed_level_code"], "GRADE_2")
        self.assertEqual(by_row[7]["tuition_date_action"]["reference"]["status"], "MATCHED_COLUMNS_ONLY")
        self.assertFalse(by_row[7]["tuition_date_action"]["reference"]["normalized_payload_verified"])
        self.assertEqual(by_row[16]["academic_action"]["reference"]["reason"], "LEVEL_F_MISSING")
        self.assertEqual(by_row[24]["academic_action"]["reference"]["normalization_notes"],
                         ["SOURCE_TYPO_GARDE_1_ROW_24"])
        self.assertEqual(by_row[22]["tuition_date_action"]["reference"]["reason"],
                         "UNLIMITED_KEEP_EXISTING_NO_DATE_UPDATE")
        self.assertEqual(by_row[26]["identity"]["reason"], "ROW_26_TARGET_STUDENT_ID_NOT_VERIFIED")
        self.assertEqual(by_row[39]["identity"]["status"], "HOLD")
        self.assertEqual(by_row[60]["identity"]["status"], "EXCLUDED")
        self.assertEqual(by_row[77]["identity"]["reason"], "SOURCE_PHONE_CHANGED_REQUIRES_ID_REVIEW")
        self.assertEqual(by_row[80]["tuition_date_action"]["reference"]["reason"],
                         "FEE_END_MUST_FOLLOW_START")
        self.assertEqual(by_row[86]["tuition_date_action"]["reference"]["reason"], "DATE_TEXT_OR_INVALID")
        self.assertEqual(by_row[94]["schedule_action"]["status"], "HOLD")
        self.assertEqual(by_row[116]["identity"]["status"], "HOLD")
        self.assertEqual(by_row[6]["source_fee_ends_on_inclusive"], "2027-01-24")
        for row in plan["rows"]:
            self.assertNotEqual(row["tuition_date_action"]["operational"]["status"], "READY")
            self.assertNotEqual(row["academic_action"]["operational"]["status"], "READY")
            self.assertNotEqual(row["schedule_action"]["status"], "READY")

    def test_source_checksum_and_structure_fail_closed(self):
        with self.assertRaisesRegex(planner.PlanError, "SHA-256 mismatch"):
            planner.build_plan(self.source)
        changed = list(planner.HEADERS)
        changed[5] = "Old Level"
        book(self.source, changed, self.new_rows)
        with self.assertRaisesRegex(planner.PlanError, "headers or columns changed"):
            planner.build_plan(self.source, expected_source_sha256=planner.digest(self.source))

    def test_program_column_conflict_holds_academic_but_not_verified_dates(self):
        self.new_rows[8]["instrument_or_program"] = "VIOLIN"
        book(self.source, planner.HEADERS, self.new_rows)
        self.new_sha = planner.digest(self.source)
        row = self.plan()["rows"][8 - 5]
        self.assertEqual(row["identity"]["status"], "LEDGER_LINK_MATCHED")
        self.assertFalse(row["identity"]["live_student_verified"])
        self.assertEqual(row["tuition_date_action"]["reference"]["status"], "CANDIDATE_REFERENCE")
        self.assertEqual(row["academic_action"]["reference"]["reason"], "PROGRAM_COLUMNS_CONFLICT")
        self.assertEqual(row["tuition_date_action"]["operational"]["status"], "HOLD")

    def test_same_day_and_blank_level_do_not_infer_values(self):
        rows = {row["source_excel_row"]: row for row in self.plan()["rows"]}
        self.assertEqual(rows[80]["tuition_date_action"]["reference"]["reason"],
                         "FEE_END_MUST_FOLLOW_START")
        self.assertEqual(rows[16]["source_level_f_raw"], "")
        self.assertEqual(rows[16]["academic_action"]["reference"]["reason"], "LEVEL_F_MISSING")
        self.assertEqual(rows[22]["tuition_date_action"]["reference"]["reason"],
                         "UNLIMITED_KEEP_EXISTING_NO_DATE_UPDATE")

    def test_source_row_and_date_system_drift_fail_closed(self):
        altered = dict(self.new_rows)
        altered.pop(116)
        book(self.source, planner.HEADERS, altered)
        with self.assertRaisesRegex(planner.PlanError, "row range changed"):
            planner.build_plan(self.source, expected_source_sha256=planner.digest(self.source))
        book(self.source, planner.HEADERS, self.new_rows, date1904=True)
        with self.assertRaisesRegex(planner.PlanError, "1904 date system"):
            planner.build_plan(self.source, expected_source_sha256=planner.digest(self.source))

    def test_ledger_reference_or_catalog_drift_fail_closed(self):
        self.ledger_data["rows"][1]["source_reference"] = "wrong"
        self.ledger.write_text(json.dumps(self.ledger_data))
        with self.assertRaisesRegex(planner.PlanError, "row/reference/batch"):
            self.plan()
        self.ledger_data["rows"][1]["source_reference"] = "VIBE-CT-LEGACY-20261023-R6"
        self.ledger.write_text(json.dumps(self.ledger_data))
        catalog = json.loads(self.catalog.read_text())
        catalog["project_ref"] = "wrong"
        self.catalog.write_text(json.dumps(catalog))
        with self.assertRaisesRegex(planner.PlanError, "Catalog provenance"):
            self.plan()

    def test_inactive_ledger_profile_cannot_verify_target(self):
        self.ledger_data["rows"][1]["profile_action"] = "ROLLED_BACK"
        self.ledger.write_text(json.dumps(self.ledger_data))
        row = self.plan()["rows"][1]
        self.assertEqual(row["source_excel_row"], 6)
        self.assertEqual(row["identity"]["reason"], "LEDGER_PROFILE_ACTION_NOT_ACTIVE")
        self.assertIsNone(row["target_student_id"])
        self.assertEqual(row["tuition_date_action"]["reference"]["status"], "HOLD")

    def test_catalog_ids_are_required_before_level_candidate(self):
        catalog = json.loads(self.catalog.read_text())
        del catalog["curriculums"][0]["id"]
        self.catalog.write_text(json.dumps(catalog))
        with self.assertRaisesRegex(planner.PlanError, "Catalog curriculum ID"):
            self.plan()
        catalog["curriculums"][0]["id"] = self.curriculum_id
        del catalog["curriculums"][0]["levels"][0]["id"]
        self.catalog.write_text(json.dumps(catalog))
        with self.assertRaisesRegex(planner.PlanError, "Catalog level ID"):
            self.plan()

    def test_formula_in_identity_or_level_cell_fails_closed(self):
        self.new_rows[6]["Column1"] = ("formula", "\"GRADE 2\"", "GRADE 2")
        book(self.source, planner.HEADERS, self.new_rows)
        self.new_sha = planner.digest(self.source)
        with self.assertRaisesRegex(planner.PlanError, "decision fields cannot be formulas"):
            self.plan()
        self.new_rows[6]["Column1"] = "GRADE 2"
        self.new_rows[6]["phone"] = ("formula", "\"0900000000\"", "0900000000")
        book(self.source, planner.HEADERS, self.new_rows)
        self.new_sha = planner.digest(self.source)
        with self.assertRaisesRegex(planner.PlanError, "decision fields cannot be formulas"):
            self.plan()

    def test_private_manifest_requires_private_non_git_directory(self):
        plan = self.plan()
        output = self.directory / "private" / "manifest.json"
        planner._write_private(plan, output)
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)
        self.assertEqual(output.parent.stat().st_mode & 0o777, 0o700)
        with self.assertRaises(FileExistsError):
            planner._write_private(plan, output)
        checkout = self.directory / "another-checkout"
        checkout.mkdir(mode=0o700)
        (checkout / ".git").mkdir()
        with self.assertRaisesRegex(planner.PlanError, "every Git checkout"):
            planner._write_private(plan, checkout / "manifest.json")


if __name__ == "__main__":
    unittest.main()
