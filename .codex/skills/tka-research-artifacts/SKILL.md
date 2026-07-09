---
name: tka-research-artifacts
description: Use for research folder work, SPSS-style generated datasets, statistics summaries, chart generation, paper/PPT support assets, and Python analysis scripts.
---

# TKA Research Artifacts

## When To Use

Use this skill when the task mentions SPSS, research data, charts, thesis/paper
support, statistical outputs, or files under `research`.

## Workflow

1. Read `research/README.md` for the intended statistical narrative.
2. Read the relevant Python script before running or editing it.
3. Keep generated CSV files UTF-8-BOM compatible when SPSS use matters.
4. Keep chart outputs in `research/output/charts`.
5. Do not mix research scripts into the web app runtime.
6. If changing generated values, update stats summaries and chart explanations
   together.

## Commands

- `python research\generate_spss_data.py`
- `python research\compute_stats.py`
- `python research\generate_spss_charts.py`

## Files To Inspect

- `research/README.md`
- `research/generate_spss_data.py`
- `research/compute_stats.py`
- `research/generate_spss_charts.py`
- `research/output/stats_summary.txt`
- `research/output/*.csv`
- `research/output/charts/*.png`
- `research/SPSS操作手册.md`
- `research/图表解读说明.md`

## Common Mistakes

- Treating generated research data as production app data.
- Updating CSV outputs without regenerating summaries and charts.
- Changing the random seed without noting that outputs changed.
- Submitting `stats_summary.txt` as public-facing material if it is intended as
  private reference.

## Verification Checklist

- Scripts run in the expected order.
- CSV, summary, and charts are consistent.
- Any changed narrative still matches generated statistics.
- App build is not affected by research-only changes.
