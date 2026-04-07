
def validate_post_for_platform(platform, media_assets):
    if platform == "youtube":
        if len(media_assets) != 1 or media_assets[0].get("type") != "video":
            raise Exception("Validation failed: YouTube requires exactly one video.")
    elif platform == "facebook":
        if len(media_assets) > 1:
            raise Exception("Validation failed: Facebook does not support multiple media assets.")
        if media_assets[0].get("type") != "image" and media_assets[0].get("type") != "video":
            raise Exception("Validation failed: Facebook requires at least one image or video.")
