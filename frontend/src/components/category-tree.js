/**
 * Thành phần giao diện Cây Hạng Mục (T-09)
 * - Hiển thị cây mở rộng/thu gọn (mặc định thu gọn từ tầng 3).
 * - Thêm, sửa, xoá tại chỗ.
 * - Chỉ chịu trách nhiệm về UI. Dữ liệu sẽ được cung cấp từ backend (T-08) khi sẵn sàng.
 */

export class CategoryTree {
  /**
   * @param {HTMLElement} container - Nơi render cây
   * @param {Object} options - Các callback để tương tác với backend (T-08)
   */
  constructor(container, options = {}) {
    this.container = container;
    this.container.classList.add('tree-container');
    
    // Callbacks provided by the integration layer (T-08 dependency)
    this.onAdd = options.onAdd || (async () => {});
    this.onUpdate = options.onUpdate || (async () => {});
    this.onDelete = options.onDelete || (async () => {});
    this.onFetchChildren = options.onFetchChildren || (async () => []);
  }

  // Khởi tạo cây bằng cách lấy danh sách root items
  async init() {
    this.container.innerHTML = '';
    const rootItems = await this.onFetchChildren(null);
    rootItems.forEach(item => {
      this.container.appendChild(this.createNode(item, 1));
    });
  }

  createNode(item, level) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.id = item.id;

    const content = document.createElement('div');
    content.className = 'tree-item-content';
    
    // Thụt lề theo cấp độ
    const indent = document.createElement('div');
    indent.style.width = `${(level - 1) * 24}px`;
    indent.className = 'tree-indent';

    const hasChildren = item.hasChildren !== false; // Backend flag
    
    // NFR: Mặc định thu gọn từ tầng 3 trở xuống (cấp 1, 2 mở; cấp 3 đóng)
    let isExpanded = level < 3;
    let isChildrenLoaded = false;
    
    const toggle = document.createElement('div');
    toggle.className = `tree-toggle ${hasChildren ? (isExpanded ? 'expanded' : '') : 'empty'}`;
    toggle.innerHTML = hasChildren ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    ` : '';
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'tree-label-container';
    
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;
    
    labelContainer.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'tree-actions';
    
    const addBtn = document.createElement('button');
    addBtn.className = 'tree-action-btn';
    addBtn.title = 'Thêm hạng mục con';
    addBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tree-action-btn delete';
    deleteBtn.title = 'Xoá hạng mục';
    deleteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;

    actions.appendChild(addBtn);
    actions.appendChild(deleteBtn);

    content.appendChild(indent);
    content.appendChild(toggle);
    content.appendChild(labelContainer);
    content.appendChild(actions);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = `tree-children ${isExpanded ? 'expanded' : ''}`;

    node.appendChild(content);
    node.appendChild(childrenContainer);

    // Tính năng: Mở rộng/Thu gọn
    const loadChildren = async () => {
      if (isChildrenLoaded) return;
      childrenContainer.innerHTML = '';
      const children = await this.onFetchChildren(item.id);
      children.forEach(child => {
        childrenContainer.appendChild(this.createNode(child, level + 1));
      });
      isChildrenLoaded = true;
    };

    if (isExpanded && hasChildren) {
      loadChildren();
    }

    toggle.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!hasChildren) return;
      isExpanded = !isExpanded;
      toggle.className = `tree-toggle ${isExpanded ? 'expanded' : ''}`;
      childrenContainer.className = `tree-children ${isExpanded ? 'expanded' : ''}`;
      if (isExpanded) {
        await loadChildren();
      }
    });

    // Tính năng: Sửa hạng mục tại chỗ
    labelContainer.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'tree-input';
      input.value = item.name;
      
      labelContainer.innerHTML = '';
      labelContainer.appendChild(input);
      input.focus();
      
      const saveEdit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== item.name) {
          const success = await this.onUpdate(item.id, { name: newName });
          if (success) item.name = newName;
        }
        labelContainer.innerHTML = '';
        label.textContent = item.name;
        labelContainer.appendChild(label);
      };
      
      input.addEventListener('blur', saveEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') {
          labelContainer.innerHTML = '';
          labelContainer.appendChild(label);
        }
      });
    });

    // Tính năng: Thêm hạng mục con tại chỗ
    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      if (!isExpanded) {
        isExpanded = true;
        toggle.className = `tree-toggle expanded`;
        childrenContainer.className = `tree-children expanded`;
        await loadChildren();
      }
      
      const inputContainer = document.createElement('div');
      inputContainer.className = 'tree-item-content';
      
      const childIndent = document.createElement('div');
      childIndent.style.width = `${level * 24}px`;
      childIndent.className = 'tree-indent';
      
      const input = document.createElement('input');
      input.className = 'tree-input';
      input.placeholder = 'Nhập tên hạng mục mới...';
      
      inputContainer.appendChild(childIndent);
      inputContainer.appendChild(input);
      
      childrenContainer.insertBefore(inputContainer, childrenContainer.firstChild);
      input.focus();
      
      let isSaving = false;
      const saveNew = async () => {
        if (isSaving) return;
        isSaving = true;
        const name = input.value.trim();
        if (name) {
          const newItem = await this.onAdd(item.id, { name });
          if (newItem) {
            const newNode = this.createNode(newItem, level + 1);
            childrenContainer.insertBefore(newNode, inputContainer);
          }
        }
        inputContainer.remove();
      };
      
      input.addEventListener('blur', () => setTimeout(saveNew, 150));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveNew();
        if (e.key === 'Escape') inputContainer.remove();
      });
    });

    // Tính năng: Xoá hạng mục tại chỗ
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Delegate kiểm tra logic (ví dụ: T-10) cho backend. UI chỉ gọi onDelete.
      const success = await this.onDelete(item.id);
      if (success) {
        node.remove();
      }
    });

    return node;
  }
}
