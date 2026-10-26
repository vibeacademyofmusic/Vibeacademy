"""Read owner workbooks without modifying them or connecting to a database."""
import argparse
import datetime as dt
import hashlib
import json
import unicodedata
from pathlib import Path

import openpyxl


def text(value):
    if value is None:
        return ""
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%Y-%m-%d")
    return unicodedata.normalize("NFC", str(value)).strip()


def read(path):
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True)["Students_Current_State"]
    values = sheet.iter_rows(min_row=4, values_only=True)
    headers = [text(v) for v in next(values)]
    if len(headers) != len(set(headers)) or not all(headers):
        raise ValueError("Missing or duplicate source headers")
    return headers, {n: dict(zip(headers, map(text, row)))
                     for n, row in enumerate(values, 5) if text(row[1])}


def extract(source, original):
    headers, rows = read(source)
    _, old = read(original)
    expected = {5: "Column1", 15: "start date", 16: "end date"}
    if len(headers) != 42 or any(headers[i] != name for i, name in expected.items()):
        raise ValueError("Unexpected current workbook column contract")
    if rows.get(5, {}).get("legacy_reference") != "EXCEL-OLD-125":
        raise ValueError("Template row no longer matches")
    result = []
    for number, raw in rows.items():
        if number == 5:
            continue
        before = old.get(number)
        identity = False
        renamed = False
        if before:
            same = all(raw.get(k, "") == before.get(k, "")
                       for k in ["date_of_birth", "phone", "curriculum_code"])
            renamed = (number == 39 and bool(raw.get("phone"))
                       and raw["full_name"] == "Huỳnh Hạnh"
                       and before["full_name"] == "Huỳnh Minh Hạnh")
            identity = same and (raw["full_name"] == before["full_name"] or renamed)
        result.append({"source_excel_row": number, "raw": raw,
                       "original_raw": before,
                       "original_reference": before.get("legacy_reference") if before else None,
                       "matches_original_identity": identity,
                       "approved_source_rename": renamed})
    return {"source_file": str(source.resolve()),
            "original_file": str(original.resolve()),
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "original_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
            "records": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--original", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = extract(args.source, args.original)
    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)
    print(json.dumps({"records": len(result["records"]),
                      "matched_original_identity": sum(r["matches_original_identity"] for r in result["records"]),
                      "source_sha256": result["source_sha256"]}))


if __name__ == "__main__":
    main()
