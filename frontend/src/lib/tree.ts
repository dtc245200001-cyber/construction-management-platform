export interface CategoryNode {
  id: number;
  name: string;
  parent_id: number | null;
  code?: string;
  children: CategoryNode[];
  hasChildren: boolean;
}

export function buildTree(data: any[]): { roots: CategoryNode[], map: Record<number, CategoryNode> } {
  const map: Record<number, CategoryNode> = {};
  const roots: CategoryNode[] = [];
  
  // Initialize map
  data.forEach(item => {
    map[item.id] = { ...item, children: [], hasChildren: false };
  });

  // Build relationships
  data.forEach(item => {
    if (item.parent_id != null && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
      map[item.parent_id].hasChildren = true;
    } else {
      roots.push(map[item.id]);
    }
  });

  return { roots, map };
}
