import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['embeddings-vector-search.md'],
  blocks: [
    {
      title: 'FAISS index names',
      markdown: `| Index | What it is | Training |
|---|---|---|
| \`IndexFlatIP\` | Exact inner product (cosine on unit vectors) | No |
| \`IndexFlatL2\` | Exact Euclidean | No |
| \`IndexHNSWFlat\` | HNSW graph, full vectors | No |
| \`IndexIVFFlat\` | k-means cells, full vectors | Yes |
| \`IndexIVFPQ\` | Cells + product-quantised codes | Yes |

Use a flat index as the ground truth when measuring ANN recall.`,
    },
    {
      title: 'HNSW search in five steps',
      markdown: `1. **Enter** at the top layer: few nodes, long links.
2. **Greedy** hop to the closest neighbour until none is closer.
3. **Drop** one layer and repeat from there.
4. **Layer 0** holds every vector; run a beam search of width \`efSearch\`.
5. **Return** the best k — approximate, roughly logarithmic in N.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Recall too low | \`efSearch\` / \`nprobe\` too small | Raise it; measure recall vs latency |
| Recall drops over time (IVF) | Centroids trained on old data | Retrain the clustering |
| Recall low after PQ | Codes too coarse | Oversample k, rerank with full vectors |
| RAM exhausted (HNSW) | Graph + full vectors in memory | Quantise, or move to IVF-PQ / DiskANN |
| Deleted items still slow search | Tombstones pile up | Rebuild or compact periodically |
| Wrong neighbours entirely | Metric mismatch (L2 vs IP) | Normalise; pick the model's metric |`,
    },
  ],
};

export default sheet;
