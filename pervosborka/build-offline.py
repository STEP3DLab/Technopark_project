from pathlib import Path
import re,base64
root=Path(__file__).resolve().parent
dist=root/'dist'
html=(dist/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<link rel="icon"[^>]+>','',html)
styles=re.findall(r'<link rel="stylesheet" href="([^"]+)">',html)
scripts=re.findall(r'<script defer src="([^"]+)"></script>',html)
for name in styles:
    html=html.replace(f'<link rel="stylesheet" href="{name}">','<style>\n'+(dist/name).read_text(encoding='utf-8')+'\n</style>')
for name in scripts:
    html=html.replace(f'<script defer src="{name}"></script>','')
script_content='\n'.join('<script>\n'+(dist/name).read_text(encoding='utf-8').replace('</script','<\\/script')+'\n</script>' for name in scripts)
html=html.replace('</body>',script_content+'\n</body>')
for path in (dist/'assets').glob('*.webp'):
    html=html.replace('assets/'+path.name,'data:image/webp;base64,'+base64.b64encode(path.read_bytes()).decode('ascii'))
out=dist/'pervosborka-offline.html'
out.write_text(html,encoding='utf-8')
# Existing bookmarks remain useful, while the portable deliverable has the new name.
(dist/'vector-offline.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=pervosborka-offline.html"><title>ПЕРВОСБОРКА</title><a href="pervosborka-offline.html">Открыть ПЕРВОСБОРКУ</a></html>\n',encoding='utf-8')
print(f'Autonomous application: {out} ({out.stat().st_size} bytes)')
