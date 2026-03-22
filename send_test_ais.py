import socket
import time
import argparse

def encode_ais_payload(mmsi, lat, lon):
    """
    Very simplified AIS Type 1 (Position Report) encoder for testing purposes.
    Encodes MMSI, Latitude, and Longitude into a 6-bit binary string.
    """
    # 168 bits total for Type 1
    bits = ""
    
    # Message Type (6 bits): 1
    bits += f"{1:06b}"
    # Repeat Indicator (2 bits): 0
    bits += "00"
    # MMSI (30 bits)
    bits += f"{int(mmsi):030b}"
    # Nav Status (4 bits): 0 (Under way using engine)
    bits += "0000"
    # ROT (8 bits): -128 (Not available)
    bits += f"{(128):08b}"
    # SOG (10 bits): 10.2 knots -> 102
    bits += f"{102:010b}"
    # Position Accuracy (1 bit): 1 (High)
    bits += "1"
    
    # Longitude (28 bits, signed, 1/600000 min)
    lon_int = int(lon * 600000) & 0xFFFFFFF
    bits += f"{lon_int:028b}"
    
    # Latitude (27 bits, signed, 1/600000 min)
    lat_int = int(lat * 600000) & 0x7FFFFFF
    bits += f"{lat_int:027b}"
    
    # COG (12 bits): 123.4 degrees -> 1234
    bits += f"{1234:012b}"
    # True Heading (9 bits): 125 degrees
    bits += f"{125:09b}"
    # Timestamp (6 bits): 20
    bits += f"{20:06b}"
    # Special Maneuver (2 bits): 0
    bits += "00"
    # Spare (3 bits)
    bits += "000"
    # RAIM (1 bit): 0
    bits += "0"
    # Communication State (19 bits): 0
    bits += "0" * 19

    # Convert bit string to 6-bit characters
    chars = "0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVW`abcdefghijklmnopqrstuvw"
    payload = ""
    for i in range(0, len(bits), 6):
        val = int(bits[i:i+6], 2)
        payload += chars[val]
    
    return payload

def calculate_checksum(sentence):
    checksum = 0
    for char in sentence[1:]:
        checksum ^= ord(char)
    return f"{checksum:02X}"

def main():
    parser = argparse.ArgumentParser(description="Send simulated AIS UDP packets to NavisCore.")
    parser.add_argument("--mmsi", type=str, default="265000001", help="MMSI of the vessel")
    parser.add_argument("--lat", type=float, default=59.3293, help="Latitude")
    parser.add_argument("--lon", type=float, default=18.0686, help="Longitude")
    parser.add_argument("--port", type=int, default=10110, help="UDP port (default 10110)")
    parser.add_argument("--host", type=str, default="localhost", help="Destination host")
    parser.add_argument("--count", type=int, default=1, help="Number of packets to send")

    args = parser.parse_args()

    payload = encode_ais_payload(args.mmsi, args.lat, args.lon)
    # !AIVDM,1,1,,A,<payload>,0*<checksum>
    sentence_base = f"!AIVDM,1,1,,A,{payload},0"
    checksum = calculate_checksum(sentence_base)
    nmea = f"{sentence_base}*{checksum}"

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    print(f"Sending to {args.host}:{args.port}...")
    print(f"NMEA: {nmea}")
    
    for i in range(args.count):
        sock.sendto(nmea.encode(), (args.host, args.port))
        if args.count > 1:
            time.sleep(1)
            
    print("Done.")

if __name__ == "__main__":
    main()
