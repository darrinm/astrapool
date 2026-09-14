# Astra Pool logo

`logo-source.png` is the approved imagegen artwork: glossy Jupiter, Moon, and Earth billiard balls inside a brass rack, with an ivory wordmark.

`public/brand/astra-pool-logo.png` is the cropped, transparent production asset (1653 × 396). It is used in the attract-mode heading. It has real alpha; no blending mode is needed. Its ivory lettering is intended for dark backgrounds.

To repeat background extraction, install Pillow, NumPy and SciPy and run `python3 pipeline/brand/extract-logo.py`. The extraction preserves the source artwork and protects dark detail inside the spherical balls. Check the output against both light and dark backgrounds when changing the source or masks.
