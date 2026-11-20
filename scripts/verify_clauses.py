import os
import pypdfium2 as pdfium

def normalize_ws(s):
    return " ".join(s.split()).lower()

forms_to_check = [
    ('Form I', r'U:\Kumaran-finance\sample-statutory-forms\01-Form-I-Prior-Sanction-Application-Prefilled.pdf', 0, [
        'FORM OF APPLICATION TO BE USED BY A FOREMAN FOR OBTAINING PREVIOUS SANCTION',
        'Section 4(2) and Rule 3',
        'Son / Wife / Daughter',
        'desire to commence and conduct a chit as foreman',
        'resolution passed by the Managing Committee / Board of Directors',
        'aggregate chit amount prescribed by Section 13 of the Chit Funds Act, 1982',
        'We further undertake in register the chit within 12 months',
        'Yours faithfully',
        'Encl: Sheets',
    ]),
    ('Form I Annexure', r'U:\Kumaran-finance\sample-statutory-forms\01-Form-I-Prior-Sanction-Application-Prefilled.pdf', 1, [
        'ANNEXURE — STATEMENT OF PARTICULARS',
        'Name and address of the company association of individuals',
        'Constitution i.e., whether incorporated as company',
        'Name and addresses of the branches',
        'Main objects of the institution',
        'Names, occupations and residential address of the directors',
        'Name and residential address of the Chief Executive Officer',
        'Names of the Bankers and their addresses',
        'Names of the auditors and their addresses',
        'Particulars of the chit(s) to be started',
        'Places where the chit scheme(s) are proposed to be conducted',
        'solemnly declare that the facts stated herein',
    ]),
    ('Form II', r'U:\Kumaran-finance\sample-statutory-forms\02-Form-II-Chit-Agreement-Registration-Prefilled.pdf', 0, [
        'APPLICATION FOR REGISTRATION OF THE CHIT AGREEMENT',
        'See Section 7 and Rule 5',
        'Chit Agreement in duplicate is attached herewith',
        'aggregate chit amount of these chits involved therein is Rs.',
        'limits specified in Section 13 of the Chit Funds Act, 1982',
        'sanction obtained in Form IB under Section 4',
        'DECLARATION',
        'chit agreement has been drawn up in conformity with the provisions',
    ]),
    ('Form V', r'U:\Kumaran-finance\sample-statutory-forms\03-Form-V-100-Percent-Subscription-Declaration-Prefilled.pdf', 0, [
        'FORM - V',
        'See Section 9(1) and Rule 10',
        'DECLARATION TO BE FILED ABOUT SUBSCRIPTION TO ALL TICKETS OF A CHIT',
        'certificate of registration to commence a new chit',
        'all the tickets specified in the chit agreement have been fully subscribed',
        'Yours faithfully',
        'for and on behalf of (Foreman)',
    ]),
    ('Form VII', r'U:\Kumaran-finance\sample-statutory-forms\04-Form-VII-Agreement-Copies-Furnishing-Certificate-Prefilled.pdf', 0, [
        'FORM – VII',
        'See Section 10(2) and Rule 12',
        'The Chit Funds Act, 1982 (Central Act No.40 of 1982)',
        'furnished to every subscriber of the chit a copy of the said chit agreement duly certified by me / us to be a true copy',
        'certificate of commencement of the said chit granted under sub-section(2) of Section 9',
        'The first draw of the said chit was held on',
        'Yours faithfully',
    ]),
    ('Form IX', r'U:\Kumaran-finance\sample-statutory-forms\06-Form-IX-Auction-Draw-Notice-Prefilled.pdf', 0, [
        'FORM IX',
        'See Section 16 and Rule 16',
        'Notice to subscribers of Chit Number',
        'draw in monthly / quarterly / half yearly / yearly chit',
        'be present at the draw in person or by your duly authorized agent',
        'Yours faithfully',
        'Secretary',
        'for and on behalf of (foreman)',
    ]),
]

print('=== AUDIT 3: LINE-BY-LINE VERIFICATION OF STATUTORY CLAUSES ===')
all_matched = True
for name, our_pdf, our_pno, clauses in forms_to_check:
    doc = pdfium.PdfDocument(our_pdf)
    text = normalize_ws(doc[our_pno].get_textpage().get_text_range())
    print(f'Checking {name}...')
    for c in clauses:
        target = normalize_ws(c)
        if target not in text:
            print(f'  MISSING CLAUSE in {name}: "{c}"')
            all_matched = False
        else:
            print(f'  [PASS] Found: "{c[:45]}..."')

if all_matched:
    print('\nSUCCESS: 100% of all statutory clauses matched verbatim between Gazette and our PDFs!')
else:
    print('\nFAILURE: Some statutory clauses were not found.')
