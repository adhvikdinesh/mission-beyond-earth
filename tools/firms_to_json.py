"""Convert a NASA FIRMS active-fire CSV into data/fires.json for the Operations phase.

Get the CSV from https://firms.modaps.eosdis.nasa.gov/download/ (or the "Active Fire Data"
page): region Europe, source VIIRS (S-NPP or NOAA-20), last 7 days, format CSV.

Usage:  python3 tools/firms_to_json.py path/to/fires.csv
"""
import csv, json, sys, os

LAT = (24, 81); LON = (-30, 40)        # same box as the Operations map
MAX_FIRES = 60
SAT = {"N": "VIIRS S-NPP", "N20": "VIIRS NOAA-20", "1": "VIIRS NOAA-20", "N21": "VIIRS NOAA-21", "T": "MODIS Terra", "A": "MODIS Aqua", "": "VIIRS"}                           # keep the map readable: the strongest fires win

def main(path):
    rows, sat_seen = [], set()
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                lat, lon = float(r["latitude"]), float(r["longitude"])
            except (KeyError, ValueError):
                continue
            if not (LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]):
                continue
            conf = (r.get("confidence") or "").strip().lower()
            if conf in ("l", "low"):
                continue
            frp = float(r.get("frp") or 0)
            sat_seen.add((r.get("satellite") or "").strip())
            rows.append({"lat": round(lat, 3), "lon": round(lon, 3), "frp": round(frp, 1),
                         "day": (r.get("daynight") or "D").upper() == "D", "date": r.get("acq_date", "")})
    # mission area (Spain and Portugal) first, then the strongest fires elsewhere
    IB = lambda x: 35.5 <= x["lat"] <= 44.2 and -9.8 <= x["lon"] <= 4.5
    rows.sort(key=lambda x: (not IB(x), -x["frp"]))
    # drop near-duplicates (same fire seen on several passes): one point per ~10 km cell
    seen, fires = set(), []
    for x in rows:
        key = (round(x["lat"] * 10), round(x["lon"] * 10))
        if key in seen:
            continue
        seen.add(key); fires.append(x)
        if len(fires) >= MAX_FIRES:
            break
    dates = sorted({x["date"] for x in fires if x["date"]})
    span = f"{dates[0]} to {dates[-1]}" if dates else "unknown dates"
    sats = sorted({SAT.get(r, r) for r in sat_seen}) or ["VIIRS"]
    out = {"source": f"NASA FIRMS active fires, {' / '.join(sats)}, {span} ({len(fires)} fires: all inside the Iberia mission area, then the strongest elsewhere)", "fires": fires}
    os.makedirs("data", exist_ok=True)
    with open("data/fires.json", "w") as f:
        json.dump(out, f, indent=1)
    print(f"Wrote data/fires.json with {len(fires)} fires ({span}).")

if __name__ == "__main__":
    main(sys.argv[1])
