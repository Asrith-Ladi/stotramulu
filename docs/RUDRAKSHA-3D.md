# 3D Rudraksha design basis

The WebGL bead is a procedural visual representation of a common five-mukhi Rudraksha. It is not a scan of a specific seed and should not be used to authenticate physical Rudraksha beads.

## Morphology used

- Brown, hard seed with a spherical, obovoid, or oval overall form.
- Five longitudinal segments divided by deep clefts that continue from pole to pole.
- Rough, tuberculated surface with organic asymmetry.
- A channel running through the top and bottom for the mala thread.

## Sources considered

- Australian Government BICON, “Rudraksha prayer beads”: describes a rough, brain-like surface, a top-to-bottom hole, vertical clefts, and the predominance of five-faced beads.  
  https://bicon.agriculture.gov.au/BiconWeb4.0/ViewElement/Element?caseElementPk=1074838&elementPk=987172
- Ayurvedic Pharmacopoeia of India, Rudraksha seed monograph, page 160: describes the seed as hard, brown, spherical/obovoid/oval, longitudinally grooved, tubercled, and divided into five segments.  
  https://jmfacpm.com/pdf/pgpdf-10229-07-08-2023-71515.pdf
- Department of Pharmacognosy herbarium sheet: independently describes the mature seed as brown with deep natural clefts and a rough, tuberculated surface.  
  https://bcrcp.ac.in/Herbarium/RUDRAKSHA.pdf

## Rendering choices and limits

The mesh uses five modeled clefts, face bulges, several layers of deterministic surface displacement, open recessed thread channels, and per-bead variation. Lighting and color emphasize relief on phone screens. Real seeds vary by origin, maturity, cleaning, polishing, and individual growth, so the renderer aims for recognizable morphology rather than an exact specimen.
