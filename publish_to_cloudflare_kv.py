#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reads data/live_data.xlsx (produced by screener_job.py — unchanged) and
publishes it as a single JSON blob to a Cloudflare KV namespace, under the
key "live_data". The Astro frontend's Pages Function (functions/api/data.js)
reads it back from there on every page load / poll.

Run this as a step in update_data.yml, right after screener_job.py:

    - name: Publish data to Cloudflare KV
      env:
        CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
        CF_KV_NAMESPACE_ID: ${{ secrets.CF_KV_NAMESPACE_ID }}
      run: python publish_to_cloudflare_kv.py

Required GitHub secrets:
  CF_ACCOUNT_ID       - Cloudflare account ID (dashboard right sidebar)
  CF_API_TOKEN        - API token with "Workers KV Storage: Edit" permission
  CF_KV_NAMESPACE_ID  - the KV namespace's ID (Workers & Pages > KV)
"""
import os
import sys
import json
import pandas as pd
import requests

EXCEL_PATH = "data/live_data.xlsx"

# sheet name in the xlsx  ->  key name in the JSON payload sent to the frontend
SHEET_MAP = {
    "5m_Price": "5m_price",
    "5m_Vol": "5m_vol",
    "15m_Price": "15m_price",
    "15m_Vol": "15m_vol",
    "D_Price": "d_price",
    "D_Vol": "d_vol",
    "Opening": "opening",
}


def build_payload():
    if not os.path.exists(EXCEL_PATH):
        print(f"No file at {EXCEL_PATH}, nothing to publish.", file=sys.stderr)
        sys.exit(1)

    payload = {}
    for sheet_name, json_key in SHEET_MAP.items():
        df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name)
        # NaN isn't valid JSON — normalize to None so the frontend can
        # treat missing values consistently.
        df = df.where(pd.notnull(df), None)
        payload[json_key] = df.to_dict(orient="records")

    meta = pd.read_excel(EXCEL_PATH, sheet_name="meta")
    payload["last_updated_ist"] = (
        str(meta["last_updated_ist"].iloc[0]) if not meta.empty else "Unknown"
    )
    return payload


def push_to_kv(payload):
    account_id = os.environ["CF_ACCOUNT_ID"]
    namespace_id = os.environ["CF_KV_NAMESPACE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/storage/kv/namespaces/{namespace_id}/values/live_data"
    )
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    resp = requests.put(url, headers=headers, data=json.dumps(payload), timeout=30)
    resp.raise_for_status()
    result = resp.json()
    if not result.get("success"):
        print(f"Cloudflare KV write failed: {result}", file=sys.stderr)
        sys.exit(1)
    print("Published live_data to Cloudflare KV successfully.")


if __name__ == "__main__":
    data = build_payload()
    push_to_kv(data)
