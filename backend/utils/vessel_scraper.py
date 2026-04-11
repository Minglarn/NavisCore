"""Playwright based scraper for fetching vessel images, circumventing Cloudflare where possible."""
import os
import logging
import asyncio
from typing import Optional

try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
    from playwright_stealth import Stealth
    PLAYWRIGHT_AVAILABLE = True
except ImportError as e:
    print(f"Playwright Import-fel: {e}")
    PLAYWRIGHT_AVAILABLE = False


logger = logging.getLogger("NavisCore.Scraper")

class VesselScraper:
    def __init__(self, images_dir: str):
        self.images_dir = images_dir
        self.browser_context = None
        self.playwright = None

    async def _init_browser(self):
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright or playwright-stealth is not installed.")
        
        if not self.playwright:
            self.playwright = await async_playwright().start()
        
        # Determine if we should reuse context or create new. Reusing is highly favored for performance.
        if not self.browser_context:
            browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )
            self.browser_context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )

    async def close(self):
        """Clean up the browser resources."""
        if self.browser_context:
            await self.browser_context.close()
            self.browser_context = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

    async def fetch_image(self, mmsi: str) -> bool:
        """
        Attempts to find and download a photo for the given MMSI.
        Uses a sequential fallback mechanism.
        Returns True if successful, False otherwise.
        """
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Playwright not installed, skipping advanced scraping.")
            return False

        try:
            await self._init_browser()
        except Exception as e:
            logger.error(f"Failed to initialize Playwright browser: {e}")
            return False

        success = False
        try:
            # 1. MarineTraffic Full Profile fallback
            logger.info(f"[{mmsi}] Attempting MarineTraffic via Playwright...")
            success = await self._scrape_marinetraffic(mmsi)
            if success: 
                logger.info(f"[{mmsi}] Successfully fetched image from MarineTraffic")
                return True
            
            logger.info(f"[{mmsi}] MarineTraffic failed, trying VesselFinder...")
            
            # 2. VesselFinder fallback
            success = await self._scrape_vesselfinder(mmsi)
            if success: 
                logger.info(f"[{mmsi}] Successfully fetched image from VesselFinder")
                return True

            logger.warning(f"[{mmsi}] All Playwright scraping methods failed")
                
        except Exception as e:
            logger.error(f"Playwright scraper execution error for {mmsi}: {e}")
            
        return False

    async def _save_to_disk(self, img_url: str, mmsi: str, page) -> bool:
        try:
            if img_url.startswith('//'):
                img_url = "https:" + img_url
            
            body = await page.request.get(img_url, timeout=10000)
            if body.status == 200:
                data = await body.body()
                # A quick sanity check to avoid saving HTML as jpg
                if len(data) > 1000 and data[:2] == b'\xff\xd8': # JPEG magic numbers (rough check)
                    path = os.path.join(self.images_dir, f"{mmsi}.jpg")
                    with open(path, "wb") as f:
                        f.write(data)
                    logger.info(f"[{mmsi}] Image saved to disk ({len(data)} bytes)")
                    return True
        except Exception as e:
            logger.debug(f"Failed saving disk image for {mmsi}: {e}")
        return False

    async def _scrape_marinetraffic(self, mmsi: str) -> bool:
        # Instead of the heavy HTML page that gets blocked by CF, use the direct photo endpoint
        # which often serves cached images without strict Javascript challenges.
        img_url = f"https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi={mmsi}"
        
        try:
            logger.info(f"Trying direct MT photo endpoint for {mmsi}")
            # Use the stealth browser context to make the request, bypassing basic blocks
            req = await self.browser_context.request.get(img_url, timeout=15000)
            if req.status == 200:
                data = await req.body()
                # If image is larger than 1000 bytes, it's not a 1x1 blank pixel
                if len(data) > 1000 and data[:2] == b'\xff\xd8':
                    path = os.path.join(self.images_dir, f"{mmsi}.jpg")
                    with open(path, "wb") as f:
                        f.write(data)
                    return True
            return False
        except Exception as e:
            logger.debug(f"MT photo endpoint error: {e}")
            return False

    async def _scrape_vesselfinder(self, mmsi: str) -> bool:
        page = await self.browser_context.new_page()
        await Stealth().apply_stealth_async(page)
        try:
            logger.info(f"[{mmsi}] Navigating to VesselFinder search...")
            search_url = f"https://www.vesselfinder.com/vessels?name={mmsi}&mmsi={mmsi}"
            await page.goto(search_url, timeout=20000, wait_until="networkidle")
            
            # Check if it automatically redirected to the ship details page
            if '/vessels/details/' in page.url:
                try:
                    await page.wait_for_selector('.main-photo img, .vessel-photo img', timeout=5000)
                except PlaywrightTimeoutError:
                    pass
                img = page.locator('.main-photo img, .vessel-photo img')
                if await img.count() > 0:
                    src = await img.first.get_attribute("src")
                    if src:
                        return await self._save_to_disk(src, mmsi, page)
                return False

            # Otherwise, we are on the search results page
            try:
                await page.wait_for_selector('a.ship-link', timeout=5000)
            except PlaywrightTimeoutError:
                pass
                
            link = page.locator('a.ship-link')
            if await link.count() > 0:
                href = await link.first.get_attribute("href")
                if href:
                    await page.goto(f"https://www.vesselfinder.com{href}", timeout=15000, wait_until="networkidle")
                    
                    try:
                        await page.wait_for_selector('.main-photo img, .vessel-photo img', timeout=5000)
                    except PlaywrightTimeoutError:
                        pass
                        
                    img = page.locator('.main-photo img, .vessel-photo img')
                    if await img.count() > 0:
                        src = await img.first.get_attribute("src")
                        if src:
                            return await self._save_to_disk(src, mmsi, page)
            return False
        except Exception as e:
            logger.debug(f"VF error: {e}")
            return False
        finally:
            await page.close()

_global_scraper: Optional[VesselScraper] = None

def get_scraper(images_dir: str) -> VesselScraper:
    """Singleton getter for the scraper."""
    global _global_scraper
    if _global_scraper is None:
        _global_scraper = VesselScraper(images_dir)
    return _global_scraper
