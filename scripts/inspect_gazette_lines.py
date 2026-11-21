import pypdfium2 as pdfium

pdf_path = r'C:\Users\kathi\.gemini\antigravity\brain\9e8e97f7-e144-46b1-bd2e-0e01e20f470b\.user_uploaded\media_1795272420748_f5598ec0.pdf'
pdf = pdfium.PdfDocument(pdf_path)

def examine_lines(p_idx, label):
    page = pdf[p_idx]
    w, h = page.get_size()
    textpage = page.get_textpage()
    paths = [obj for obj in page.get_objects() if obj.type == pdfium.raw.FPDF_PAGEOBJ_PATH]
    print(f'=== {label} (Gazette p.{p_idx+1}) ===')
    for p in paths:
        bounds = p.get_bounds()
        pw = bounds[2] - bounds[0]
        ph = bounds[3] - bounds[1]
        if pw > 15 and ph < 5:
            y_center = (bounds[1] + bounds[3]) / 2
            chars = []
            for ci in range(textpage.count_chars()):
                cb = textpage.get_charbox(ci)
                if abs(cb[1] - y_center) < 15:
                    chars.append((cb[0], textpage.get_text_range(ci, 1)))
            chars.sort(key=lambda x: x[0])
            line_text = ''.join(c[1] for c in chars).strip()
            print(f'  Line at y={y_center:.1f}, width={pw:.1f}: nearby text -> "{line_text}"')

for label, p_idx in [
    ('Form I p1', 42),
    ('Form I p2', 43),
    ('Form I p4', 45),
    ('Form II p1', 48),
    ('Form II p2', 49),
    ('Form V', 54),
    ('Form VII', 56),
    ('Form VIII p3', 59),
    ('Form IX', 65),
]:
    examine_lines(p_idx, label)
