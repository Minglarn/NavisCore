import sys
import asyncio
import os
import logging

# Ensure logging is routed to console
logging.basicConfig(level=logging.INFO)

# Import scraper and config
from config import IMAGES_DIR
from utils.vessel_scraper import get_scraper

async def main():
    if len(sys.argv) < 2:
        print("Användning: python fetch_image.py <MMSI>")
        sys.exit(1)
        
    mmsi = sys.argv[1].strip()
    
    if not mmsi.isdigit() or len(mmsi) != 9:
        print(f"Varning: {mmsi} verkar inte vara ett giltigt 9-siffrigt MMSI.")
        
    print(f"SEARCH: Børjar automatiskt skrapa bild før MMSI: {mmsi} via Playwright Stealth...")
    os.makedirs(IMAGES_DIR, exist_ok=True)
    
    scraper = get_scraper(IMAGES_DIR)
    
    try:
        success = await scraper.fetch_image(mmsi)
        
        if success:
            path = os.path.join(IMAGES_DIR, f"{mmsi}.jpg")
            print(f"\nSUCCESS: Bild hittades! Nedladdning sparad till: {path}")
        else:
            print(f"\nFAILED: Kunde tyvrr inte hitta ngon bild via Playwright fr {mmsi}.")
            
    except Exception as e:
        print(f"\nERROR: Ett ovntat fel intrffade: {e}")
        
    finally:
        # Viktigt att stänga webbläsaren!
        print("Stänger webbläsar-sessionen...")
        await scraper.close()

if __name__ == "__main__":
    asyncio.run(main())
