import os
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PDF_DIR = os.path.join(REPO_ROOT, 'sample-statutory-forms')
GAZETTE_REF_DIR = os.path.join(PDF_DIR, 'gazette-references')
COMPARISONS_DIR = os.path.join(PDF_DIR, 'comparisons')
ARTIFACT_DIR = r'C:\Users\kathi\.gemini\antigravity\brain\9e8e97f7-e144-46b1-bd2e-0e01e20f470b\sample-statutory-forms'
ARTIFACT_COMP_DIR = os.path.join(ARTIFACT_DIR, 'comparisons')

os.makedirs(GAZETTE_REF_DIR, exist_ok=True)
os.makedirs(COMPARISONS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_COMP_DIR, exist_ok=True)

GAZETTE_PDF_PATH = r'C:\Users\kathi\.gemini\antigravity\brain\9e8e97f7-e144-46b1-bd2e-0e01e20f470b\.user_uploaded\media_1795272420748_f5598ec0.pdf'

# Mapping of Form and Page to Gazette Page (1-indexed)
FORM_MAPPING = [
    # Form I: 4 Pages
    ('Form-I-p1', '01-Form-I-Prior-Sanction-Application', 1, 43, 'Form I: Previous Sanction Application (Sec 4(2) & Rule 3)'),
    ('Form-I-p2', '01-Form-I-Prior-Sanction-Application', 2, 44, 'Form I: Application Paras 4-6 & Signatures'),
    ('Form-I-p3', '01-Form-I-Prior-Sanction-Application', 3, 45, 'Form I Annexure: Statement of Particulars (Items 1-7)'),
    ('Form-I-p4', '01-Form-I-Prior-Sanction-Application', 4, 46, 'Form I Annexure: Items 8-12, Solemn Declaration & Footnotes'),

    # Form II: 2 Pages
    ('Form-II-p1', '02-Form-II-Chit-Agreement-Registration', 1, 49, 'Form II: Chit Agreement Registration Application (Sec 7 & Rule 5)'),
    ('Form-II-p2', '02-Form-II-Chit-Agreement-Registration', 2, 50, 'Form II: Declaration, Signatures & Footnotes'),

    # Form V: 1 Page
    ('Form-V-p1', '03-Form-V-100-Percent-Subscription-Declaration', 1, 55, 'Form V: 100% Subscription Declaration (Sec 9(1) & Rule 10)'),

    # Form VII: 1 Page
    ('Form-VII-p1', '04-Form-VII-Agreement-Copies-Furnishing-Certificate', 1, 57, 'Form VII: Chit Agreement Copies Furnished Certificate (Sec 10(2) & Rule 12)'),

    # Form VIII: 8 Pages
    ('Form-VIII-p1', '05-Form-VIII-Chit-Agreement-Articles', 1, 58, 'Form VIII: Chit Agreement Articles I-III (Sec 6 & Rule 13)'),
    ('Form-VIII-p2', '05-Form-VIII-Chit-Agreement-Articles', 2, 59, 'Form VIII: Articles IV-V (Security & Chit Details)'),
    ('Form-VIII-p3', '05-Form-VIII-Chit-Agreement-Articles', 3, 60, 'Form VIII: Article VI (Draw & Auction Procedures)'),
    ('Form-VIII-p4', '05-Form-VIII-Chit-Agreement-Articles', 4, 61, 'Form VIII: Articles VII-VIII (Prize Disbursement & Default)'),
    ('Form-VIII-p5', '05-Form-VIII-Chit-Agreement-Articles', 5, 62, 'Form VIII: Articles IX-XII (Foreman Rights & Transfers)'),
    ('Form-VIII-p6', '05-Form-VIII-Chit-Agreement-Articles', 6, 63, 'Form VIII: Articles XIII-XV (Books, Inspection & Balance Sheet)'),
    ('Form-VIII-p7', '05-Form-VIII-Chit-Agreement-Articles', 7, 64, 'Form VIII: Articles XVI-XXI (Bank Accounts, Termination & Arbitration)'),
    ('Form-VIII-p8', '05-Form-VIII-Chit-Agreement-Articles', 8, 65, 'Form VIII: Articles XXII-XXIII & 20-Subscriber Roster Table'),

    # Form IX: 1 Page
    ('Form-IX-p1', '06-Form-IX-Auction-Draw-Notice', 1, 66, 'Form IX: Notice to Subscribers of Chit Draw (Sec 16 & Rule 16)'),
]

def main():
    print(f"Loading Gazette PDF from {GAZETTE_PDF_PATH}...")
    gazette_pdf = pdfium.PdfDocument(GAZETTE_PDF_PATH)
    
    print(f"Total mappings to compare: {len(FORM_MAPPING)}\n")

    summary_rows = []

    for key, pdf_base, page_num, gazette_page, title in FORM_MAPPING:
        # Render Gazette Page
        gaz_page_obj = gazette_pdf[gazette_page - 1]
        gaz_img = gaz_page_obj.render(scale=2.0).to_pil()
        gaz_ref_filename = f"Gazette-p{gazette_page}-{key}.png"
        gaz_ref_path = os.path.join(GAZETTE_REF_DIR, gaz_ref_filename)
        gaz_img.save(gaz_ref_path)

        # Render Blank Form Page
        blank_pdf_path = os.path.join(PDF_DIR, f"{pdf_base}-Blank.pdf")
        blank_pdf = pdfium.PdfDocument(blank_pdf_path)
        blank_img = blank_pdf[page_num - 1].render(scale=2.0).to_pil()

        # Render Prefilled Form Page
        prefill_pdf_path = os.path.join(PDF_DIR, f"{pdf_base}-Prefilled.pdf")
        prefill_pdf = pdfium.PdfDocument(prefill_pdf_path)
        prefill_img = prefill_pdf[page_num - 1].render(scale=2.0).to_pil()

        # Standardize heights for side-by-side composite
        target_h = 1684
        def resize_to_h(im, h):
            w = int(im.width * (h / im.height))
            return im.resize((w, h), Image.Resampling.LANCZOS)

        gaz_resized = resize_to_h(gaz_img, target_h)
        blank_resized = resize_to_h(blank_img, target_h)
        prefill_resized = resize_to_h(prefill_img, target_h)

        header_h = 80
        total_w = gaz_resized.width + blank_resized.width + prefill_resized.width + 40
        comp_img = Image.new('RGB', (total_w, target_h + header_h + 30), color=(245, 247, 250))
        draw = ImageDraw.Draw(comp_img)

        # Header Banner
        draw.rectangle([0, 0, total_w, header_h], fill=(24, 43, 73))
        # Draw column headers
        col1_x = 10
        col2_x = col1_x + gaz_resized.width + 10
        col3_x = col2_x + blank_resized.width + 10

        comp_img.paste(gaz_resized, (col1_x, header_h + 15))
        comp_img.paste(blank_resized, (col2_x, header_h + 15))
        comp_img.paste(prefill_resized, (col3_x, header_h + 15))

        # Borders
        draw.rectangle([col1_x - 1, header_h + 14, col1_x + gaz_resized.width, header_h + 15 + target_h], outline=(180, 180, 180), width=1)
        draw.rectangle([col2_x - 1, header_h + 14, col2_x + blank_resized.width, header_h + 15 + target_h], outline=(180, 180, 180), width=1)
        draw.rectangle([col3_x - 1, header_h + 14, col3_x + prefill_resized.width, header_h + 15 + target_h], outline=(180, 180, 180), width=1)

        # Save composite
        comp_filename = f"Comparison-{key}.png"
        comp_path = os.path.join(COMPARISONS_DIR, comp_filename)
        artifact_comp_path = os.path.join(ARTIFACT_COMP_DIR, comp_filename)
        comp_img.save(comp_path)
        comp_img.save(artifact_comp_path)

        print(f"Generated comparison: {comp_filename} (Gazette p.{gazette_page} vs Generated Page {page_num})")
        summary_rows.append((key, gazette_page, page_num, title, comp_filename))

    print(f"\nAll {len(summary_rows)} comparison composites generated successfully!")

if __name__ == '__main__':
    main()
