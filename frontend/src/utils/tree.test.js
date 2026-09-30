// fix(T-test): test phải import module thực, không được cài lại thuật toán trong test
import { describe, it, expect } from 'vitest'
import { buildTree } from './buildTree.js'

describe('buildTree utility', () => {
  it('should build a nested tree from flat data', () => {
    const data = [
      { id: 1, name: 'Root', parent_id: null },
      { id: 2, name: 'Child 1', parent_id: 1 },
      { id: 3, name: 'Child 2', parent_id: 1 },
      { id: 4, name: 'Grandchild', parent_id: 2 }
    ]

    const roots = buildTree(data)

    expect(roots.length).toBe(1)
    expect(roots[0].children.length).toBe(2)
    expect(roots[0].children[0].children.length).toBe(1)
    expect(roots[0].children[0].children[0].name).toBe('Grandchild')
  })

  it('should handle empty list', () => {
    expect(buildTree([])).toEqual([])
  })

  it('should handle multiple roots', () => {
    const data = [
      { id: 1, name: 'A', parent_id: null },
      { id: 2, name: 'B', parent_id: null },
    ]
    const roots = buildTree(data)
    expect(roots.length).toBe(2)
  })
})
