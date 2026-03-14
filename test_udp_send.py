import socket
import time

# Giltigt AIS NMEA-paket (Type 1 Position Report)
# !AIVDM,1,1,,A,13u9P80000P8p@2N8D6DP0bP0000,0*33
msg = b"!AIVDM,1,1,,A,13u9P80000P8p@2N8D6DP0bP0000,0*33"
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Vi skickar till localhost på port 10110 som är mappad till naviscore_app i docker-compose
try:
    sock.sendto(msg, ("127.0.0.1", 10110))
    print("Skickat test-paket till 127.0.0.1:10110")
except Exception as e:
    print(f"Kunde inte skicka UDP-paket: {e}")
