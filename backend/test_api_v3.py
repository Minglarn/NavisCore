import http.client
import json
import sys

# Testing against port 3000 - the host port mapped in docker-compose
conn = http.client.HTTPConnection("localhost", 3000)
path = "/api/statistics"
if len(sys.argv) > 1:
    path += f"?date={sys.argv[1]}"

try:
    print(f"Connecting to localhost:3000{path}...")
    conn.request("GET", path)
    r = conn.getresponse()
    print(f"Status: {r.status}")
    data = r.read().decode()
    if r.status == 200:
        print(json.dumps(json.loads(data), indent=2))
    else:
        print(f"Error: {data}")
except Exception as e:
    print(f"Failed: {e}")
finally:
    conn.close()
