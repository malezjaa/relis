import { styleText } from 'node:util';
import prettyBytes from 'pretty-bytes';
import { getContents } from './publish/publish.ts';

export const reportTree = (
  contents: Awaited<ReturnType<typeof getContents>>,
) => {
  console.log(getStringTree(contents.files));
};

interface TreeItem {
  path: string;
  size: number;
  mode: number;
  last?: boolean;
  parents?: { last: boolean }[];
  name?: string;
  children?: TreeItem[];
}

const extendTreeData = (arr: TreeItem[], parentData?: TreeItem) => {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    item.last = i === arr.length - 1;

    if (parentData && parentData.parents) {
      const parents = structuredClone(parentData.parents);
      parents.push({ last: parentData.last! });
      item.parents = parents;
    } else {
      item.parents = [];
    }

    if (item.children && item.children.length > 0) {
      extendTreeData(item.children, item);
    }
  }
};

const drawTree = (treeData: TreeItem[], renderData: string[]) => {
  for (const item of treeData) {
    let row = '';
    const blankIndent = '    ';
    const lineIndent = '│   ';

    for (let j = 0; j < item.parents!.length; j++) {
      const pItem = item.parents![j];
      row += pItem.last ? blankIndent : lineIndent;
    }

    const isDir = item.mode === 0;
    const endLabel = (item.last ? '└── ' : '├── ') + item.path.split('/').pop();
    row += endLabel;

    if (!isDir) {
      row += ` ${styleText(
        'cyan',
        `(${prettyBytes(item.size, {
          space: false,
        })})`,
      )}`;
    }

    renderData.push(row);

    if (item.children && item.children.length > 0) {
      drawTree(item.children, renderData);
    }
  }
};

const getArrayTree = (treeData: TreeItem[]): string[] => {
  const renderData: string[] = [];
  extendTreeData(treeData);
  drawTree(treeData, renderData);
  return renderData;
};

const buildTreeStructure = (files: TreeItem[]): TreeItem[] => {
  const root: TreeItem = { path: '', size: 0, mode: 0, children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let childNode = currentNode.children!.find(
        (child) => child.path === part,
      );

      if (!childNode) {
        childNode = { path: part, size: 0, mode: 0, children: [] };
        currentNode.children!.push(childNode);
      }

      if (i === parts.length - 1) {
        childNode.size = file.size;
        childNode.mode = file.mode;
      }

      currentNode = childNode;
    }
  }

  return root.children!;
};

export const getStringTree = (files: TreeItem[]) => {
  const treeData = buildTreeStructure(files);
  return getArrayTree(treeData).join('\n');
};
