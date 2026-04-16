"""
PyMuPDF Document Extractor  ─  extract_document.py
====================================================
Extracts ALL content from a PDF or image file:
  • Text blocks with font name, size, bold/italic flags, color, exact bbox
  • Vector drawings (lines, rects, curves) with fill & stroke colors
  • Embedded raster images with bbox
  • Font inventory
  • Annotations
  • For image inputs → OCR layer via pytesseract (word-level bbox + line grouping)

Output: one self-contained JSON file ready for document re-creation / editing.

Usage:
    python extract_document.py input.pdf
    python extract_document.py input.jpg            ← auto OCR
    python extract_document.py input.jpg out.json   ← custom output name

Dependencies:
    pip install pymupdf pytesseract Pillow
    Linux: apt-get install -y tesseract-ocr
"""

import json, sys, os
import fitz  # PyMuPDF

try:
    import pytesseract
    from PIL import Image as PILImage
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


# ── Colour helpers ─────────────────────────────────────────────────────────────

def rgb_to_hex(color):
    if color is None:
        return None
    if isinstance(color, (int, float)):
        v = max(0, min(255, int(color * 255)))
        return "#{0:02x}{0:02x}{0:02x}".format(v)
    if isinstance(color, (tuple, list)):
        if len(color) == 3:
            r, g, b = [max(0, min(255, int(c * 255))) for c in color]
            return "#{:02x}{:02x}{:02x}".format(r, g, b)
        if len(color) == 4:                           # CMYK
            c, m, y, k = color
            r = max(0, min(255, int(255 * (1-c) * (1-k))))
            g = max(0, min(255, int(255 * (1-m) * (1-k))))
            b = max(0, min(255, int(255 * (1-y) * (1-k))))
            return "#{:02x}{:02x}{:02x}".format(r, g, b)
    return str(color)


# ── Geometry helpers ───────────────────────────────────────────────────────────

def R(rect):
    r = fitz.Rect(rect)
    return {"x0":round(r.x0,2),"y0":round(r.y0,2),
            "x1":round(r.x1,2),"y1":round(r.y1,2),
            "w":round(r.width,2),"h":round(r.height,2)}

def P(p):
    return {"x":round(p.x,2),"y":round(p.y,2)}


# ── Image → PDF ────────────────────────────────────────────────────────────────

def image_to_pdf(path):
    tmp = fitz.open(path)
    pdf_bytes = tmp.convert_to_pdf()
    tmp.close()
    return fitz.open("pdf", pdf_bytes)


# ── Text blocks ────────────────────────────────────────────────────────────────

def extract_text_blocks(page):
    raw = page.get_text("rawdict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    blocks = []
    for blk in raw.get("blocks", []):
        if blk.get("type") != 0:
            continue
        b = {"block_no": blk.get("number"), "bbox": R(blk["bbox"]), "lines": []}
        for ln in blk.get("lines", []):
            line = {"bbox": R(ln["bbox"]), "direction": list(ln.get("dir",(1,0))), "spans": []}
            for sp in ln.get("spans", []):
                fl = sp.get("flags", 0)
                line["spans"].append({
                    "text":       sp.get("text",""),
                    "bbox":       R(sp["bbox"]),
                    "origin":     {"x":round(sp.get("origin",(0,0))[0],2),
                                   "y":round(sp.get("origin",(0,0))[1],2)},
                    "font": {
                        "name":      sp.get("font",""),
                        "size":      round(sp.get("size",0),3),
                        "flags_raw": fl,
                        "bold":      bool(fl & 16),
                        "italic":    bool(fl & 2),
                        "monospace": bool(fl & 8),
                        "serif":     bool(fl & 32),
                        "superscript": bool(fl & 1),
                    },
                    "color_hex": rgb_to_hex(sp.get("color")),
                    "color_raw": sp.get("color"),
                    "ascender":  round(sp.get("ascender",0),4),
                    "descender": round(sp.get("descender",0),4),
                })
            b["lines"].append(line)
        blocks.append(b)
    return blocks


# ── Drawings ───────────────────────────────────────────────────────────────────

def extract_drawings(page):
    out = []
    for path in page.get_drawings():
        d = {
            "path_type":      path.get("type"),
            "bbox":           R(path["rect"]),
            "fill_color":     rgb_to_hex(path.get("fill")),
            "stroke_color":   rgb_to_hex(path.get("color")),
            "line_width":     round(path.get("width",0),3),
            "fill_opacity":   path.get("fill_opacity"),
            "stroke_opacity": path.get("stroke_opacity"),
            "close_path":     path.get("closePath",False),
            "even_odd":       path.get("even_odd",False),
            "dashes":         path.get("dashes",""),
            "line_cap":       list(path.get("lineCap",(0,0,0))),
            "line_join":      path.get("lineJoin",0),
            "items": [],
        }
        for item in path.get("items",[]):
            k = item[0]
            if k == "l":
                d["items"].append({"kind":"line","from":P(item[1]),"to":P(item[2])})
            elif k == "re":
                d["items"].append({"kind":"rect","rect":R(item[1])})
            elif k == "c":
                d["items"].append({"kind":"curve",
                    "p1":P(item[1]),"p2":P(item[2]),"p3":P(item[3]),"p4":P(item[4])})
            elif k == "qu":
                q = item[1]
                d["items"].append({"kind":"quad",
                    "ul":P(q.ul),"ur":P(q.ur),"ll":P(q.ll),"lr":P(q.lr)})
        out.append(d)
    return out


# ── Embedded images ────────────────────────────────────────────────────────────

def extract_images(page, doc):
    out = []
    for img_info in page.get_images(full=True):
        xref = img_info[0]
        try:
            m = doc.extract_image(xref)
            rects = page.get_image_rects(xref)
            out.append({
                "xref":xref, "bbox":R(rects[0]) if rects else None,
                "width_px":m.get("width"), "height_px":m.get("height"),
                "colorspace":m.get("colorspace"), "bpc":m.get("bpc"),
                "ext":m.get("ext"),
            })
        except Exception as e:
            out.append({"xref":xref,"error":str(e)})
    return out


# ── Fonts ──────────────────────────────────────────────────────────────────────

def extract_fonts(page):
    return [{"xref":f[0],"ext":f[1],"type":f[2],"name":f[3],"encoding":f[4]}
            for f in page.get_fonts(full=True)]


# ── Annotations ────────────────────────────────────────────────────────────────

def extract_annotations(page):
    out = []
    for a in page.annots():
        out.append({
            "type":a.type[1],"bbox":R(a.rect),
            "content":a.info.get("content",""),"author":a.info.get("title",""),
            "flags":a.flags,
            "colors":{"stroke":rgb_to_hex(a.colors.get("stroke")),
                      "fill":  rgb_to_hex(a.colors.get("fill"))},
        })
    return out


# ── OCR layer (image-based files only) ────────────────────────────────────────

def extract_ocr(image_path):
    if not HAS_OCR:
        return {"error": "pytesseract not installed"}
    img = PILImage.open(image_path)
    iw, ih = img.size
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

    words = []
    for i in range(len(data["text"])):
        txt = data["text"][i].strip()
        if not txt:
            continue
        conf_raw = data["conf"][i]
        conf = int(conf_raw) if str(conf_raw).lstrip("-").isdigit() else -1
        words.append({
            "text": txt, "confidence": conf,
            "block_num": data["block_num"][i],
            "par_num":   data["par_num"][i],
            "line_num":  data["line_num"][i],
            "word_num":  data["word_num"][i],
            "bbox": {
                "x0": data["left"][i],
                "y0": data["top"][i],
                "x1": data["left"][i] + data["width"][i],
                "y1": data["top"][i]  + data["height"][i],
                "w":  data["width"][i],
                "h":  data["height"][i],
            },
        })

    # Group words into lines
    lines_map = {}
    for w in words:
        key = (w["block_num"], w["par_num"], w["line_num"])
        lines_map.setdefault(key, []).append(w)

    ocr_lines = []
    for key in sorted(lines_map):
        ws = lines_map[key]
        line_text = " ".join(w["text"] for w in ws)
        xs = [w["bbox"]["x0"] for w in ws] + [w["bbox"]["x1"] for w in ws]
        ys = [w["bbox"]["y0"] for w in ws] + [w["bbox"]["y1"] for w in ws]
        ocr_lines.append({
            "text": line_text,
            "bbox": {"x0":min(xs),"y0":min(ys),"x1":max(xs),"y1":max(ys),
                     "w":max(xs)-min(xs),"h":max(ys)-min(ys)},
            "block_num": key[0], "par_num": key[1], "line_num": key[2],
            "words": ws,
        })

    return {
        "image_size": {"width": iw, "height": ih},
        "word_count": len(words),
        "line_count": len(ocr_lines),
        "lines": ocr_lines,
    }


# ── Main ───────────────────────────────────────────────────────────────────────

IMAGE_EXTS = {".jpg",".jpeg",".png",".bmp",".gif",".tiff",".tif",".webp"}

def extract_document(input_path):
    ext = os.path.splitext(input_path)[1].lower()
    is_image = ext in IMAGE_EXTS

    print(f"[+] Opening: {input_path}  (type={'image' if is_image else 'pdf'})")
    doc = image_to_pdf(input_path) if is_image else fitz.open(input_path)
    meta = doc.metadata or {}

    result = {
        "_info": {
            "extractor":   "extract_document.py  v2  (PyMuPDF + pytesseract)",
            "source_file": os.path.basename(input_path),
            "source_type": "image" if is_image else "pdf",
            "page_count":  doc.page_count,
            "units":       "points (1pt = 1/72 inch); for mm multiply by 25.4/72",
            "coord_origin":"top-left of page",
        },
        "metadata": {k: meta.get(v,"") for k,v in [
            ("title","title"),("author","author"),("subject","subject"),
            ("creator","creator"),("producer","producer"),
            ("created","creationDate"),("modified","modDate"),
        ]},
        "pages": [],
    }

    for idx in range(doc.page_count):
        page = doc[idx]
        r = page.rect
        print(f"    Page {idx+1}  {r.width:.0f}x{r.height:.0f} pt")

        pg = {
            "page_number": idx+1,
            "size_pt":  {"w":round(r.width,2),"h":round(r.height,2)},
            "size_mm":  {"w":round(r.width*25.4/72,2),"h":round(r.height*25.4/72,2)},
            "rotation": page.rotation,
            "fonts":        extract_fonts(page),
            "text_blocks":  extract_text_blocks(page),
            "drawings":     extract_drawings(page),
            "images":       extract_images(page, doc),
            "annotations":  extract_annotations(page),
        }

        if is_image:
            print("    Running OCR…")
            pg["ocr"] = extract_ocr(input_path)

        result["pages"].append(pg)

    doc.close()
    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_document.py <input.pdf|img> [output.json]")
        sys.exit(1)
    input_path = sys.argv[1]
    if not os.path.exists(input_path):
        print(f"Error: not found — {input_path}"); sys.exit(1)
    output_path = sys.argv[2] if len(sys.argv) >= 3 else \
        os.path.splitext(os.path.basename(input_path))[0] + "_extracted.json"

    data = extract_document(input_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    pg = data["pages"][0] if data["pages"] else {}
    ocr = pg.get("ocr", {})
    print(f"\n✅  Saved → {output_path}")
    print(f"   Pages:       {data['_info']['page_count']}")
    print(f"   Text blocks: {len(pg.get('text_blocks',[]))}")
    print(f"   Drawings:    {len(pg.get('drawings',[]))}")
    print(f"   Images:      {len(pg.get('images',[]))}")
    print(f"   Fonts:       {len(pg.get('fonts',[]))}")
    if ocr:
        print(f"   OCR words:   {ocr.get('word_count','n/a')}")
        print(f"   OCR lines:   {ocr.get('line_count','n/a')}")

if __name__ == "__main__":
    main()