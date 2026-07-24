#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Runs the screener logic and writes results to data/live_data.xlsx.
This script is executed on a schedule by GitHub Actions
(.github/workflows/update_data.yml), NOT by the Streamlit app.
"""
import sys
import os
import pandas as pd
from datetime import datetime, time as dtime
import pytz
import requests
import json
import pandas as pd
import numpy as np

IST = pytz.timezone('Asia/Kolkata')


def is_market_open(now_ist: datetime) -> bool:
    """NSE cash market: Mon-Fri, 09:00-15:30 IST (widened for pre-open data)."""
    start = dtime(9, 3)
    end = dtime(15, 39)
    return start <= now_ist.time() <= end


def screener():
    country="india"
    tickers="any"
    indexes="any"
    analysis="technical"
  
    country = country.lower()
    
    fields_overview = [
        "name", "description", "update_mode", "close", "currency", "change",
        "volume", "relative_volume_10d_calc", "Recommend.All", "market_cap_basic",
        "price_earnings_ttm", "earnings_per_share_diluted_ttm",
        "earnings_per_share_diluted_yoy_growth_ttm", "dividends_yield_current",
        "sector", "exchange"
    ]
    
    fields_performance = [
        "name", "description", "update_mode", "close", "currency", "change",
        "Perf.W", "Perf.1M", "Perf.3M", "Perf.6M", "Perf.YTD", "Perf.Y", "Perf.5Y",
        "Perf.10Y", "Perf.All", "Volatility.W", "Volatility.M", "sector", "exchange"
    ]
    
    fields_premarket_postmarket = [
        "name", "description", "update_mode", "premarket_close", "currency",
        "premarket_change", "premarket_gap", "premarket_volume", "close", "change",
        "gap", "volume", "volume|5", "volume|15", "volume_change", "postmarket_close",
        "postmarket_change", "postmarket_volume", "exchange"
    ]
    
    fields_valuation = [
        "name", "description", "update_mode", "market_cap_basic", "fundamental_currency_code",
        "Perf.1Y.MarketCap", "price_earnings_ttm", "price_earnings_growth_ttm",
        "price_sales_current", "price_book_fq", "price_to_cash_f_operating_activities_ttm",
        "price_free_cash_flow_ttm", "price_to_cash_ratio", "enterprise_value_current",
        "enterprise_value_to_revenue_ttm", "enterprise_value_to_ebit_ttm",
        "enterprise_value_ebitda_ttm", "exchange"
    ]
    
    fields_financial = [
        "name", "description", "update_mode", "logoid", "update_mode", "type",
        "typespecs", "total_revenue_ttm", "fundamental_currency_code", "total_revenue_yoy_growth_ttm",
        "gross_profit_ttm", "oper_income_ttm", "net_income_ttm", "ebitda_ttm",
        "earnings_per_share_diluted_ttm", "earnings_per_share_diluted_yoy_growth_ttm",
        "exchange", "gross_margin_ttm", "operating_margin_ttm", "pre_tax_margin_ttm",
        "net_margin_ttm", "free_cash_flow_margin_ttm", "return_on_assets_fq",
        "return_on_equity_fq", "return_on_invested_capital_fq", "research_and_dev_ratio_ttm",
        "sell_gen_admin_exp_other_ratio_ttm"
    ]
    
    fields_technical = [
        "name", "change", "change|5", "volume_change|5", "change|15", "volume_change|15",
        "ATR|60", "low|60", "high|60", "RSI|60",
        "close|60", "EMA10|60", "EMA20|60", "EMA200|60", "EMA10", "EMA20", "EMA200",
        "close", 'volume','gap','volume|5',"volume_change","market_cap_basic",
        "exchange"
    ]
    
    fields_dict = {
        "overview": fields_overview,
        "performance": fields_performance,
        "premarket_postmarket": fields_premarket_postmarket,
        "valuation": fields_valuation,
        "financial": fields_financial,
        "technical": fields_technical
    }
    
    cols = fields_dict.get(analysis, fields_technical)
    
    query = {
        "markets": [country],
        "symbols": {
            "query": {"types": []},
            "tickers": []
        },
        "options": {"lang": "en"},
        "columns": cols,
        "sort": {
            "sortBy": "market_cap_basic",
            "sortOrder": "desc"
        },
        "range": []
    }
    
    if indexes.lower() != "any":
        query["symbols"]["symbolset"] = [f"SYML:{indexes}"]
    
    if tickers.lower() != "any":
        if isinstance(tickers, str):
            query["symbols"]["tickers"] = [tickers]
        elif isinstance(tickers, list):
            query["symbols"]["tickers"] = tickers
    
    if isinstance(country, list) and len(country) > 1:
        url = "https://scanner.tradingview.com/global/scan"
    else:
        url = f"https://scanner.tradingview.com/{country}/scan"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, headers=headers, data=json.dumps(query), timeout=20)
    
    if response.status_code != 200:
        print(f"Request failed with status: {response.status_code} {response.reason}")
        return None, None, None, None, None, None
    
    y = response.json()
    
    def process_d_list(d_list):
        return [x if x is not None else None for x in d_list]
    
    data_list = [process_d_list(item["d"]) for item in y.get("data", [])]
    
    ## various filters
    
    df = pd.DataFrame(data_list, columns=cols)
    df = df[df['exchange'] == 'NSE']
    # Fliters for lighter data
    df=df[ (df['close']>60) & (df['close']<10000) & (df['market_cap_basic']>1000000000)] #price filter

    
    #EMAs metrics
    df['close_EMA10_1H'] = ((100 * (df['close|60'] - df['EMA10|60']) / df['EMA10|60'])).round(2)
    df['close_EMA20_1H'] = ((100 * (df['close|60'] - df['EMA20|60']) / df['EMA20|60'])).round(2)
    df['close_DEMA10'] = ((100 * (df['close|60'] - df['EMA10']) / df['EMA10'])).round(2)
    df['opening'] = ((100 * (df['close'] - df['close|60']) / df['close|60'])).round(2)
    #5m charting==============================
    df_5m_Price= df[ (df['change|5'].abs() > 0.7) & ( (df['volume|5']*df['close']) > 1000000)].sort_values(by='change|5', ascending=False)
    df_5m_Price['Momentum']=  np.where(df_5m_Price['change|5'] > 0, 'Bullish','Bearish')
    df_5m_Price=df_5m_Price[['name','change|5','Momentum']]
    df_5m_Price.columns=['Stock Name','Price Change% in 5mins','Momentum']
    
    df_5m_Vol= df[ (df['volume_change|5'] > 200 ) & ( (df['volume|5']*df['close']) > 1000000) ].sort_values(by='volume_change|5', ascending=False)
    df_5m_Vol['Momentum']=  np.where(df_5m_Vol['change|5'] > 0, 'Bullish','Bearish')
    df_5m_Vol['Traded Value']=df_5m_Vol['close']* df_5m_Vol['volume']
    df_5m_Vol=df_5m_Vol[['name','change|5','volume_change|5','Momentum','Traded Value']]
    
    #Presentation
    df_5m_Vol['Traded Value'] = (df_5m_Vol['Traded Value'] / 10000000).round(2).astype(str) + 'Cr'
    df_5m_Vol.columns=['Stock Name','Price Change% in 5mins','Volume Change% in 5mins','Momentum','Days Traded Value']
    
    #15m charting =====================================================
    df_15m_Price= df[ (df['change|15'].abs() > 0.7) & ( (df['volume|5']*df['close']) > 1000000)].sort_values(by='change|15', ascending=False)
    df_15m_Price['Momentum']=  np.where(df_15m_Price['change|15'] > 0, 'Bullish','Bearish')
    df_15m_Price=df_15m_Price[['name','change|15','Momentum']]
    df_15m_Price.columns=['Stock Name','Price Change% in 15mins','Momentum']
     
    df_15m_Vol= df[ (df['volume_change|15'] > 200 ) & ( (df['volume|5']*df['close']) > 1000000) ].sort_values(by='volume_change|15', ascending=False)
    df_15m_Vol['Momentum']=  np.where(df_15m_Vol['change|15'] > 0, 'Bullish','Bearish')
    df_15m_Vol['Traded Value']=df_15m_Vol['close']* df_15m_Vol['volume']
    df_15m_Vol=df_15m_Vol[['name','change|15','volume_change|15','Momentum','Traded Value']]
     
    #Presentation
    df_15m_Vol['Traded Value'] = (df_15m_Vol['Traded Value'] / 10000000).round(2).astype(str) + 'Cr'
    df_15m_Vol.columns=['Stock Name','Price Change% in 15mins','Volume Change% in 15mins','Momentum','Days Traded Value']

    #Daily charting =====================================================
    df_D_Price= df[ (df['change'].abs() > 3.39) & ( (df['volume']*df['close']) > 1000000)].sort_values(by='change', ascending=False)
    df_D_Price['Momentum']=  np.where(df_D_Price['change'] > 0, 'Bullish','Bearish')
    df_D_Price=df_D_Price[['name','change','Momentum']]
    df_D_Price.columns=['Stock Name','Price Change% in Day','Momentum']
     
    df_D_Vol= df[ (df['volume_change'] > 200 ) & ( (df['volume']*df['close']) > 1000000) ].sort_values(by='volume_change', ascending=False)
    df_D_Vol['Momentum']=  np.where(df_D_Vol['change'] > 0, 'Bullish','Bearish')
    df_D_Vol['Traded Value']=df_D_Vol['close']* df_D_Vol['volume']
    df_D_Vol=df_D_Vol[['name','change','volume_change','Momentum','Traded Value']]
     
    #Presentation
    df_D_Vol['Traded Value'] = (df_D_Vol['Traded Value'] / 10000000).round(2).astype(str) + 'Cr'
    df_D_Vol.columns=['Stock Name','Price Change% in Day','Volume Change% in Day','Momentum','Days Traded Value']
    
    #opening
    df_opening= df[df['gap'].abs() > 2 ].sort_values(by='gap', ascending=False)
    df_opening['gap']=df_opening['gap'].round(1)
    df_opening['Momentum']=  np.where(df_opening['gap'] > 0, 'Bullish','Bearish')
    df_opening=df_opening[['name','gap','Momentum']]
    df_opening.columns=['Stock Name','Opening Gap%','Momentum']
    
    return df, df_5m_Price,df_5m_Vol,df_15m_Price,df_15m_Vol,df_D_Price,df_D_Vol,df_opening


def main():
    now_ist = datetime.now(pytz.utc).astimezone(IST)
    if not is_market_open(now_ist):
        print(f"Market closed at {now_ist.strftime('%H:%M:%S %d%b%y')} IST — skipping run.")
        gh_output = os.environ.get("GITHUB_OUTPUT")
        if gh_output:
            with open(gh_output, "a") as f:
                f.write("market_open=false\n")
        ##sys.exit(0)
    
    df, df_5m_price, df_5m_vol, df_15m_price, df_15m_vol,df_D_price, df_D_vol,df_opening = screener()
    timestamp = now_ist.strftime("%Y-%m-%d %H:%M:%S")
    with pd.ExcelWriter("data/live_data.xlsx", engine="openpyxl") as writer:
        (df_5m_price if df_5m_price is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="5m_Price", index=False)
        (df_5m_vol if df_5m_vol is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="5m_Vol", index=False)
        (df_15m_price if df_15m_price is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="15m_Price", index=False)
        (df_15m_vol if df_15m_vol is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="15m_Vol", index=False)
        (df_D_price if df_D_price is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="D_Price", index=False)
        (df_D_vol if df_D_vol is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="D_Vol", index=False)
        (df_opening if df_opening is not None else pd.DataFrame()).to_excel(
            writer, sheet_name="Opening", index=False)
        pd.DataFrame({"last_updated_ist": [timestamp]}).to_excel(
            writer, sheet_name="meta", index=False)
    
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write("market_open=true\n")


if __name__ == "__main__":
    main()
