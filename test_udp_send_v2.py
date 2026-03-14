import socket
import time

msg = b"!AIVDM,1,1,,A,13u9P80000P8p@2N8D6DP0bP0000,0*33"
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

print("Skickar 5 test-paket...")
for i in range(5):
    try:
        sock.sendto(msg, ("127.0.0.1", 10110))
        print(f"Paket {i+1} skickat.")
        time.sleep(1)
    except Exception as e:
        print(f"Fel vid sändning: {e}")
