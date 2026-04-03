"""Image utility functions."""
import os
import base64
import logging

logger = logging.getLogger("NavisCore")


def get_image_bytes(images_dir: str, mmsi: str) -> bytes:
    """Read image file and return its raw binary content."""
    try:
        image_path = os.path.join(images_dir, f"{mmsi}.jpg")
        if not os.path.exists(image_path):
            image_path = os.path.join(images_dir, "0.jpg")
        if os.path.exists(image_path):
            with open(image_path, "rb") as f:
                return f.read()
    except Exception as e:
        logger.error(f"Error reading image bytes for {mmsi}: {e}")
    return None


def get_image_base64(images_dir: str, mmsi: str) -> str:
    """Read image file and return its base64 encoded content."""
    img_bytes = get_image_bytes(images_dir, mmsi)
    if img_bytes:
        return base64.b64encode(img_bytes).decode('utf-8')
    return None
