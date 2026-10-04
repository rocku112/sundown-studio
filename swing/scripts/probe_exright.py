import sys, json, requests
sys.path.insert(0, 'twflow/scripts')
import fetch_market as fm
UA={"User-Agent":"Mozilla/5.0"}
j=fm.get_json("https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=20250612&type=ALLBUT0999&response=json","twse_q_20250612")
for t in j.get("tables",[]):
    f=t.get("fields") or []
    if "證券代號" in f:
        print("MI fields", f)
        for r in t["data"]:
            if r[0] in ("2330","0056"): print("MI row", r)
for url in ["https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20250601&endDate=20250630&response=json",
            "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&strDate=20250601&endDate=20250630"]:
    try:
        r=requests.get(url,headers=UA,timeout=30); j=r.json()
        print("TWT49U", url[:60], r.status_code, j.get("stat"), j.get("fields"), (j.get("data") or [])[:3])
    except Exception as e: print("TWT49U fail", url[:60], e)
for url in ["https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=2025/06/01&endDate=2025/06/30&response=json",
            "https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=114/06/01&endDate=114/06/30&response=json",
            "https://www.tpex.org.tw/web/stock/exright/dailyquo/exDailyQ_result.php?l=zh-tw&d=114/06/01&ed=114/06/30"]:
    try:
        r=requests.get(url,headers=UA,timeout=30); print("TPEX", url[30:90], r.status_code, r.text[:700].replace("\n"," "))
    except Exception as e: print("TPEX fail", url[30:90], e)
# TPEx quote fields on a day: show fields and a row
j=fm.get_json("https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date=114/06/12&type=EW&response=json","tpex_q_20250612")
for t in j.get("tables",[]):
    print("OTC fields", t.get("fields")); print("OTC row", (t.get("data") or [])[:2]); break
for url in ["https://www.twse.com.tw/rwd/zh/reducation/TWTAUU?startDate=20240101&endDate=20241231&response=json",
            "https://www.twse.com.tw/rwd/zh/exRight/TWTAUU?startDate=20240101&endDate=20241231&response=json"]:
    try:
        r=requests.get(url,headers=UA,timeout=30); print("TWTAUU", url[30:80], r.status_code, r.text[:500])
    except Exception as e: print("TWTAUU fail", e)
