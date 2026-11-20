"""Archive only the current fabrication deliverables for a PCB fabricator."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

p=Path(__file__).resolve().parents[1]
with ZipFile(p/'LM04B-fabrication.zip','w',ZIP_DEFLATED,compresslevel=9) as z:
    for file in sorted((p/'gerbers').iterdir()):
        if file.is_file():
            z.write(file,file.name)
    z.write(p/'manufacturing.txt','README.txt')
