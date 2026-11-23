import { createRoot } from 'react-dom/client';

import { Page } from './app/Page';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

// 不用 StrictMode：它会把这个组件挂载两次，而这里持有一个真正的
// Audio 元素。双挂载会建出两个播放器，预取也会跑两遍。
createRoot(root).render(<Page root={root} />);
