import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['ocr-documents.md', 'multimodal-rag.md'],
  blocks: [
    {
      title: 'Pick a document stack',
      markdown: `| Documents | Stack |
|---|---|
| Printed invoices at volume | Layout model (e.g. LayoutLMv3) + rules |
| Fixed-format receipts | Fine-tuned OCR-free model (e.g. Donut) |
| Scientific papers with maths | Nougat-style parser; VLM for figures |
| Mixed, handwritten, forms | Vision-language model |
| Regulated workflows | OCR pipeline + VLM cross-check |
| Visually rich PDFs for RAG | Page-image retrieval (ColPali-style) |
| Pure text | Plain text extraction — simplest and smallest |`,
    },
    {
      title: 'OCR quality formulas',
      markdown: `- **CER** = character edit distance ÷ reference length.
- **WER** = the same, counted in words.
- Classical pipeline: detect text boxes → crop → recognise lines → restore reading order.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Chart values missing in answers | Text extraction drops charts | Caption figures or index page images |
| Columns interleaved | Wrong reading order | Layout-aware parser |
| OCR-free model fails on papers | Trained for one document type | Use a paper-specific parser |
| Extracted field looks right, is wrong | No human check | Keep offsets; review before approve |
| Approved value no longer matches | Source re-parsed or edited | Tie approvals to the doc's content hash |`,
    },
    {
      title: 'Provenance',
      markdown: `Store character offsets (or page + bounding box) for every extracted field. Offsets prove *where* a value came from, not that it is right — a reviewer still confirms it.`,
    },
  ],
};

export default sheet;
