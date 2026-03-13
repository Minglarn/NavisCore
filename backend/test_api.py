import requests
import json
import sys

URL = "http://localhost:8080/api/statistics"
if len(sys.argv) > 1:
    URL += f"?date={sys.argv[1]}"

try:
    r = requests.get(URL)
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2))
    else:
        print(f"Error {r.status_code}: {r.text}")
except Exception as e:
    print(f"Failed to connect: {e}")
