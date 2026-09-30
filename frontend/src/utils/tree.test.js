import { describe, it, expect } from 'vitest'

describe('Tree Logic', () => {
  it('should build a nested tree from flat data', () => {
    const data = [
      { id: 1, name: 'Root', parent_id: null },
      { id: 2, name: 'Child 1', parent_id: 1 },
      { id: 3, name: 'Child 2', parent_id: 1 },
      { id: 4, name: 'Grandchild', parent_id: 2 }
    ];
    
    const map = {};
    const roots = [];
    data.forEach(item => {
      map[item.id] = { ...item, children: [] };
    });
    data.forEach(item => {
      if (item.parent_id) {
        if (map[item.parent_id]) {
          map[item.parent_id].children.push(map[item.id]);
          map[item.parent_id].hasChildren = true;
        }
      } else {
        roots.push(map[item.id]);
      }
    });

    expect(roots.length).toBe(1);
    expect(roots[0].children.length).toBe(2);
    expect(roots[0].children[0].children.length).toBe(1);
    expect(roots[0].children[0].children[0].name).toBe('Grandchild');
  })
})
