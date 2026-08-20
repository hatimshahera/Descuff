export interface GraphifyGraph {
  nodes?: GraphifyNode[];
  edges?: GraphifyEdge[];
}

export interface GraphifyNode {
  id: string;
  label?: string;
  type?: string;
  source_location?: string;
  source_file?: string;
}

export interface GraphifyEdge {
  source: string;
  target: string;
  type?: string;
}
