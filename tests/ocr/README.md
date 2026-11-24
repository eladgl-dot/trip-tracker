# Receipt OCR bench (Step 26)

Measures how well the receipt reader does on fake phone photos (Hebrew + Italian receipts, tilted, shaded, on a table).
Needs `playwright-core` and Edge, and network for the Tesseract files.

1. `node ocr-make.mjs ./ocr-img` (clean), `node ocr-make.mjs ./ocr-real hard` (phone size, faded, noise); copy `ocr-img/truth.json` into each folder.
2. Language files: `td-int/` = the `@tesseract.js-data/<lang>@1.0.0/4.0.0_best_int/*.traineddata.gz` files (eng, heb, rus);
   `td-best/` = the same with `heb.traineddata.gz` from tessdata_best (gzipped).
3. `SET=ocr-real node ocr-bench.mjs "<project>/app" flat_tok` → amount / date / place right and % of words read. `SHOW=2` prints the text.

Result 2026-11-18 (words read): 1.22 way 72 / 38 / 28 % → crop + flat + table white 88 / 55 / 73 % (clean / realistic / hard).
