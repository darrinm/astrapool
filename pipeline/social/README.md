# Social preview

`og-source.png` was made with the built-in imagegen tool, using the previous gameplay screenshot as a visual reference. The exact prompt is in `og-prompt.txt`. This is promotional artwork, not an unedited gameplay screenshot.

The published card is `public/og.jpg`, 1200 × 630. Export on macOS from the repository root:

```sh
sips -s format jpeg -s formatOptions 87 -z 630 1200 pipeline/social/og-source.png --out public/og.jpg
```

The Open Graph URL includes a revision query so crawlers can fetch the replacement image. Increase it when replacing the card again.

## GitHub repository preview

`github-preview.jpg` is a separate 1280 × 640 composition, with the title and main subjects inset to fit GitHub's supplied template. Upload it in repository Settings → General → Social preview → Edit. GitHub stores this separately from the website's Open Graph image.

The built-in imagegen edit is preserved as `github-source.png` with its exact prompt in `github-prompt.txt`. Export it with:

```sh
sips -s format jpeg -s formatOptions 87 -z 640 1280 pipeline/social/github-source.png --out pipeline/social/github-preview.jpg
```
