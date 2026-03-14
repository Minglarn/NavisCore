
import json

# Simulated AIS 6-bit conversion (from ais_logic.py)
def to_6_bit_string(payload_char):
    val = ord(payload_char) - 48
    if val >= 40:
        val -= 8
    return f"{val:06b}"

def get_int_from_bits(bitstr, start, length):
    sub_bits = bitstr[start:start + length]
    if not sub_bits: return 0
    return int(sub_bits, 2)

def decode_payload(payload):
    bitstr = "".join([to_6_bit_string(c) for c in payload])
    if len(bitstr) < 38: return {"error": "too short"}
    msg_type = get_int_from_bits(bitstr, 0, 6)
    mmsi = get_int_from_bits(bitstr, 8, 30)
    return {"type": msg_type, "mmsi": mmsi}

# Test the user's string
payload = "13dQ5L" 
# Note: Full payload would be longer, but MMSI is in the first few chars
try:
    decoded = decode_payload(payload)
    print(f"Decoded: {decoded}")
except Exception as e:
    print(f"Error: {e}")

# Check if MMSI 265521110 matches
mmsi_target = 265521110
mmsi_bin = f"{mmsi_target:030b}"
print(f"Target MMSI Binary: {mmsi_bin}")

# Reconstruct expected payload for 265521110 (Type 1)
# bits 0-5: 000001 (Type 1)
# bits 6-7: 00 (Repeat)
# bits 8-37: 001111110100100000010100110110 (MMSI 265521110)
full_bits = "000001" + "00" + mmsi_bin
print(f"Full bits: {full_bits}")

# Convert back to chars
def bits_to_ais_char(bits):
    val = int(bits, 2)
    if val >= 40: # This should match to_6_bit_string inversion
        val += 8
    return chr(val + 48)

reconstructed = ""
for i in range(0, len(full_bits), 6):
    reconstructed += bits_to_ais_char(full_bits[i:i+6])
print(f"Reconstructed Payload Start: {reconstructed}")
print(f"Original User Start: {payload}")
