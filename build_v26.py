from pathlib import Path
import zipfile, hashlib, shutil, json
root=Path('/mnt/data/dw_v260_rejoin')
source=Path('/mnt/data/Doodle-Wheels-V25.9-Anti-Incastri-e-Collaudo-GitHub-Pages.zip')
target=Path('/mnt/data/Doodle-Wheels-V26-Rientro-Rapido-GitHub-Pages.zip')
override={
 'index.html','style.css','README.md','js/peer.js','js/game.js','js/i18n.js','js/physics.js',
}
new={
 'NOVITA-V26.txt',
 'tests/rejoin-peer-integration.cjs',
 'tests/rejoin-game-browser.py',
}
with zipfile.ZipFile(source,'r') as src, zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as dst:
 seen=set()
 for file in src.infolist():
  if file.is_dir():continue
  name=file.filename
  assert name not in seen,name
  seen.add(name)
  content=(root/name).read_bytes() if name in override else src.read(name)
  dst.writestr(name,content,compress_type=zipfile.ZIP_DEFLATED)
 for name in sorted(new):
  assert name not in seen,name
  dst.write(root/name,arcname=name)
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 names=set(z.namelist())
 assert {'index.html','js/peer.js','js/game.js','js/physics.js','NOVITA-V26.txt'}<=names
 assert all(b'20261113-v26-rejoin' in z.read('index.html') for _ in [0])
 assert b'btn-rejoin' in z.read('index.html')
 assert b'superseded' in z.read('js/peer.js')
 print(json.dumps({'name':target.name,'bytes':target.stat().st_size,'files':len(names),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'zip_ok':True},indent=2))
preview=Path('/mnt/data/Doodle-Wheels-V26-Rientro-Mobile-Preview.png')
shutil.copyfile(root/'tests/rejoin-ui-390.png',preview)
print('preview',preview,preview.stat().st_size)
