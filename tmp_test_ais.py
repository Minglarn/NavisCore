
def to_6_bit(payload_char):
    val = ord(payload_char) - 48
    if val > 40:
        val -= 8
    return f"{val:06b}"

def decode_6bit_string(bitstr, start, num):
    res = []
    for i in range(num):
        off = start + i * 6
        if off + 6 > len(bitstr): break
        val = int(bitstr[off:off+6], 2)
        if val < 32: res.append(chr(val + 64))
        else: res.append(chr(val))
    return "".join(res)

payload = ">02U6>0@4d@0"
bits = "".join([to_6_bit(c) for c in payload])
mmsi = int(bits[8:38], 2)
print(f"MMSI: {mmsi}")
text = decode_6bit_string(bits, 40, (len(bits)-40)//6)
print(f"Text: {text}")

payload2 = "H>@8uP058Rh" # Part of >H>@8uP058Rh
bits2 = "".join([to_6_bit(c) for c in payload2])
mmsi2 = int(bits2[8:38], 2)
print(f"MMSI2: {mmsi2}")
text2 = decode_6bit_string(bits2, 40, (len(bits2)-40)//6)
print(f"Text2: {text2}")

# Example from screenshot: "DAKD" - what bits did it come from?
# If Text was DAKD:
# D=4 (000100), A=1 (000001), K=11 (001011), D=4 (000100)
# Bits: 000100 000001 001011 000100
