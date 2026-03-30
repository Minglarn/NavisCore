import socket
import time
import random

# Use 127.0.0.1 for Docker port forwarding
UDP_IP = "127.0.0.1" 
UDP_PORT = 10110

def calculate_checksum(sentence):
    data = sentence.lstrip("!").split("*")[0]
    checksum = 0
    for char in data:
        checksum ^= ord(char)
    return f"{checksum:02X}"

def build_nmea(payload, channel="A"):
    data = f"AIVDM,1,1,,{channel},{payload},0"
    return f"!{data}*{calculate_checksum(data)}"

def send_ais(nmea_sentence):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(nmea_sentence.encode(), (UDP_IP, UDP_PORT))
    print(f"Sent: {nmea_sentence}")

def simulate_new_vessel():
    payloads = [
        "13HOI:0P00Or694N8pks6JlV0HSs", # MMSI 235062000
        "133m6B0P00or6@dN8MA938vV0H9H", # MMSI 205432000
        "139dP70000Or8N4N8pks@JlV0<00", # MMSI 2320146
        "13P;?80000Or:N4N8pks@JlV0<00"  # MMSI 235555666
    ]
    
    for p in payloads:
        nmea = build_nmea(p)
        send_ais(nmea)
        time.sleep(0.5)

if __name__ == "__main__":
    simulate_new_vessel()
    print("\nSimulation complete with 127.0.0.1 and correct checksums.")
