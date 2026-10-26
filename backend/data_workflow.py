from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REQUIRED_COLUMNS = ["Channel", "Month", "Subscribers", "Views", "Likes"]
NUMERIC_COLUMNS = ["Subscribers", "Views", "Likes"]


def validate_columns(df: pd.DataFrame) -> None:
    if df is None or df.empty:
        raise ValueError("The CSV file is empty.")

    missing_columns = [
        column for column in REQUIRED_COLUMNS if column not in df.columns
    ]

    if missing_columns:
        raise ValueError("Missing columns: " + ", ".join(missing_columns))


def normalize_text_columns(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()

    for column in ["Channel", "Month"]:
        cleaned[column] = (
            cleaned[column]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.replace(r"\s+", " ", regex=True)
        )

    return cleaned


def clean_youtube_data(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    validate_columns(df)

    original_count = len(df)

    working = df.copy()
    working = working.replace(r"^\s*$", pd.NA, regex=True)
    missing_count = int(working[REQUIRED_COLUMNS].isna().sum().sum())

    working = working.dropna(how="all", subset=REQUIRED_COLUMNS)
    working = normalize_text_columns(working)

    for column in NUMERIC_COLUMNS:
        working[column] = pd.to_numeric(working[column], errors="coerce")

    invalid_rows = int(
        working[NUMERIC_COLUMNS]
        .isna()
        .combine(working[NUMERIC_COLUMNS] < 0, lambda left, right: left | right)
        .any(axis=1)
        .sum()
    )

    working[NUMERIC_COLUMNS] = working[NUMERIC_COLUMNS].fillna(0)
    working.loc[:, NUMERIC_COLUMNS] = working[NUMERIC_COLUMNS].mask(
        working[NUMERIC_COLUMNS] < 0, 0
    )

    working = working[
        working["Channel"].astype(str).str.strip().ne("")
        & working["Month"].astype(str).str.strip().ne("")
    ].copy()

    before_duplicates = len(working)
    working = working.drop_duplicates().copy()
    duplicate_count = before_duplicates - len(working)

    if working.empty:
        raise ValueError("No valid records remain after cleaning.")

    for column in NUMERIC_COLUMNS:
        if not working[column].dropna().empty:
            all_integral = working[column].dropna().apply(
                lambda value: float(value).is_integer()
            ).all()
            if all_integral:
                working[column] = working[column].astype(int)

    summary = {
        "original_count": int(original_count),
        "missing_count": int(missing_count),
        "duplicate_count": int(duplicate_count),
        "invalid_rows": int(invalid_rows),
        "final_count": int(len(working)),
    }

    return working.reset_index(drop=True), summary


def load_sample_data() -> pd.DataFrame:
    sample_path = PROJECT_ROOT / "data" / "sample_youtube_data.csv"
    return pd.read_csv(sample_path)
