# Illustrated CAD guide, 24 November 2026

The mechanical model remains V01. The published guide uses the university blue
palette (`#082567`) and renders the actual meshes from `files/assembly.glb`.
No concept image replaces manufacturing geometry.

`files/assembly-studio.glb` contains the same 22 meshes with PBR materials.
`files/assembly-view.json` is the same geometry for the Canvas fallback on devices
without WebGL. The first view is a static 1800 × 1500 CAD render. A viewer failure
does not hide the illustrations or disable any download.

## Reproduce the release

From the repository root, with Python, Pillow, trimesh and Blender 4.3 installed:

```sh
python wrist-orthosis/source/prepare_visuals.py
cp wrist-orthosis/source/meshes.json wrist-orthosis/files/assembly-view.json
blender -b -t 8 --python wrist-orthosis/source/render_cad.py -- --eevee
python wrist-orthosis/source/make_site.py
python wrist-orthosis/source/package_release.py
python wrist-orthosis/source/verify_release.py
```

PNG files and the intermediate mesh JSON are reproducible intermediates; the
optimized WebP images, font files, viewers and vendor dependencies are committed.
The site has no runtime dependency on a CDN. The complete illustrated manual and
all file links remain usable when JavaScript is disabled. Six assembly stages
become a stepper when JavaScript is available.

The CAD model is for a bench demonstrator. Physical fits, strength, servo mounting
dimensions and safety functions require bench validation. The geometry report
states the scope of the sampled gear-section check explicitly.
