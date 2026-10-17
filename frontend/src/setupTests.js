import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

// Đảm bảo JSDOM dùng native Blob/File để fake-indexeddb và structuredClone xử lý đúng
if (NodeBlob) {
  globalThis.Blob = NodeBlob;
  if (typeof window !== 'undefined') {
    window.Blob = NodeBlob;
  }
}
if (NodeFile) {
  globalThis.File = NodeFile;
  if (typeof window !== 'undefined') {
    window.File = NodeFile;
  }
}
