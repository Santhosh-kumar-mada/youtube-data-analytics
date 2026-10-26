from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.data_workflow import clean_youtube_data, load_sample_data

PROJECT_ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="YouTube Data Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check() -> dict:
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_csv(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    contents = await file.read()

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="The CSV file is empty.")

    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File must be smaller than 5 MB.",
        )

    try:
        csv_text = contents.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(csv_text), skip_blank_lines=True)
        cleaned_df, summary = clean_youtube_data(df)

        return {
            "rows": cleaned_df.to_dict(orient="records"),
            "summary": summary,
            "columns": cleaned_df.columns.tolist(),
        }
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Unable to read this CSV file.")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The CSV file is empty.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to read this CSV file: {exc}")


@app.get("/api/sample")
async def get_sample_data() -> dict:
    try:
        df = load_sample_data()
        cleaned_df, summary = clean_youtube_data(df)
        return {
            "rows": cleaned_df.to_dict(orient="records"),
            "summary": summary,
            "columns": cleaned_df.columns.tolist(),
        }
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Sample file not found: {exc}")


app.mount("/", StaticFiles(directory=str(PROJECT_ROOT), html=True), name="frontend")
