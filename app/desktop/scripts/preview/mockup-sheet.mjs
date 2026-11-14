// The sheet comparing a design mockup's options A, B and C side by side, for T3's html_preview
// and html_render (pass the file's contents as `html`). Shared by the desktop's mockup.mjs and
// the web's (web/scripts/mockup.mjs). Each picture fits its column; a tap shows it at full size.
// A detail picture (a clip of the part that differs) shows at full size below its picture.

/**
 * `options` maps A, B and C to their pictures: [{ caption, src, detail? }], `src` and `detail`
 * absolute paths (T3 inlines them).
 */
export function mockupSheet(options) {
  const slash = (file) => file.replaceAll('\\', '/')
  const figure = (variant, { caption, src, detail }) => `<figure>
      <div class="pic"><img src="${slash(src)}" alt="${variant}, ${caption}"></div>
      ${detail ? `<div class="pic detail"><img src="${slash(detail)}" alt="${variant}, ${caption}, detail"></div>` : ''}
      <figcaption>${caption}</figcaption>
    </figure>`
  const column = ([variant, pictures]) => `
  <section>
    <h2>${variant}</h2>
    ${pictures.map((picture) => figure(variant, picture)).join('\n    ')}
  </section>`

  return `<style>
body { margin: 0 }
.sheet { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px }
h2 { margin: 0 0 6px; font-size: 16px }
figure { margin: 0 0 12px }
figcaption { font-size: 11px; color: var(--muted-foreground) }
.pic { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); cursor: zoom-in }
.pic img { display: block; width: 100% }
.pic.full img, .pic.detail img { width: auto; max-width: none }
.pic.detail { margin-top: 6px; cursor: default }
</style>
<div class="sheet">${Object.entries(options).map(column).join('')}
</div>
<script>
for (const pic of document.querySelectorAll('.pic:not(.detail)')) pic.addEventListener('click', () => pic.classList.toggle('full'))
</script>
`
}
