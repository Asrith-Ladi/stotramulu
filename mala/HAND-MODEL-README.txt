DROP YOUR HAND MODEL HERE
=========================

Place a rigged RIGHT-hand model named exactly:

    hand.glb

…in this folder (public/). It will load automatically. Until it exists, the app
falls back to the built-in stylized 3D hand — nothing breaks.

What works best
- A RIGHT hand, .glb (or .gltf), ideally already in or near a relaxed grip pose.
- Reasonable size (≤ ~100k triangles) so it stays 60 FPS.
- A license you're allowed to use.

Where to find one (free)
- Sketchfab  — search "realistic right hand", filter Downloadable + a usable license
- Poly Pizza — https://poly.pizza
- Quaternius — https://quaternius.com

After you add it, tell me and I'll:
- align it to the mala (HAND_POS / HAND_ROT / HAND_MODEL_SCALE in src/lib/mala-curve.js),
- attach the pinch to the active bead,
- animate the thumb press on each count (if the model is rigged).

Reference pose (from your image): right hand entering from the RIGHT, fingers to
the LEFT, thumb on top gripping the top bead; lapis beads, turquoise guru bead,
blue tassel hanging straight down; soft studio light on a light background.
