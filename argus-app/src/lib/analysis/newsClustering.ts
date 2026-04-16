const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "for", "of", "is", "it",
  "and", "or", "but", "not", "with", "at", "by", "from", "as",
  "has", "had", "have", "was", "were", "be", "been", "are",
  "this", "that", "will", "would", "could", "should", "can",
  "says", "said", "new", "also", "more", "than",
]);

const SIMILARITY_THRESHOLD = 0.4;

export interface NewsCluster<T> {
  lead: T;
  related: T[];
}

function tokenize(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .slice(0, 10);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
  }
}

export function clusterNews<T extends { title: string; score: number }>(items: T[]): NewsCluster<T>[] {
  if (items.length === 0) return [];

  const tokenSets = items.map((item) => tokenize(item.title));
  const uf = new UnionFind(items.length);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (jaccard(tokenSets[i], tokenSets[j]) > SIMILARITY_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = uf.find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }

  const clusters: NewsCluster<T>[] = [];
  for (const indices of groups.values()) {
    const sorted = indices.sort((a, b) => items[b].score - items[a].score);
    clusters.push({
      lead: items[sorted[0]],
      related: sorted.slice(1).map((i) => items[i]),
    });
  }

  return clusters.sort((a, b) => b.lead.score - a.lead.score);
}
