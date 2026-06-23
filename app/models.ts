export class Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
  markerEnd?: { type: string };
  style?: Record<string, string | number>;
  animated?: boolean;

  constructor(
    id: string,
    source: string,
    target: string,
    label?: string,
    markerEnd?: { type: string },
    style?: Record<string, string | number>,
    animated?: boolean,
  ) {
    this.id = id;
    this.source = source;
    this.target = target;
    this.label = label;
    this.markerEnd = markerEnd;
    this.style = style;
    this.animated = animated;
  }
}
