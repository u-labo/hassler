import { useState, useRef } from "react";

const CATEGORIES = [
  { q: '本当に？',           cat: '信憑性',     hint: '事実として本当に正しいか？' },
  { q: 'どういう意味？',     cat: '定義',       hint: 'そもそも言葉の意味は？' },
  { q: 'いつ（から／まで）？', cat: '時間',     hint: 'いつから？いつまで？' },
  { q: 'どこで？',           cat: '空間',       hint: '場所・地域によって違いは？' },
  { q: 'だれ？',             cat: '主体',       hint: '誰が関わっているのか？' },
  { q: 'いかにして？',       cat: '経緯',       hint: 'どういう経緯でそうなった？' },
  { q: 'どんなで？',         cat: '様態',       hint: '現状はどうなっているか？' },
  { q: 'なぜ(1)？',          cat: '原因',       hint: '原因は何か？' },
  { q: 'なぜ(2)？',          cat: '根拠・理由', hint: 'どんな根拠・証拠があるか？' },
  { q: 'なんのため？',       cat: '目的',       hint: '何のためにそれをするのか？' },
  { q: 'どうなる？',         cat: '結果',       hint: 'それによって何が起きる？' },
  { q: '他ではどうか？',     cat: '比較',       hint: '他の事例・場所では？' },
  { q: 'これについては？',   cat: '特殊化',     hint: 'この特定のケースでは？' },
  { q: 'これだけか？',       cat: '一般化',     hint: 'もっと広い問題では？' },
  { q: 'すべてそうなのか？', cat: '限定',       hint: '例外はないか？' },
  { q: 'だからどうなの？',   cat: '価値評価',   hint: 'それは良いことか悪いことか？' },
  { q: 'どうすべきか？',     cat: '当為',       hint: 'どう対応・解決すべきか？' },
  { q: 'どうやって？',       cat: '方法',       hint: '具体的な方法・手段は？' },
];

// 問いノード用：深さで色分け
const QCOLS = [
  { bg: '#fff7e6', border: '#d48806', badge: '#b36a00' },
  { bg: '#e6f4ff', border: '#1677ff', badge: '#0050b3' },
  { bg: '#f6ffed', border: '#52c41a', badge: '#237804' },
  { bg: '#fff0f6', border: '#eb2f96', badge: '#9e1068' },
  { bg: '#f0f5ff', border: '#2f54eb', badge: '#1d39c4' },
  { bg: '#e6fffb', border: '#13c2c2', badge: '#006d75' },
];
// 答えノード用：固定色（緑系）
const ACOL = { bg: '#f6fff0', border: '#5a9a40', badge: '#3a7020' };

const NW = 260;
const CANVAS_PAD = 52;
const HG = 80;
const MAX_LINES = 5;
const DISPLAY_FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
const EXPORT_FONT  = "Arial,'Helvetica Neue',sans-serif";

let _ctx2d = null;
const getCtx2d = () => { if (!_ctx2d) _ctx2d = document.createElement('canvas').getContext('2d'); return _ctx2d; };
const wrapMeasured = (text, maxW, fs, font) => {
  const c = getCtx2d(); c.font = `${fs}px ${font}`;
  const lines = []; let start = 0;
  while (start < text.length) {
    let end = start + 1;
    while (end < text.length && c.measureText(text.slice(start, end + 1)).width <= maxW) end++;
    const isLast = lines.length >= MAX_LINES - 1;
    if (isLast && end < text.length) {
      let chunk = text.slice(start, end);
      while (chunk.length > 1 && c.measureText(chunk + '…').width > maxW) chunk = chunk.slice(0, -1);
      lines.push(chunk + '…'); break;
    }
    lines.push(text.slice(start, end)); start = end;
    if (lines.length >= MAX_LINES) break;
  }
  return lines.length > 0 ? lines : [''];
};

const nodeH = (fs) => {
  const badgeFs = Math.max(9, fs - 3);
  return Math.round(badgeFs + 9 + 10 + (fs + 7) * MAX_LINES + 20);
};
const vgap = (fs) => Math.round(fs * 1.0 + 8);

let _id = 0;
const uid = () => `n${++_id}`;

const mkNode = (text, opts = {}) => ({
  id: uid(), text,
  nodeType: opts.nodeType ?? 'question',   // 'question' | 'answer'
  questionType: opts.questionType ?? null,
  category: opts.category ?? null,
  children: [], collapsed: false,
  depth: opts.depth ?? 0,
});

const findNode = (root, id) => {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children) { const f = findNode(c, id); if (f) return f; }
  return null;
};
const addChild = (root, parentId, child) => {
  const clone = n => n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: n.children.map(clone) };
  return clone(root);
};
const removeNode = (root, id) => {
  const clone = n => ({ ...n, children: n.children.filter(c => c.id !== id).map(clone) });
  return clone(root);
};
const toggleCollapse = (root, id) => {
  const clone = n => n.id === id ? { ...n, collapsed: !n.collapsed } : { ...n, children: n.children.map(clone) };
  return clone(root);
};
const toggleNodeType = (root, id) => {
  const clone = n => n.id === id
    ? { ...n, nodeType: n.nodeType === 'question' ? 'answer' : 'question' }
    : { ...n, children: n.children.map(clone) };
  return clone(root);
};
const countLeaves = (n) => (!n.children.length || n.collapsed) ? 1 : n.children.reduce((s, c) => s + countLeaves(c), 0);

// ランドスケープ（左→右）
const layoutTree = (root, fs) => {
  const pos = new Map();
  const nh = nodeH(fs), vg = vgap(fs);
  const place = (node, d, sy) => {
    const l = countLeaves(node);
    pos.set(node.id, { x: d * (NW + HG), y: sy + (l * (nh + vg) - vg) / 2 - nh / 2 });
    if (node.collapsed) return;
    let y = sy;
    for (const c of node.children) { const cl = countLeaves(c); place(c, d + 1, y); y += cl * (nh + vg); }
  };
  if (root) place(root, 0, 0);
  return pos;
};

// ポートレイト（上→下）
const PVG = 52; // 深さ方向の縦ギャップ
const layoutTreePortrait = (root, fs) => {
  const pos = new Map();
  const nh = nodeH(fs);
  const hg = NW + 14; // 横方向の葉ギャップ
  const place = (node, d, sx) => {
    const l = countLeaves(node);
    const tw = l * hg - 14;
    pos.set(node.id, { x: sx + tw / 2 - NW / 2, y: d * (nh + PVG) });
    if (node.collapsed) return;
    let x = sx;
    for (const c of node.children) { const cl = countLeaves(c); place(c, d + 1, x); x += cl * hg; }
  };
  if (root) place(root, 0, 0);
  return pos;
};

const getTreeBounds = (pos, fs, orient = 'landscape') => {
  const nh = nodeH(fs); let maxX = NW, maxY = nh;
  for (const [, { x, y }] of pos) { maxX = Math.max(maxX, x + NW); maxY = Math.max(maxY, y + nh); }
  return { w: maxX + CANVAS_PAD * 2, h: maxY + CANVAS_PAD * 2 };
};

const getNodeCol = (node) => node.nodeType === 'answer' ? ACOL : QCOLS[node.depth % QCOLS.length];

const calcLayout = (node, fs, font) => {
  const badgeFs = Math.max(9, fs - 3);
  const lineH = fs + 7;
  const nh = nodeH(fs);
  const isAnswer = node.nodeType === 'answer';
  // answer nodes: show "答え" badge; question nodes with category: show category
  const hasBadge = isAnswer || !!node.questionType;
  const badgeText = isAnswer ? '答え' : (node.questionType ? `${node.questionType}｜${node.category}` : '');
  const badgeH = hasBadge ? badgeFs + 9 : 0;
  const badgeGap = hasBadge ? 10 : 0;
  const lines = wrapMeasured(node.text, NW - 22, fs, font);
  const textBlockH = lines.length * lineH;
  const contentH = badgeH + badgeGap + textBlockH;
  const startY = (nh - contentH) / 2;
  return {
    badgeFs, lineH, lines, hasBadge, badgeText,
    badgeY: hasBadge ? startY + badgeFs : null,
    textY0: startY + badgeH + badgeGap + fs - 1,
  };
};

const escXML = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── SVG export (clean, no buttons)
const buildExportSVG = (root, fs, zoom, orient = 'landscape') => {
  if (!root) return null;
  const pos = orient === 'portrait' ? layoutTreePortrait(root, fs) : layoutTree(root, fs);
  const nh = nodeH(fs);
  const { w: nw, h: nh2 } = getTreeBounds(pos, fs, orient);
  const svgW = Math.round(nw * zoom), svgH = Math.round(nh2 * zoom);
  const edgeParts = [], nodeParts = [];
  const walk = (n) => {
    const p = pos.get(n.id); if (!p) return;
    const col = getNodeCol(n);
    const x = p.x + CANVAS_PAD, y = p.y + CANVAS_PAD;
    const { badgeFs, lineH, lines, hasBadge, badgeText, badgeY, textY0 } = calcLayout(n, fs, EXPORT_FONT);
    const isAnswer = n.nodeType === 'answer';
    let g = `<g transform="translate(${x},${y})">`;
    g += `<rect width="${NW}" height="${nh}" rx="9" fill="${col.bg}" stroke="${col.border}" stroke-width="1.5"${isAnswer ? ' stroke-dasharray="6,3"' : ''}/>`;
    if (hasBadge && badgeY !== null)
      g += `<text x="11" y="${badgeY.toFixed(1)}" font-size="${badgeFs}" fill="${col.badge}" font-family="${EXPORT_FONT}" font-weight="700">${escXML(badgeText)}</text>`;
    lines.forEach((l, i) =>
      g += `<text x="11" y="${(textY0 + i * lineH).toFixed(1)}" font-size="${fs}" font-weight="${n.depth===0?'700':'400'}" fill="#1a1208" font-family="${EXPORT_FONT}">${escXML(l)}</text>`
    );
    g += '</g>';
    nodeParts.push(g);
    if (!n.collapsed) {
      for (const c of n.children) {
        const q = pos.get(c.id);
        if (q) {
          const isAns = c.nodeType === 'answer';
          const ec = getNodeCol(c);
          let d;
          if (orient === 'portrait') {
            const x1=p.x+CANVAS_PAD+NW/2, y1=p.y+CANVAS_PAD+nh;
            const x2=q.x+CANVAS_PAD+NW/2, y2=q.y+CANVAS_PAD;
            const my=(y1+y2)/2;
            d=`M${x1},${y1}C${x1},${my} ${x2},${my} ${x2},${y2}`;
          } else {
            const x1=p.x+CANVAS_PAD+NW, y1=p.y+CANVAS_PAD+nh/2;
            const x2=q.x+CANVAS_PAD,    y2=q.y+CANVAS_PAD+nh/2;
            const mx=(x1+x2)/2;
            d=`M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          }
          const dash = isAns ? ' stroke-dasharray="7,4"' : '';
          const marker = isAns ? '' : ' marker-end="url(#arrow)"';
          edgeParts.push(`<path d="${d}" fill="none" stroke="${ec.border}" stroke-width="2" opacity="0.6"${dash}${marker}/>`);
        }
        walk(c);
      }
    }
  };
  walk(root);
  const arrowDef = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#888"/></marker></defs>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">\n${arrowDef}\n<rect width="${svgW}" height="${svgH}" fill="#f7f5ef"/>\n<g transform="scale(${zoom})">\n${edgeParts.join('\n')}\n${nodeParts.join('\n')}\n</g>\n</svg>`;
};

const buildMermaid = (root, orient = 'landscape') => {
  if (!root) return '';
  const dir = orient === 'portrait' ? 'TD' : 'LR';
  const esc = s => String(s).replace(/"/g,'#quot;').replace(/\\/g,'\\\\');
  const edgeLines=[], nodeLines=[], styleLines=[];
  const walk = (n) => {
    const col = getNodeCol(n);
    const isAns = n.nodeType === 'answer';
    const label = isAns
      ? `【答え】\\n${esc(n.text)}`
      : (n.questionType ? `【${esc(n.questionType)}｜${esc(n.category)}】\\n${esc(n.text)}` : esc(n.text));
    const shape = isAns ? `("${label}")` : `["${label}"]`;
    nodeLines.push(`  ${n.id}${shape}`);
    styleLines.push(`  style ${n.id} fill:${col.bg},stroke:${col.border},stroke-width:2px,color:#1a1208`);
    if (!n.collapsed) {
      for (const c of n.children) {
        edgeLines.push(c.nodeType === 'answer' ? `  ${n.id} -.-> ${c.id}` : `  ${n.id} --> ${c.id}`);
        walk(c);
      }
    }
  };
  walk(root);
  return ['```mermaid',`flowchart ${dir}`,...nodeLines,...edgeLines,...styleLines,'```'].join('\n');
};

// ── C案テーブル（Markdown）
const buildTableMD = (root) => {
  if (!root) return '';
  const rows = [];
  const walk = (n, parentQ = null) => {
    const isAns = n.nodeType === 'answer';
    const cat = isAns ? '—' : (n.category || '—');
    const q = isAns ? '—' : n.text;
    const a = isAns ? n.text : '—';
    rows.push({ cat, q, a });
    if (!n.collapsed) for (const c of n.children) walk(c, isAns ? parentQ : n.text);
  };
  walk(root);
  const lines = [
    '| カテゴリ | 問い | 答え |',
    '|---|---|---|',
    ...rows.map(r => `| ${r.cat} | ${r.q} | ${r.a} |`)
  ];
  return lines.join('\n');
};

// ── 樹形図テキスト
const buildTreeText = (root) => {
  if (!root) return '';
  const lines = [];
  const walk = (n, prefix = '', isLast = true) => {
    const connector = prefix === '' ? '' : isLast ? '└── ' : '├── ';
    const isAns = n.nodeType === 'answer';
    const label = isAns
      ? `答え: ${n.text}`
      : (n.questionType ? `[${n.questionType}] ${n.text}` : n.text);
    lines.push(prefix + connector + label);
    if (!n.collapsed && n.children.length > 0) {
      const childPrefix = prefix + (prefix === '' ? '' : isLast ? '    ' : '│   ');
      n.children.forEach((c, i) => walk(c, childPrefix, i === n.children.length - 1));
    }
  };
  walk(root);
  return lines.join('\n');
};

// ── 表・樹形図をまとめてMD出力
const buildSummaryMD = (root) => {
  if (!root) return '';
  return [
    `# 問いのフィールド：${root.text}`,
    '',
    '## 樹形図',
    '',
    '```',
    buildTreeText(root),
    '```',
    '',
    '## 問いと答えの一覧（表）',
    '',
    buildTableMD(root),
  ].join('\n');
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
};

// ── Mermaid インポート
const parseMermaid = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 問いノード: n1["label"]  答えノード: n1("label")
  const qNodeRe = /^(n\d+)\["(.+)"\]$/;
  const aNodeRe = /^(n\d+)\("(.+)"\)$/;
  // エッジ: n1 --> n2  or  n1 -.-> n2
  const edgeRe  = /^(n\d+)\s+(-->|-\.->)\s+(n\d+)$/;

  const rawNodes = new Map();
  const edges    = [];

  for (const line of lines) {
    const qm = line.match(qNodeRe);
    if (qm) { rawNodes.set(qm[1], { nodeType: 'question', label: qm[2] }); continue; }
    const am = line.match(aNodeRe);
    if (am) { rawNodes.set(am[1], { nodeType: 'answer',   label: am[2] }); continue; }
    const em = line.match(edgeRe);
    if (em) { edges.push({ from: em[1], to: em[3], childType: em[2] === '-->' ? 'question' : 'answer' }); }
  }

  if (rawNodes.size === 0) return null;

  const childSet  = new Set(edges.map(e => e.to));
  const rootCands = [...rawNodes.keys()].filter(id => !childSet.has(id));
  if (rootCands.length === 0) return null;
  const rootId    = rootCands[0];

  const childrenMap = new Map();
  for (const { from, to } of edges) {
    if (!childrenMap.has(from)) childrenMap.set(from, []);
    childrenMap.get(from).push(to);
  }

  const parseLabel = (label, nodeType) => {
    // \n は書き出し時に \\n として埋め込まれている
    const decoded = label.replace(/#quot;/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    if (nodeType === 'answer') {
      const m = decoded.match(/^【答え】\n(.+)$/s);
      return { questionType: null, category: null, text: (m ? m[1] : decoded).trim() };
    }
    const m = decoded.match(/^【(.+?)｜(.+?)】\n(.+)$/s);
    if (m) return { questionType: m[1], category: m[2], text: m[3].trim() };
    return { questionType: null, category: null, text: decoded.trim() };
  };

  const buildNode = (id, depth) => {
    const raw = rawNodes.get(id); if (!raw) return null;
    const { questionType, category, text } = parseLabel(raw.label, raw.nodeType);
    const children = (childrenMap.get(id) || []).map(cid => buildNode(cid, depth + 1)).filter(Boolean);
    return { id: uid(), text, nodeType: raw.nodeType, questionType, category, children, explored: children.length > 0, collapsed: false, depth };
  };

  return buildNode(rootId, 0);
};

// ── Interactive node
function NodeBox({ node, pos, fs, selId, addingToId, onSelect, onOpenAdd, onCollapse, onDelete }) {
  const p = pos.get(node.id); if (!p) return null;
  const nh = nodeH(fs);
  const col = getNodeCol(node);
  const isSel = node.id === selId;
  const isAdding = node.id === addingToId;
  const isAnswer = node.nodeType === 'answer';
  const { badgeFs, lineH, lines, hasBadge, badgeText, badgeY, textY0 } = calcLayout(node, fs, DISPLAY_FONT);
  const btnSz = Math.round(fs * 1.45 + 3);
  const hasChildren = node.children.length > 0;

  // ボタン配置：右端から [+] 、その左に [▼/▶]（子ありの場合のみ）
  const addBtnX = NW - btnSz - 7;
  const colBtnX = hasChildren ? addBtnX - btnSz - 4 : null;
  const btnY = nh / 2 - btnSz / 2;

  return (
    <g transform={`translate(${p.x + CANVAS_PAD},${p.y + CANVAS_PAD})`}>
      {(isSel || isAdding) && <rect x="-5" y="-5" width={NW+10} height={nh+10} rx="13" fill={col.border} opacity={isAdding?0.18:0.1}/>}
      <rect width={NW} height={nh} rx="9" fill={col.bg} stroke={col.border}
        strokeWidth={isSel||isAdding?2.5:1.5}
        strokeDasharray={isAnswer ? '7,3' : undefined}
        style={{ cursor:'pointer' }} onClick={() => onSelect(node.id)} />
      {hasBadge && badgeY !== null && (
        <text x="11" y={badgeY} fontSize={badgeFs} fill={col.badge}
          fontFamily={DISPLAY_FONT} fontWeight="700" style={{ pointerEvents:'none' }}>
          {badgeText}
        </text>
      )}
      {lines.map((l, i) => (
        <text key={i} x="11" y={textY0 + i * lineH} fontSize={fs}
          fontWeight={node.depth===0?'700':'400'} fill="#1a1208"
          fontFamily={DISPLAY_FONT} style={{ pointerEvents:'none' }}>{l}</text>
      ))}

      {/* [+] 追加ボタン（常に表示） */}
      <g transform={`translate(${addBtnX},${btnY})`} style={{ cursor:'pointer' }}
        onClick={e => { e.stopPropagation(); onOpenAdd(node.id); }}>
        <rect width={btnSz} height={btnSz} rx="5" fill={isAdding ? col.badge : col.border}/>
        <text x={btnSz/2} y={btnSz*0.82} textAnchor="middle"
          fontSize={btnSz*0.82} fill="#fff" fontWeight="700"
          style={{ pointerEvents:'none', userSelect:'none' }}>+</text>
        <text x={btnSz/2} y={btnSz+11} textAnchor="middle"
          fontSize="8.5" fill={col.badge} fontWeight="600"
          style={{ pointerEvents:'none', userSelect:'none' }}>追加</text>
      </g>

      {/* [▼/▶] 折りたたみボタン（子ありの場合のみ） */}
      {hasChildren && colBtnX !== null && (
        <g transform={`translate(${colBtnX},${btnY})`} style={{ cursor:'pointer' }}
          onClick={e => { e.stopPropagation(); onCollapse(node.id); }}>
          <rect width={btnSz} height={btnSz} rx="5" fill="#e8e4dc" stroke="#c8c0b0" strokeWidth="1"/>
          <text x={btnSz/2} y={btnSz*0.75} textAnchor="middle"
            fontSize={btnSz*0.58} fill="#5a5040" fontWeight="700"
            style={{ pointerEvents:'none', userSelect:'none' }}>
            {node.collapsed ? '▶' : '▼'}
          </text>
        </g>
      )}

      {/* 削除ボタン（深さ1以上） */}
      {node.depth > 0 && (
        <g transform={`translate(${(hasChildren ? colBtnX : addBtnX) - btnSz - 4},${btnY})`}
          style={{ cursor:'pointer' }}
          onClick={e => { e.stopPropagation(); onDelete(node.id); }}>
          <rect width={btnSz} height={btnSz} rx="5" fill="#f5f5f0" stroke="#ddd" strokeWidth="1"/>
          <text x={btnSz/2} y={btnSz*0.76} textAnchor="middle"
            fontSize={btnSz*0.68} fill="#999"
            style={{ pointerEvents:'none', userSelect:'none' }}>✕</text>
        </g>
      )}
    </g>
  );
}

// ── Edge component
function Edge({ parent, child, pos, fs, orient }) {
  const p = pos.get(parent.id), q = pos.get(child.id);
  if (!p || !q) return null;
  const nh = nodeH(fs);
  const col = getNodeCol(child);
  const isAns = child.nodeType === 'answer';
  let d;
  if (orient === 'portrait') {
    // 上→下：親の底辺中央 → 子の上辺中央
    const x1=p.x+CANVAS_PAD+NW/2, y1=p.y+CANVAS_PAD+nh;
    const x2=q.x+CANVAS_PAD+NW/2, y2=q.y+CANVAS_PAD;
    const my=(y1+y2)/2;
    d=`M${x1},${y1}C${x1},${my} ${x2},${my} ${x2},${y2}`;
  } else {
    // 左→右：親の右辺中央 → 子の左辺中央
    const x1=p.x+CANVAS_PAD+NW, y1=p.y+CANVAS_PAD+nh/2;
    const x2=q.x+CANVAS_PAD,    y2=q.y+CANVAS_PAD+nh/2;
    const mx=(x1+x2)/2;
    d=`M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }
  return (
    <path d={d} fill="none" stroke={col.border} strokeWidth="2" opacity="0.6"
      strokeDasharray={isAns ? '8,4' : undefined}
      markerEnd={isAns ? undefined : 'url(#arrowhead)'}
    />
  );
}

function MindMap({ root, selId, addingToId, fs, zoom, orient, onSelect, onOpenAdd, onCollapse, onDelete, svgRef }) {
  const pos = orient === 'portrait' ? layoutTreePortrait(root, fs) : layoutTree(root, fs);
  const { w: nw, h: nh2 } = root ? getTreeBounds(pos, fs, orient) : { w:700, h:500 };
  const svgW = Math.round(nw*zoom), svgH = Math.round(nh2*zoom);
  const edges=[], nodes=[];
  const walk = (n) => {
    nodes.push(n);
    if (n.collapsed) return;
    for (const c of n.children) { edges.push({ parent:n, child:c }); walk(c); }
  };
  if (root) walk(root);

  return (
    <svg ref={el => svgRef.current = el} width={svgW} height={svgH}
      style={{ display:'block', minWidth:'100%', minHeight:'100%', background:'#f7f5ef' }}>
      <defs>
        <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="1" fill="#cec9bc"/>
        </pattern>
        <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L9,3.5 z" fill="#888" opacity="0.7"/>
        </marker>
      </defs>
      <rect width={svgW} height={svgH} fill="#f7f5ef"/>
      <rect x="0" y="0" width={svgW} height={svgH} fill="url(#dots)"/>
      <g transform={`scale(${zoom})`}>
        {edges.map((e,i) => <Edge key={i} parent={e.parent} child={e.child} pos={pos} fs={fs} orient={orient}/>)}
        {nodes.map(n => <NodeBox key={n.id} node={n} pos={pos} fs={fs}
          selId={selId} addingToId={addingToId}
          onSelect={onSelect} onOpenAdd={onOpenAdd} onCollapse={onCollapse} onDelete={onDelete}/>)}
      </g>
      {!root && <text x="50%" y="50%" textAnchor="middle" fontSize="15" fill="#bbb" fontFamily={DISPLAY_FONT}>左パネルにトピックを入力してください</text>}
    </svg>
  );
}

export default function App() {
  const [phase, setPhase]         = useState('input');
  const [input, setInput]         = useState('');
  const [root, setRoot]           = useState(null);
  const [selId, setSelId]         = useState(null);
  const [addingToId, setAddingToId] = useState(null);
  const [selCat, setSelCat]       = useState(null);
  const [newNodeType, setNewNodeType] = useState('question');
  const [inputText, setInputText] = useState('');
  const [fontSize, setFontSize]   = useState(13);
  const [zoom, setZoom]           = useState(1.0);
  const [orient, setOrient]       = useState('landscape');
  const [exporting, setExporting] = useState(null);
  const [importErr, setImportErr] = useState(null);
  const fileInputRef = useRef(null);
  const fileInputRef2 = useRef(null);

  const handleImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseMermaid(text);
      if (!parsed) { setImportErr('読み込みに失敗しました。ハスラーくんで書き出したMermaidファイルを選択してください。'); return; }
      setRoot(parsed); setPhase('mapping'); setSelId(null);
      setAddingToId(null); setSelCat(null); setInputText('');
      setImportErr(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const [rightOpen, setRightOpen] = useState(true);
  const svgRef = { current: null };

  const selNode = selId ? findNode(root, selId) : null;
  const addingNode = addingToId ? findNode(root, addingToId) : null;

  const handleStart = () => {
    if (!input.trim()) return;
    setRoot(mkNode(input.trim())); setPhase('mapping');
  };
  const handleSelect = (id) => {
    setSelId(id);
    if (addingToId !== id) { setAddingToId(null); setSelCat(null); setInputText(''); setNewNodeType('question'); }
  };
  // [+] → 常に追加パネルを開く
  const handleOpenAdd = (id) => {
    setAddingToId(id); setSelId(id); setSelCat(null); setInputText(''); setNewNodeType('question');
  };
  // [▼/▶] → 折りたたみトグル
  const handleCollapse = (id) => {
    setRoot(prev => toggleCollapse(prev, id));
  };
  const handleDelete = (id) => {
    setRoot(prev => removeNode(prev, id));
    if (selId === id) setSelId(null);
    if (addingToId === id) { setAddingToId(null); setSelCat(null); setInputText(''); }
  };
  const handleToggleType = (id) => setRoot(prev => toggleNodeType(prev, id));

  // ── 編集
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState('');
  const [editCat, setEditCat]     = useState(null);
  const handleStartEdit = (id) => {
    const node = findNode(root, id); if (!node) return;
    setEditingId(id); setEditText(node.text); setEditCat(null);
  };
  const handleCommitEdit = () => {
    if (!editText.trim() || !editingId) return;
    const clone = n => {
      if (n.id === editingId) {
        const updated = { ...n, text: editText.trim() };
        if (editCat && n.nodeType === 'question') {
          updated.questionType = editCat.q;
          updated.category = editCat.cat;
        }
        return updated;
      }
      return { ...n, children: n.children.map(clone) };
    };
    setRoot(prev => clone(prev));
    setEditingId(null); setEditText(''); setEditCat(null);
  };
  const handleCancelEdit = () => { setEditingId(null); setEditText(''); setEditCat(null); };

  const handleAddNode = () => {
    if (!inputText.trim() || !addingToId) return;
    if (newNodeType === 'question' && !selCat) return;
    const parent = findNode(root, addingToId); if (!parent) return;
    const child = mkNode(inputText.trim(), {
      nodeType: newNodeType,
      questionType: newNodeType === 'question' ? selCat?.q : null,
      category:     newNodeType === 'question' ? selCat?.cat : null,
      depth: parent.depth + 1,
    });
    setRoot(prev => addChild(prev, addingToId, child));
    setInputText('');
    if (newNodeType === 'question') setSelCat(null);
  };
  const handleCancelAdd = () => { setAddingToId(null); setSelCat(null); setInputText(''); setNewNodeType('question'); };

  const doExportSVG = () => {
    const str = buildExportSVG(root, fontSize, zoom, orient); if (!str) return;
    setExporting('svg');
    downloadBlob(new Blob([str],{type:'image/svg+xml;charset=utf-8'}),'billiard_map.svg');
    setTimeout(()=>setExporting(null),400);
  };
  const doExportPNG = () => {
    const str = buildExportSVG(root, fontSize, zoom, orient); if (!str) return;
    setExporting('png');
    setTimeout(() => {
      try {
        const svgEl = svgRef.current;
        const W = Math.round(Number(svgEl?.getAttribute('width'))||800);
        const H = Math.round(Number(svgEl?.getAttribute('height'))||600);
        const scale = Math.min(2, 4000/Math.max(W,H,1));
        const canvas = document.createElement('canvas');
        canvas.width=Math.round(W*scale); canvas.height=Math.round(H*scale);
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle='#f7f5ef'; ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>{ if(blob) downloadBlob(blob,'billiard_map.png'); setExporting(null); },'image/png');
        };
        img.onerror = ()=>setExporting(null);
        img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(str);
      } catch { setExporting(null); }
    },60);
  };
  const doExportMermaid = () => {
    const str = buildMermaid(root, orient); if (!str) return;
    setExporting('md');
    downloadBlob(new Blob([str],{type:'text/markdown;charset=utf-8'}),'billiard_map.md');
    setTimeout(()=>setExporting(null),400);
  };
  const doExportSummaryMD = () => {
    const str = buildSummaryMD(root); if (!str) return;
    setExporting('summary');
    downloadBlob(new Blob([str],{type:'text/markdown;charset=utf-8'}),'billiard_summary.md');
    setTimeout(()=>setExporting(null),400);
  };
  const doExportPrint = () => { window.print(); };

  const bdr = '1px solid #e0dbd0';
  const ZOOM_STEPS = [0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.25,1.5,1.75,2.0];
  const zoomIn  = () => { const n=ZOOM_STEPS.find(z=>z>zoom); if(n) setZoom(n); };
  const zoomOut = () => { const n=[...ZOOM_STEPS].reverse().find(z=>z<zoom); if(n) setZoom(n); };
  const btnS = act => ({ flex:1, background:act?'#e0dbd0':'#fff', color:act?'#a89878':'#1a1208', border:bdr, borderRadius:'6px', padding:'7px 3px', fontSize:'11px', cursor:act?'wait':'pointer', fontFamily:'inherit', fontWeight:'600' });

  // ノード種別トグルボタン
  const typeToggle = (type, label, active) => (
    <button onClick={()=>setNewNodeType(type)}
      style={{ flex:1, padding:'7px 4px', fontSize:'11.5px', fontWeight:'600', fontFamily:'inherit', cursor:'pointer', borderRadius:'6px',
        background: active ? (type==='question'?'#1a1208':'#5a9a40') : '#fff',
        color: active ? '#fff' : '#5a5040',
        border: active ? 'none' : bdr }}>
      {label}
    </button>
  );

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:DISPLAY_FONT, background:'#f7f5ef' }}>

      <div style={{ width:'360px', minWidth:'360px', background:'#faf9f5', borderRight:bdr, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        <div style={{ padding:'18px 20px', borderBottom:bdr, background:'#fff' }}>
          <p style={{ fontSize:'9px', color:'#a89878', letterSpacing:'0.18em', margin:'0 0 4px', fontFamily:'monospace' }}>「問いのフィールド」作成ツール</p>
          <h1 style={{ fontSize:'15px', fontWeight:'700', color:'#1a1208', margin:0, lineHeight:1.5 }}>
            ハスラーくん
            <span style={{ display:'block', fontSize:'11px', fontWeight:'400', color:'#7a7060', marginTop:'5px', lineHeight:1.6 }}>あなたもビリヤード法にレッツ・チャレンジ！</span>
          </h1>
        </div>

        {phase==='mapping' && (
          <div style={{ padding:'10px 16px', borderBottom:bdr, background:'#fff', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'11px', color:'#7a7060', whiteSpace:'nowrap' }}>文字</span>
              <input type="range" min="10" max="18" step="1" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{ flex:1 }}/>
              <span style={{ fontSize:'11px', color:'#1a1208', fontWeight:'600', minWidth:'26px', textAlign:'right' }}>{fontSize}px</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'11px', color:'#7a7060', whiteSpace:'nowrap' }}>拡縮</span>
              <button onClick={zoomOut} disabled={zoom<=ZOOM_STEPS[0]} style={{ width:'26px', height:'22px', border:bdr, borderRadius:'4px', background:'#fff', cursor:'pointer', fontSize:'14px', color:'#1a1208', padding:0 }}>−</button>
              <span style={{ flex:1, textAlign:'center', fontSize:'11px', fontWeight:'600', color:'#1a1208', fontFamily:'monospace' }}>{Math.round(zoom*100)}%</span>
              <button onClick={zoomIn} disabled={zoom>=ZOOM_STEPS[ZOOM_STEPS.length-1]} style={{ width:'26px', height:'22px', border:bdr, borderRadius:'4px', background:'#fff', cursor:'pointer', fontSize:'14px', color:'#1a1208', padding:0 }}>＋</button>
              <button onClick={()=>setZoom(1.0)} style={{ fontSize:'10px', color:'#7a7060', border:bdr, borderRadius:'4px', background:'#fff', cursor:'pointer', padding:'2px 6px', fontFamily:'inherit' }}>等倍</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'11px', color:'#7a7060', whiteSpace:'nowrap' }}>向き</span>
              <button onClick={()=>setOrient('landscape')}
                style={{ flex:1, padding:'4px', fontSize:'11px', fontWeight:'600', fontFamily:'inherit', cursor:'pointer', borderRadius:'5px',
                  background: orient==='landscape' ? '#1a1208' : '#fff',
                  color: orient==='landscape' ? '#fff' : '#5a5040',
                  border: orient==='landscape' ? 'none' : bdr }}>
                ↔ 横
              </button>
              <button onClick={()=>setOrient('portrait')}
                style={{ flex:1, padding:'4px', fontSize:'11px', fontWeight:'600', fontFamily:'inherit', cursor:'pointer', borderRadius:'5px',
                  background: orient==='portrait' ? '#1a1208' : '#fff',
                  color: orient==='portrait' ? '#fff' : '#5a5040',
                  border: orient==='portrait' ? 'none' : bdr }}>
                ↕ 縦
              </button>
            </div>
          </div>
        )}

        {phase==='input' ? (
          <div style={{ padding:'16px 18px', flex:1, display:'flex', flexDirection:'column', gap:'12px', overflowY:'auto' }}>
            <p style={{ fontSize:'12px', color:'#5a4e38', lineHeight:1.9, margin:0 }}>論文・レポートのテーマやキーワードを入力してください。</p>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&handleStart()}
              placeholder="例：日本の科学技術研究力の低下問題" rows={4}
              style={{ background:'#fff', border:bdr, borderRadius:'7px', padding:'10px 12px', color:'#1a1208', fontSize:'12px', resize:'vertical', lineHeight:1.7, width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
            <button onClick={handleStart} disabled={!input.trim()}
              style={{ background:input.trim()?'#1a1208':'#e0dbd0', color:input.trim()?'#fff':'#a89878', border:'none', borderRadius:'7px', padding:'10px', fontSize:'12.5px', cursor:input.trim()?'pointer':'not-allowed', fontWeight:'700', fontFamily:'inherit' }}>
              開始 →
            </button>
            <p style={{ fontSize:'10px', color:'#b0a890', margin:0 }}>Ctrl+Enter でも開始できます</p>
            <div style={{ borderTop:'1px solid #e8e4dc', paddingTop:'12px' }}>
              <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 6px' }}>保存済みマップを読み込む</p>
              <input ref={fileInputRef} type="file" accept=".md,.txt"
                onChange={handleImport} style={{ display:'none' }}/>
              <button onClick={()=>fileInputRef.current?.click()}
                style={{ width:'100%', background:'#fff', color:'#1a1208', border:bdr, borderRadius:'7px', padding:'9px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', fontWeight:'600' }}>
                Mermaidファイルを読み込む
              </button>
              {importErr && <p style={{ fontSize:'10.5px', color:'#c41a1a', margin:'6px 0 0', lineHeight:1.6 }}>{importErr}</p>}
            </div>
          </div>

        ) : addingToId ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'11px 15px', borderBottom:bdr, background:'#fffbf0' }}>
              <p style={{ fontSize:'9.5px', color:'#a89878', fontFamily:'monospace', margin:'0 0 4px' }}>追加先ノード</p>
              <p style={{ fontSize:'12px', fontWeight:'600', color:'#1a1208', margin:0, lineHeight:1.5 }}>{addingNode?.text}</p>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'10px 13px' }}>
              {/* 種別選択 */}
              <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 6px', fontWeight:'600' }}>① ノードの種類</p>
              <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                {typeToggle('question', '問い →', newNodeType==='question')}
                {typeToggle('answer',   '答え ……', newNodeType==='answer')}
              </div>

              {/* 問いのカテゴリ選択 */}
              {newNodeType==='question' && (
                <>
                  <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 6px', fontWeight:'600' }}>② ぶつける問いを選ぶ</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:'3px', marginBottom:'12px' }}>
                    {CATEGORIES.map(c => {
                      const active = selCat?.q === c.q;
                      return (
                        <button key={c.q} onClick={()=>setSelCat(c)}
                          style={{ textAlign:'left', padding:'6px 10px', borderRadius:'5px', cursor:'pointer', fontFamily:'inherit',
                            background:active?'#1a1208':'#fff', color:active?'#fff':'#1a1208',
                            border:active?'1px solid #1a1208':bdr, fontSize:'11.5px', lineHeight:1.4 }}>
                          <span style={{ fontWeight:'700' }}>{c.q}</span>
                          <span style={{ fontSize:'10px', color:active?'#ccc':'#a89878', marginLeft:'6px' }}>{c.cat}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selCat && (
                    <div style={{ padding:'7px 10px', background:'#fffbf0', border:'1px solid #e8d070', borderRadius:'6px', fontSize:'11px', color:'#6a5820', marginBottom:'10px', lineHeight:1.7 }}>
                      💡 {selCat.hint}
                    </div>
                  )}
                </>
              )}

              {/* テキスト入力 */}
              {(newNodeType==='answer' || selCat) && (
                <>
                  <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 6px', fontWeight:'600' }}>
                    {newNodeType==='question' ? '③ 問いを書く' : '② 答えを書く'}
                  </p>
                  <textarea value={inputText} onChange={e=>setInputText(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&handleAddNode()}
                    placeholder={newNodeType==='question' ? `「${selCat?.q}」の観点から問いを書いてください` : '答えや仮説を書いてください'}
                    rows={3}
                    style={{ background:'#fff', border:bdr, borderRadius:'7px', padding:'9px 11px', color:'#1a1208', fontSize:'12px', resize:'vertical', lineHeight:1.7, width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'8px' }}/>
                  <button onClick={handleAddNode} disabled={!inputText.trim()}
                    style={{ width:'100%', background:inputText.trim()?'#1a1208':'#e0dbd0', color:inputText.trim()?'#fff':'#a89878', border:'none', borderRadius:'7px', padding:'9px', fontSize:'12px', cursor:inputText.trim()?'pointer':'not-allowed', fontWeight:'700', fontFamily:'inherit', marginBottom:'6px' }}>
                    ノードに追加 →
                  </button>
                </>
              )}
            </div>

            <div style={{ padding:'10px 13px', borderTop:bdr, background:'#faf9f5' }}>
              <button onClick={handleCancelAdd}
                style={{ width:'100%', background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

        ) : (
          <>
            {selNode && (
              <div style={{ padding:'11px 15px', borderBottom:bdr, background:'#fff' }}>
                <p style={{ fontSize:'9.5px', color:'#a89878', fontFamily:'monospace', margin:'0 0 5px', letterSpacing:'0.1em' }}>選択中のノード</p>
                {/* 種別バッジ */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                  <span style={{ fontSize:'10.5px', padding:'2px 10px', borderRadius:'20px', fontWeight:'700',
                    background: selNode.nodeType==='answer' ? '#e8ffe0' : '#f0f0f0',
                    color: selNode.nodeType==='answer' ? '#3a7020' : '#5a5040',
                    border: selNode.nodeType==='answer' ? '1px solid #5a9a40' : '1px solid #d0d0d0' }}>
                    {selNode.nodeType==='answer' ? '答え' : '問い'}
                  </span>
                  {selNode.depth > 0 && (
                    <button onClick={()=>handleToggleType(selId)}
                      style={{ fontSize:'10px', color:'#7a7060', border:bdr, borderRadius:'5px', background:'#fff', cursor:'pointer', padding:'2px 8px', fontFamily:'inherit' }}>
                      切り替え
                    </button>
                  )}
                </div>
                {selNode.questionType && selNode.nodeType==='question' && (
                  <p style={{ fontSize:'10.5px', color:QCOLS[selNode.depth%QCOLS.length].badge, margin:'0 0 5px', fontFamily:'monospace', fontWeight:'700' }}>
                    [{selNode.questionType}] {selNode.category}
                  </p>
                )}
                {/* テキスト表示 or 編集フォーム */}
                {editingId === selId ? (
                  <>
                    {/* 問いノードの場合：カテゴリ変更 */}
                    {selNode.nodeType === 'question' && (
                      <>
                        <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 5px', fontWeight:'600' }}>問いの種類</p>
                        <div style={{ display:'flex', flexDirection:'column', gap:'3px', marginBottom:'10px', maxHeight:'160px', overflowY:'auto', border:bdr, borderRadius:'6px', padding:'4px' }}>
                          {CATEGORIES.map(c => {
                            const active = editText !== undefined && (selNode.questionType === c.q);
                            const isSel2 = editCat ? editCat.q === c.q : selNode.questionType === c.q;
                            return (
                              <button key={c.q} onClick={()=>setEditCat(c)}
                                style={{ textAlign:'left', padding:'5px 8px', borderRadius:'4px', cursor:'pointer', fontFamily:'inherit',
                                  background: isSel2 ? '#1a1208' : '#fff',
                                  color: isSel2 ? '#fff' : '#1a1208',
                                  border: isSel2 ? '1px solid #1a1208' : '1px solid transparent',
                                  fontSize:'11px', lineHeight:1.4 }}>
                                <span style={{ fontWeight:'700' }}>{c.q}</span>
                                <span style={{ fontSize:'9.5px', color: isSel2?'#ccc':'#a89878', marginLeft:'5px' }}>{c.cat}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 5px', fontWeight:'600' }}>テキスト</p>
                    <textarea value={editText} onChange={e=>setEditText(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&handleCommitEdit()}
                      rows={3} autoFocus
                      style={{ background:'#fff', border:'1.5px solid #1677ff', borderRadius:'6px', padding:'8px 10px', color:'#1a1208', fontSize:'12px', resize:'vertical', lineHeight:1.7, width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'7px' }}/>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={handleCommitEdit} disabled={!editText.trim()}
                        style={{ flex:1, background:editText.trim()?'#1a1208':'#e0dbd0', color:editText.trim()?'#fff':'#a89878', border:'none', borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:editText.trim()?'pointer':'not-allowed', fontWeight:'700', fontFamily:'inherit' }}>
                        確定
                      </button>
                      <button onClick={handleCancelEdit}
                        style={{ flex:1, background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                        戻る
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'6px' }}>
                    <p style={{ flex:1, fontSize:'12.5px', lineHeight:1.75, color:'#1a1208', margin:0 }}>{selNode.text}</p>
                    <button onClick={()=>handleStartEdit(selId)}
                      style={{ flexShrink:0, fontSize:'10px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'5px', background:'#e6f4ff', cursor:'pointer', padding:'2px 8px', fontFamily:'inherit', whiteSpace:'nowrap', marginTop:'2px' }}>
                      編集
                    </button>
                  </div>
                )}
              </div>
            )}
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
              <div style={{ padding:'12px 14px', background:'#fffcf0', border:'1px solid #e8d070', borderRadius:'7px', fontSize:'11px', color:'#5a4810', lineHeight:2.1 }}>
                <strong style={{ color:'#8a6800', display:'block', marginBottom:'4px' }}>操作方法</strong>
                <span style={{ color:'#888' }}>[+]</span> 子ノードを追加<br/>
                <span style={{ color:'#888' }}>[▼/▶]</span> 折りたたみ／展開<br/>
                <span style={{ color:'#888' }}>[✕]</span> ノードを削除<br/>
                <span style={{ color:'#888' }}>切り替え</span> 問い↔答えを変更<br/>
                <span style={{ display:'block', marginTop:'6px', paddingTop:'6px', borderTop:'1px solid #e8d070' }}>
                  <span style={{ color:'#888' }}>編集</span> テキストを修正<br/>
                  　問いノードは種類も変更可<br/>
                  　Ctrl+Enter で確定
                </span>
              </div>
            </div>
            <div style={{ padding:'10px 13px', borderTop:bdr, background:'#faf9f5' }}>
              <p style={{ fontSize:'9.5px', color:'#a89878', margin:'0 0 6px', fontFamily:'monospace', letterSpacing:'0.1em' }}>書き出し・読み込み</p>
              <div style={{ display:'flex', gap:'5px', marginBottom:'5px' }}>
                <button onClick={doExportSVG} disabled={!!exporting} style={btnS(exporting==='svg')}>{exporting==='svg'?'処理中…':'SVG'}</button>
                <button onClick={doExportPNG} disabled={!!exporting} style={btnS(exporting==='png')}>{exporting==='png'?'処理中…':'PNG'}</button>
                <button onClick={doExportMermaid} disabled={!!exporting} style={btnS(exporting==='md')}>{exporting==='md'?'処理中…':'Mermaid'}</button>
              </div>
              <div style={{ display:'flex', gap:'5px', marginBottom:'5px' }}>
                <button onClick={doExportSummaryMD} disabled={!!exporting} style={btnS(exporting==='summary')}>{exporting==='summary'?'処理中…':'表・樹形図 MD'}</button>
                <button onClick={doExportPrint} disabled={!!exporting} style={btnS(false)}>印刷／PDF</button>
              </div>
              <input ref={fileInputRef2} type="file" accept=".md,.txt"
                onChange={handleImport} style={{ display:'none' }}/>
              <button onClick={()=>fileInputRef2.current?.click()}
                style={{ width:'100%', background:'#fff', color:'#1677ff', border:'1px solid #91caff', borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit', fontWeight:'600', marginBottom:'5px' }}>
                Mermaidを読み込む
              </button>
              {importErr && <p style={{ fontSize:'10px', color:'#c41a1a', margin:'0 0 5px', lineHeight:1.6 }}>{importErr}</p>}
              <button onClick={()=>{ setPhase('input'); setRoot(null); setSelId(null); setAddingToId(null); setSelCat(null); setInputText(''); setZoom(1.0); }}
                style={{ width:'100%', background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                リセット
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ flex:1, overflow:'auto' }}>
        <MindMap root={root} selId={selId} addingToId={addingToId}
          fs={fontSize} zoom={zoom} orient={orient}
          onSelect={handleSelect} onOpenAdd={handleOpenAdd} onCollapse={handleCollapse} onDelete={handleDelete}
          svgRef={svgRef}/>
      </div>

      {/* 右ペイン：折りたたみ可能 */}
      <div style={{ width: rightOpen ? '260px' : '32px', minWidth: rightOpen ? '260px' : '32px', background:'#faf9f5', borderLeft:bdr, display:'flex', flexDirection:'column', overflow:'hidden', transition:'width 0.2s, min-width 0.2s' }}>
        <div style={{ padding: rightOpen ? '13px 15px' : '13px 0', borderBottom:bdr, background:'#fff', display:'flex', alignItems:'center', justifyContent: rightOpen ? 'space-between' : 'center', gap:'8px' }}>
          {rightOpen && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0 }}>
              <p style={{ fontSize:'12px', fontWeight:'700', color:'#1a1208', margin:0, whiteSpace:'nowrap' }}>使い方</p>
              <a href="https://u-labo.org/md/hassler_manual.html" target="_blank" rel="noreferrer"
                style={{ fontSize:'10px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'5px', background:'#e6f4ff', padding:'2px 8px', textDecoration:'none', whiteSpace:'nowrap' }}>
                マニュアル ↗
              </a>
            </div>
          )}
          <button onClick={()=>setRightOpen(v=>!v)}
            style={{ width:'22px', height:'22px', border:bdr, borderRadius:'4px', background:'#fff', cursor:'pointer', fontSize:'12px', color:'#7a7060', padding:0, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {rightOpen ? '›' : '‹'}
          </button>
        </div>
        {rightOpen && (
          <div style={{ flex:1, overflowY:'auto', padding:'13px 15px', display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ padding:'11px 13px', background:'#fffcf0', border:'1px solid #e8d070', borderRadius:'7px', fontSize:'11px', color:'#5a4810', lineHeight:2.05 }}>
              <strong style={{ color:'#8a6800', display:'block', marginBottom:'4px' }}>「問いのフィールド」を作ろう</strong>
              ①トピックを入力して開始<br/>
              ②ノード右端の[+]をクリック<br/>
              ③問いか答えかを選ぶ<br/>
              ④問いならカテゴリを選択<br/>
              ⑤テキストを入力して追加<br/>
              <span style={{ color:'#8a6800', marginTop:'6px', display:'block', borderTop:'1px solid #e8d070', paddingTop:'6px' }}>
                問い→問い：矢印（→）<br/>
                問い→答え：点線（……）
              </span>
            </div>
            <div style={{ padding:'11px 13px', background:'#f0f5ff', border:'1px solid #adc6ff', borderRadius:'7px', fontSize:'11px', color:'#1d39c4', lineHeight:1.9 }}>
              <strong style={{ color:'#1d39c4', display:'block', marginBottom:'5px' }}>ビリヤード法とは</strong>
              <span style={{ color:'#3a4a80' }}>
                論文テーマに「本当に？」「なぜ？」「どういう意味？」など18種類の問いを次々とぶつけ、新しい問いを取りだしていく思考法。<br/><br/>
                ビリヤードの玉が当たって新たな玉が動くように、問いが問いを生み、<strong>「問いのフィールド」</strong>を広げていく。
              </span>
              <span style={{ fontSize:'10px', color:'#5a6a90', marginTop:'8px', display:'block', borderTop:'1px solid #c0cce8', paddingTop:'7px' }}>
                出典：戸田山和久（2022）<br/>『最新版 論文の教室』138頁
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
