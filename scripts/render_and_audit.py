import os
import glob
import pypdfium2 as pdfium
from PIL import Image

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PDF_DIR = os.path.join(REPO_ROOT, 'sample-statutory-forms')
SCREENSHOT_DIR = os.path.join(PDF_DIR, 'screenshots')
ARTIFACT_SCREENSHOT_DIR = r'C:\Users\kathi\.gemini\antigravity\brain\9e8e97f7-e144-46b1-bd2e-0e01e20f470b\sample-statutory-forms\screenshots'

os.makedirs(SCREENSHOT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_SCREENSHOT_DIR, exist_ok=True)

def render_and_audit():
    pdf_files = sorted(glob.glob(os.path.join(PDF_DIR, '*.pdf')))
    print(f"Found {len(pdf_files)} PDF files to render and audit.\n")
    
    results = []
    
    for pdf_path in pdf_files:
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        pdf = pdfium.PdfDocument(pdf_path)
        num_pages = len(pdf)
        
        for i in range(num_pages):
            page = pdf[i]
            # Render at scale 2.0 (approx 144 DPI)
            pil_image = page.render(scale=2.0).to_pil()
            
            shot_name = f"{base_name}-page{i+1}.png"
            shot_path = os.path.join(SCREENSHOT_DIR, shot_name)
            artifact_shot_path = os.path.join(ARTIFACT_SCREENSHOT_DIR, shot_name)
            
            pil_image.save(shot_path)
            pil_image.save(artifact_shot_path)
            
            # Analyze bounding box
            gray = pil_image.convert('L')
            bw = gray.point(lambda p: 255 if p < 245 else 0)
            bbox = bw.getbbox()
            
            w, h = pil_image.size
            if bbox:
                top_y, bot_y = bbox[1], bbox[3]
                bottom_gap = h - bot_y
                gap_pct = (bottom_gap / h) * 100.0
                used_pct = (bot_y / h) * 100.0
            else:
                top_y, bot_y = 0, 0
                bottom_gap = h
                gap_pct = 100.0
                used_pct = 0.0
                
            passed = gap_pct < 25.0
            results.append({
                'name': shot_name,
                'height': h,
                'bot_y': bot_y,
                'gap': bottom_gap,
                'gap_pct': gap_pct,
                'used_pct': used_pct,
                'passed': passed
            })

    print(f"{'Screenshot Name':<68} | {'Bot Y':<10} | {'Gap %':<8} | {'Used %':<8} | {'Status'}")
    print("-" * 105)
    fail_count = 0
    for r in results:
        status = "PASS (<25% gap)" if r['passed'] else "FAIL (>=25% gap)"
        if not r['passed']:
            fail_count += 1
        print(f"{r['name']:<68} | {r['bot_y']:>4}/{r['height']:<4}  | {r['gap_pct']:>5.1f}%  | {r['used_pct']:>5.1f}%  | {status}")
        
    print("-" * 105)
    print(f"Total Pages: {len(results)} | Passed: {len(results) - fail_count} | Failed: {fail_count}\n")

if __name__ == '__main__':
    render_and_audit()
