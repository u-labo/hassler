import { useState, useRef, useEffect } from "react";

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

// ── 自動保存（このブラウザの localStorage にだけ保存。外部には送信しない）
const STORAGE_KEY = 'hassler.autosave.v1';
const HISTORY_MAX = 10; // 元に戻せる回数（再読み込み後も同じだけ残る）
const isTree = (n) => !!n?.id && Array.isArray(n.children);
const isLink = (l) => !!l?.id && !!l.from && !!l.to;
const isGroup = (g) => !!g?.id && !!g.parentId && Array.isArray(g.childIds);
// マップ（doc）＝ 木（root）＋ 関係線（links）＋ 波かっこ（groups）。古い保存データ（木だけ等）もここで doc に揃える
const EMPTY_DOC = { root: null, links: [], groups: [] };
const toDoc = (x) => {
  if (isTree(x)) return { root: x, links: [], groups: [] };
  if (isTree(x?.root)) return {
    root: x.root,
    links:  (Array.isArray(x.links)  ? x.links  : []).filter(isLink),
    groups: (Array.isArray(x.groups) ? x.groups : []).filter(isGroup),
  };
  return null;
};
const loadSaved = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const doc = toDoc(data); if (!doc) return null;
    const past   = (Array.isArray(data.past)   ? data.past   : []).map(toDoc).filter(Boolean).slice(-HISTORY_MAX);
    const future = (Array.isArray(data.future) ? data.future : []).map(toDoc).filter(Boolean).slice(0, HISTORY_MAX);
    // 復元したIDと新規IDが衝突しないよう、採番カウンタを最大値まで進める
    // （「元に戻す」「やり直す」で履歴中のノードや関係線が戻ってくるので、履歴も含めて走査する）
    const bump = id => { const m = /^n(\d+)$/.exec(id); if (m) _id = Math.max(_id, Number(m[1])); };
    const walk = n => { bump(n.id); n.children.forEach(walk); };
    for (const d of [doc, ...past, ...future]) { walk(d.root); d.links.forEach(l => bump(l.id)); d.groups.forEach(g => bump(g.id)); }
    return { ...data, ...doc, past, future };
  } catch { return null; }
};
const writeSaved = (data) => {
  try {
    if (!data) { localStorage.removeItem(STORAGE_KEY); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    // 容量超過なら取り消し履歴を捨て、マップ本体の保存を優先する
    catch { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, past: [], future: [] })); }
  } catch { /* プライベートモード等では保存しない */ }
};
const SAVED = loadSaved();

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
const findParent = (root, id) => {
  if (!root) return null;
  if (root.children.some(c => c.id === id)) return root;
  for (const c of root.children) { const f = findParent(c, id); if (f) return f; }
  return null;
};
const isParentChild = (root, a, b) =>
  !!findNode(root, a)?.children.some(c => c.id === b) || !!findNode(root, b)?.children.some(c => c.id === a);
// 消えたノードにつながる関係線・波かっこを片付ける（波かっこは消えた子を外し、空になったら消す）
const pruneDoc = (doc) => {
  if (!doc.root) return { ...doc, links: [], groups: [] };
  const ids = new Set();
  const walk = n => { ids.add(n.id); n.children.forEach(walk); };
  walk(doc.root);
  const links = doc.links.filter(l => ids.has(l.from) && ids.has(l.to));
  const groups = doc.groups
    .map(g => g.childIds.every(id => ids.has(id)) ? g : { ...g, childIds: g.childIds.filter(id => ids.has(id)) })
    .filter(g => ids.has(g.parentId) && g.childIds.length);
  const same = links.length === doc.links.length && groups.length === doc.groups.length && groups.every((g, i) => g === doc.groups[i]);
  return same ? doc : { ...doc, links, groups };
};
const countLeaves = (n) =>(!n.children.length || n.collapsed) ? 1 : n.children.reduce((s, c) => s + countLeaves(c), 0);

// 関係線・線のラベル・波かっこがあるマップは、ラベルを置けるよう深さ方向のすきまを広げる
const hasLineDecor = ({ root, links, groups }) => {
  if (links.length || groups.length) return true;
  const walk = n => !!n.edgeLabel || n.children.some(walk);
  return !!root && walk(root);
};
const layoutFor = (doc, fs, orient) => {
  const wide = hasLineDecor(doc);
  return orient === 'portrait'
    ? layoutTreePortrait(doc.root, fs, !wide ? PVG : doc.groups.length ? 120 : 84)
    : layoutTree(doc.root, fs, wide ? 150 : HG);
};
// 波かっこのラベルは端の列・段の外にはみ出すので、その分キャンバスを広げる
const mapBounds = (doc, pos, fs, orient) => {
  const b = getTreeBounds(pos, fs, orient);
  if (!doc.groups.length) return b;
  return orient === 'portrait' ? { w: b.w, h: b.h + 90 } : { w: b.w + 130, h: b.h };
};

// ランドスケープ（左→右）
const layoutTree = (root, fs, hg = HG) => {
  const pos = new Map();
  const nh = nodeH(fs), vg = vgap(fs);
  const place = (node, d, sy) => {
    const l = countLeaves(node);
    pos.set(node.id, { x: d * (NW + hg), y: sy + (l * (nh + vg) - vg) / 2 - nh / 2 });
    if (node.collapsed) return;
    let y = sy;
    for (const c of node.children) { const cl = countLeaves(c); place(c, d + 1, y); y += cl * (nh + vg); }
  };
  if (root) place(root, 0, 0);
  return pos;
};

// ポートレイト（上→下）
const PVG = 52; // 深さ方向の縦ギャップ
const layoutTreePortrait = (root, fs, pvg = PVG) => {
  const pos = new Map();
  const nh = nodeH(fs);
  const hg = NW + 14; // 横方向の葉ギャップ
  const place = (node, d, sx) => {
    const l = countLeaves(node);
    const tw = l * hg - 14;
    pos.set(node.id, { x: sx + tw / 2 - NW / 2, y: d * (nh + pvg) });
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

// reserveR: 右端にボタン列がある場合（画面表示のみ）、その幅だけ本文の折り返し幅を狭める
const calcLayout = (node, fs, font, reserveR = 0) => {
  const badgeFs = Math.max(9, fs - 3);
  const lineH = fs + 7;
  const nh = nodeH(fs);
  const isAnswer = node.nodeType === 'answer';
  // answer nodes: show "答え" badge; question nodes with category: show category
  const hasBadge = isAnswer || !!node.questionType;
  const badgeText = isAnswer ? '答え' : (node.questionType ? `${node.questionType}｜${node.category}` : '');
  const badgeH = hasBadge ? badgeFs + 9 : 0;
  const badgeGap = hasBadge ? 10 : 0;
  const lines = wrapMeasured(node.text, NW - 22 - reserveR, fs, font);
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

// ── 線の形（画面表示と書き出しで共通）
const bezier = (a, b, c, d) => ({
  d: `M${a[0]},${a[1]}C${b[0]},${b[1]} ${c[0]},${c[1]} ${d[0]},${d[1]}`,
  mid: [(a[0] + 3*b[0] + 3*c[0] + d[0]) / 8, (a[1] + 3*b[1] + 3*c[1] + d[1]) / 8],
});
// 木の線：親 → 子
const treeEdgeGeom = (p, q, nh, orient) => {
  if (orient === 'portrait') {
    const x1=p.x+CANVAS_PAD+NW/2, y1=p.y+CANVAS_PAD+nh;
    const x2=q.x+CANVAS_PAD+NW/2, y2=q.y+CANVAS_PAD;
    const my=(y1+y2)/2;
    return bezier([x1,y1], [x1,my], [x2,my], [x2,y2]);
  }
  const x1=p.x+CANVAS_PAD+NW, y1=p.y+CANVAS_PAD+nh/2;
  const x2=q.x+CANVAS_PAD,    y2=q.y+CANVAS_PAD+nh/2;
  const mx=(x1+x2)/2;
  return bezier([x1,y1], [mx,y1], [mx,y2], [x2,y2]);
};
// 関係線：任意のノード同士。同じ列（横向き）／同じ段（縦向き）なら外側に膨らむ弧、それ以外は向かい合う辺どうしを結ぶ
const linkGeom = (p, q, nh, orient) => {
  const ax=p.x+CANVAS_PAD, ay=p.y+CANVAS_PAD, bx=q.x+CANVAS_PAD, by=q.y+CANVAS_PAD;
  if (orient === 'portrait') {
    if (Math.abs(ay - by) < nh) {
      const base = Math.max(ay, by) + nh, bulge = Math.min(48, 24 + Math.abs(ax - bx) * 0.08);
      return bezier([ax+NW/2, ay+nh], [ax+NW/2, base+bulge], [bx+NW/2, base+bulge], [bx+NW/2, by+nh]);
    }
    const down = by > ay, y1 = down ? ay+nh : ay, y2 = down ? by : by+nh, my = (y1+y2)/2;
    return bezier([ax+NW/2, y1], [ax+NW/2, my], [bx+NW/2, my], [bx+NW/2, y2]);
  }
  if (Math.abs(ax - bx) < NW) {
    const base = Math.max(ax, bx) + NW, bulge = Math.min(64, 24 + Math.abs(ay - by) * 0.08);
    return bezier([ax+NW, ay+nh/2], [base+bulge, ay+nh/2], [base+bulge, by+nh/2], [bx+NW, by+nh/2]);
  }
  const right = bx > ax, x1 = right ? ax+NW : ax, x2 = right ? bx : bx+NW, mx = (x1+x2)/2;
  return bezier([x1, ay+nh/2], [mx, ay+nh/2], [mx, by+nh/2], [x2, by+nh/2]);
};
const LINK_COL = '#6b6358';
// 線に添えるラベル（角丸の札）。長すぎるものは…で省略
const LABEL_MAX_W = 180;
const labelBox = (text, fs, font) => {
  const lfs = Math.max(9, fs - 2);
  const c = getCtx2d(); c.font = `${lfs}px ${font}`;
  let t = text;
  if (c.measureText(t).width > LABEL_MAX_W) {
    while (t.length > 1 && c.measureText(t + '…').width > LABEL_MAX_W) t = t.slice(0, -1);
    t += '…';
  }
  return { t, lfs, w: Math.round(c.measureText(t).width + 14), h: lfs + 9 };
};
// 木の線と関係線のラベルを集め、重なったものは下にずらして配置する（画面表示と書き出しで共通）
const placeLabels = (root, links, pos, fs, orient, font) => {
  const nh = nodeH(fs), out = [];
  const walk = n => {
    if (n.collapsed) return;
    for (const c of n.children) {
      const p = pos.get(n.id), q = pos.get(c.id);
      if (c.edgeLabel && p && q) out.push({ key: `e-${c.id}`, text: c.edgeLabel, mid: treeEdgeGeom(p, q, nh, orient).mid, edgeOf: c });
      walk(c);
    }
  };
  if (root) walk(root);
  for (const l of links) {
    const p = pos.get(l.from), q = pos.get(l.to);
    if (l.label && p && q) out.push({ key: `l-${l.id}`, text: l.label, mid: linkGeom(p, q, nh, orient).mid, link: l });
  }
  const placed = [];
  for (const o of out) {
    const { w, h } = labelBox(o.text, fs, font);
    let [x, y] = o.mid;
    for (let i = 0; i < 8 && placed.some(r => Math.abs(r.x - x) < (r.w + w) / 2 + 2 && Math.abs(r.y - y) < (r.h + h) / 2 + 2); i++) y += h + 3;
    placed.push({ x, y, w, h });
    o.mid = [x, y];
  }
  return out;
};
const labelSVG = (text, mid, fs, stroke, color) => {
  const { t, lfs, w, h } = labelBox(text, fs, EXPORT_FONT);
  return `<g><rect x="${(mid[0]-w/2).toFixed(1)}" y="${(mid[1]-h/2).toFixed(1)}" width="${w}" height="${h}" rx="${h/2}" fill="#fffdf8" stroke="${stroke}" stroke-width="1"/>`
    + `<text x="${mid[0].toFixed(1)}" y="${(mid[1]+lfs*0.36).toFixed(1)}" text-anchor="middle" font-size="${lfs}" fill="${color}" font-family="${EXPORT_FONT}">${escXML(t)}</text></g>`;
};

// ── 波かっこ：同じ親の子ノードの並び（childIds）の外側に付ける。横向きは右側、縦向きは下側
const GROUP_COL = '#8a7a5a';
const groupGeom = (group, pos, nh, fs, orient, font) => {
  const ps = group.childIds.map(id => pos.get(id)).filter(Boolean);
  if (!ps.length) return null;
  const w = 12, h = w / 2, off = 10;
  const lfs = Math.max(9, fs - 1), lineH = lfs + 4;
  if (orient === 'portrait') {
    const x1 = Math.min(...ps.map(p => p.x)) + CANVAS_PAD + 6, x2 = Math.max(...ps.map(p => p.x)) + CANVAS_PAD + NW - 6;
    const y0 = Math.max(...ps.map(p => p.y)) + CANVAS_PAD + nh + off, xm = (x1 + x2) / 2, r = Math.min(10, (x2 - x1) / 4);
    const lines = group.label ? wrapMeasured(group.label, 220, lfs, font) : [];
    return {
      d: `M${x1},${y0}Q${x1},${y0+h} ${x1+r},${y0+h}L${xm-r},${y0+h}Q${xm},${y0+h} ${xm},${y0+w}Q${xm},${y0+h} ${xm+r},${y0+h}L${x2-r},${y0+h}Q${x2},${y0+h} ${x2},${y0}`,
      lfs, anchor: 'middle',
      texts: lines.map((t, i) => ({ t, x: xm, y: y0 + w + 4 + lfs + i * lineH })),
      hit: { x: x1, y: y0 - 2, w: x2 - x1, h: w + 8 + lines.length * lineH },
    };
  }
  const y1 = Math.min(...ps.map(p => p.y)) + CANVAS_PAD + 6, y2 = Math.max(...ps.map(p => p.y)) + CANVAS_PAD + nh - 6;
  const x0 = ps[0].x + CANVAS_PAD + NW + off, ym = (y1 + y2) / 2, r = Math.min(10, (y2 - y1) / 4);
  const lines = group.label ? wrapMeasured(group.label, 110, lfs, font) : [];
  const ty0 = ym - (lines.length * lineH) / 2 + lfs - 1;
  return {
    d: `M${x0},${y1}Q${x0+h},${y1} ${x0+h},${y1+r}L${x0+h},${ym-r}Q${x0+h},${ym} ${x0+w},${ym}Q${x0+h},${ym} ${x0+h},${ym+r}L${x0+h},${y2-r}Q${x0+h},${y2} ${x0},${y2}`,
    lfs, anchor: 'start',
    texts: lines.map((t, i) => ({ t, x: x0 + w + 6, y: ty0 + i * lineH })),
    hit: { x: x0 - 2, y: y1, w: w + 12 + 112, h: y2 - y1 },
  };
};
const groupSVG = (g, pos, nh, fs, orient) => {
  const gg = groupGeom(g, pos, nh, fs, orient, EXPORT_FONT); if (!gg) return '';
  return `<path d="${gg.d}" fill="none" stroke="${GROUP_COL}" stroke-width="1.6" stroke-linejoin="round"/>`
    + gg.texts.map(o => `<text x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" text-anchor="${gg.anchor}" font-size="${gg.lfs}" fill="#3a3428" font-family="${EXPORT_FONT}">${escXML(o.t)}</text>`).join('');
};

// ── SVG export (clean, no buttons)
const buildExportSVG = (doc, fs, zoom, orient = 'landscape') => {
  const { root, links, groups } = doc;
  if (!root) return null;
  const pos = layoutFor(doc, fs, orient);
  const nh = nodeH(fs);
  const { w: nw, h: nh2 } = mapBounds(doc, pos, fs, orient);
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
          const { d } = treeEdgeGeom(p, q, nh, orient);
          const dash = isAns ? ' stroke-dasharray="7,4"' : '';
          const marker = isAns ? '' : ' marker-end="url(#arrow)"';
          edgeParts.push(`<path d="${d}" fill="none" stroke="${ec.border}" stroke-width="2" opacity="0.6"${dash}${marker}/>`);
        }
        walk(c);
      }
    }
  };
  walk(root);
  for (const l of links) {
    const p = pos.get(l.from), q = pos.get(l.to);
    if (!p || !q) continue;
    const { d } = linkGeom(p, q, nh, orient);
    edgeParts.push(`<path d="${d}" fill="none" stroke="${LINK_COL}" stroke-width="1.6"${l.arrow ? ' marker-end="url(#linkhead)"' : ''}/>`);
  }
  for (const g of groups) edgeParts.push(groupSVG(g, pos, nh, fs, orient));
  const labelParts = placeLabels(root, links, pos, fs, orient, EXPORT_FONT).map(o => o.edgeOf
    ? labelSVG(o.text, o.mid, fs, getNodeCol(o.edgeOf).border, getNodeCol(o.edgeOf).badge)
    : labelSVG(o.text, o.mid, fs, LINK_COL, '#3a3428'));
  const arrowDef = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#888"/></marker>`
    + `<marker id="linkhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${LINK_COL}"/></marker></defs>`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">\n${arrowDef}\n<rect width="${svgW}" height="${svgH}" fill="#f7f5ef"/>\n<g transform="scale(${zoom})">\n${edgeParts.join('\n')}\n${nodeParts.join('\n')}\n${labelParts.join('\n')}\n</g>\n</svg>`;
  return { svg, width: svgW, height: svgH };
};

// 木の線：問い --> / 答え -.->、関係線：矢印なし --- / 矢印あり ==>。線のラベルは -->|"ラベル"| の形
// 波かっこは subgraph として書き出す（Mermaid上では枠で囲んだ表示になる）
const buildMermaid = ({ root, links, groups }, orient = 'landscape') => {
  if (!root) return '';
  const dir = orient === 'portrait' ? 'TD' : 'LR';
  const esc = s => String(s).replace(/"/g,'#quot;').replace(/\\/g,'\\\\');
  const lbl = s => s ? `|"${esc(s)}"|` : '';
  const edgeLines=[], nodeLines=[], styleLines=[];
  const shown = new Set();
  const walk = (n) => {
    shown.add(n.id);
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
        edgeLines.push(`  ${n.id} ${c.nodeType === 'answer' ? '-.->' : '-->'}${lbl(c.edgeLabel)} ${c.id}`);
        walk(c);
      }
    }
  };
  walk(root);
  for (const l of links) {
    if (!shown.has(l.from) || !shown.has(l.to)) continue;
    styleLines.push(`  linkStyle ${edgeLines.length} stroke:${LINK_COL},stroke-width:1.5px`);
    edgeLines.push(`  ${l.from} ${l.arrow ? '==>' : '---'}${lbl(l.label)} ${l.to}`);
  }
  const groupLines = groups.filter(g => g.childIds.every(id => shown.has(id))).flatMap((g, i) => [
    `  subgraph grp${i + 1}["${esc(g.label || ' ')}"]`, ...g.childIds.map(id => `    ${id}`), '  end',
  ]);
  return ['```mermaid',`flowchart ${dir}`,...nodeLines,...edgeLines,...groupLines,...styleLines,'```'].join('\n');
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
};

// ── Mermaid インポート（戻り値は { root, links }）
const parseMermaid = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 問いノード: n1["label"]  答えノード: n1("label")
  const qNodeRe = /^(n\d+)\["(.+)"\]$/;
  const aNodeRe = /^(n\d+)\("(.+)"\)$/;
  // 線: n1 --> n2 / n1 -.-> n2（木）、n1 --- n2 / n1 ==> n2（関係線）。いずれも -->|"ラベル"| でラベル付き
  const edgeRe  = /^(n\d+)\s+(-->|-\.->|---|==>)(?:\|"(.*)"\|)?\s+(n\d+)$/;
  const decode  = s => s.replace(/#quot;/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

  const rawNodes  = new Map();
  const edges     = [];
  const rawLinks  = [];
  const rawGroups = [];
  let curGroup = null;

  for (const line of lines) {
    const gm = line.match(/^subgraph\s+\S+?\["(.*)"\]$/);
    if (gm) { curGroup = { label: decode(gm[1]).trim(), members: [] }; rawGroups.push(curGroup); continue; }
    if (line === 'end') { curGroup = null; continue; }
    if (curGroup && /^n\d+$/.test(line)) { curGroup.members.push(line); continue; }
    const qm = line.match(qNodeRe);
    if (qm) { rawNodes.set(qm[1], { nodeType: 'question', label: qm[2] }); continue; }
    const am = line.match(aNodeRe);
    if (am) { rawNodes.set(am[1], { nodeType: 'answer',   label: am[2] }); continue; }
    const em = line.match(edgeRe);
    if (!em) continue;
    const label = em[3] ? decode(em[3]).trim() : '';
    if (em[2] === '---' || em[2] === '==>') rawLinks.push({ from: em[1], to: em[4], label, arrow: em[2] === '==>' });
    else edges.push({ from: em[1], to: em[4], label });
  }

  if (rawNodes.size === 0) return null;

  const childSet  = new Set(edges.map(e => e.to));
  const rootCands = [...rawNodes.keys()].filter(id => !childSet.has(id));
  if (rootCands.length === 0) return null;
  const rootId    = rootCands[0];

  const childrenMap = new Map();
  const edgeLabels  = new Map();
  for (const { from, to, label } of edges) {
    if (!childrenMap.has(from)) childrenMap.set(from, []);
    childrenMap.get(from).push(to);
    if (label) edgeLabels.set(to, label);
  }

  const parseLabel = (label, nodeType) => {
    // \n は書き出し時に \\n として埋め込まれている
    const decoded = decode(label);
    if (nodeType === 'answer') {
      const m = decoded.match(/^【答え】\n(.+)$/s);
      return { questionType: null, category: null, text: (m ? m[1] : decoded).trim() };
    }
    const m = decoded.match(/^【(.+?)｜(.+?)】\n(.+)$/s);
    if (m) return { questionType: m[1], category: m[2], text: m[3].trim() };
    return { questionType: null, category: null, text: decoded.trim() };
  };

  const idMap = new Map(); // ファイル内のID → 新しく振ったID
  const buildNode = (id, depth) => {
    const raw = rawNodes.get(id); if (!raw || idMap.has(id)) return null;
    const newId = uid(); idMap.set(id, newId);
    const { questionType, category, text } = parseLabel(raw.label, raw.nodeType);
    const children = (childrenMap.get(id) || []).map(cid => buildNode(cid, depth + 1)).filter(Boolean);
    const node = { id: newId, text, nodeType: raw.nodeType, questionType, category, children, explored: children.length > 0, collapsed: false, depth };
    if (edgeLabels.has(id)) node.edgeLabel = edgeLabels.get(id);
    return node;
  };

  const root = buildNode(rootId, 0);
  const links = rawLinks
    .filter(l => idMap.has(l.from) && idMap.has(l.to))
    .map(l => ({ id: uid(), from: idMap.get(l.from), to: idMap.get(l.to), label: l.label, arrow: l.arrow }));
  // 波かっこ：同じ親の子に限り、その親の子の並び順で連続した範囲に整える
  const groups = [];
  for (const rg of rawGroups) {
    const ids = rg.members.map(id => idMap.get(id)).filter(Boolean);
    const parent = ids.length ? findParent(root, ids[0]) : null;
    if (!parent) continue;
    const idx = parent.children.map((c, i) => ids.includes(c.id) ? i : -1).filter(i => i >= 0);
    if (!idx.length) continue;
    groups.push({ id: uid(), parentId: parent.id, label: rg.label,
      childIds: parent.children.slice(Math.min(...idx), Math.max(...idx) + 1).map(c => c.id) });
  }
  return { root, links, groups };
};

// ── Interactive node
function NodeBox({ node, pos, fs, selId, addingToId, markedIds, onSelect, onOpenAdd, onCollapse, onDelete }) {
  const p = pos.get(node.id); if (!p) return null;
  const nh = nodeH(fs);
  const col = getNodeCol(node);
  const isSel = node.id === selId || !!markedIds?.includes(node.id);
  const isAdding = node.id === addingToId;
  const isAnswer = node.nodeType === 'answer';
  const btnSz = Math.round(fs * 1.45 + 3);
  const hasChildren = node.children.length > 0;
  const hasDelete = node.depth > 0;

  // ボタン配置：右端に縦一列で [+]（下に「追加」ラベル）→ [▼/▶]（子ありのみ）→ [✕]（深さ1以上）
  // 本文はボタン列の手前で折り返すので、ボタンと文章が重ならない
  const btnX = NW - btnSz - 7;
  const LABEL_H = 14, BTN_GAP = 4;
  const stackH = btnSz + LABEL_H + (hasChildren ? BTN_GAP + btnSz : 0) + (hasDelete ? BTN_GAP + btnSz : 0);
  const addBtnY = (nh - stackH) / 2;
  const colBtnY = addBtnY + btnSz + LABEL_H + BTN_GAP;
  const delBtnY = hasChildren ? colBtnY + btnSz + BTN_GAP : colBtnY;
  const { badgeFs, lineH, lines, hasBadge, badgeText, badgeY, textY0 } = calcLayout(node, fs, DISPLAY_FONT, btnSz + 4);

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
      <g transform={`translate(${btnX},${addBtnY})`} style={{ cursor:'pointer' }}
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
      {hasChildren && (
        <g transform={`translate(${btnX},${colBtnY})`} style={{ cursor:'pointer' }}
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
      {hasDelete && (
        <g transform={`translate(${btnX},${delBtnY})`}
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
  const col = getNodeCol(child);
  const isAns = child.nodeType === 'answer';
  const { d } = treeEdgeGeom(p, q, nodeH(fs), orient);
  return (
    <path d={d} fill="none" stroke={col.border} strokeWidth="2" opacity="0.6"
      strokeDasharray={isAns ? '8,4' : undefined}
      markerEnd={isAns ? undefined : 'url(#arrowhead)'}
    />
  );
}

// ── 関係線（ノード同士を結ぶ実線。矢印は任意）
function LinkLine({ link, pos, fs, orient, selected }) {
  const p = pos.get(link.from), q = pos.get(link.to);
  if (!p || !q) return null;
  const { d } = linkGeom(p, q, nodeH(fs), orient);
  return (
    <path d={d} fill="none" stroke={selected ? '#1677ff' : LINK_COL} strokeWidth={selected ? 2.6 : 1.6}
      markerEnd={link.arrow ? (selected ? 'url(#linkhead-sel)' : 'url(#linkhead)') : undefined}
      style={{ pointerEvents:'none' }}/>
  );
}

// ── 波かっこ（クリックで編集）
function GroupBrace({ group, pos, fs, orient, selected, onClick }) {
  const gg = groupGeom(group, pos, nodeH(fs), fs, orient, DISPLAY_FONT);
  if (!gg) return null;
  const col = selected ? '#1677ff' : GROUP_COL;
  return (
    <g style={{ cursor:'pointer' }} onClick={onClick}>
      <rect x={gg.hit.x} y={gg.hit.y} width={gg.hit.w} height={gg.hit.h} fill="transparent"/>
      <path d={gg.d} fill="none" stroke={col} strokeWidth={selected ? 2.4 : 1.6} strokeLinejoin="round"/>
      {gg.texts.map((o, i) => (
        <text key={i} x={o.x} y={o.y} textAnchor={gg.anchor} fontSize={gg.lfs} fill={selected ? '#0050b3' : '#3a3428'}
          fontFamily={DISPLAY_FONT} style={{ pointerEvents:'none', userSelect:'none' }}>{o.t}</text>
      ))}
    </g>
  );
}

// ── 線に添えるラベル（クリックできるものは onClick を渡す）
function LineLabel({ text, mid, fs, stroke, color, onClick }) {
  const { t, lfs, w, h } = labelBox(text, fs, DISPLAY_FONT);
  return (
    <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <rect x={mid[0]-w/2} y={mid[1]-h/2} width={w} height={h} rx={h/2} fill="#fffdf8" stroke={stroke} strokeWidth="1"/>
      <text x={mid[0]} y={mid[1]+lfs*0.36} textAnchor="middle" fontSize={lfs} fill={color}
        fontFamily={DISPLAY_FONT} style={{ pointerEvents:'none', userSelect:'none' }}>{t}</text>
    </g>
  );
}

function MindMap({ doc, selId, addingToId, markedIds, selLinkId, selGroupId, fs, zoom, orient, picking, onSelect, onOpenAdd, onCollapse, onDelete, onSelectLink, onSelectGroup }) {
  const { root, links, groups } = doc;
  const pos = layoutFor(doc, fs, orient);
  const { w: nw, h: nh2 } = root ? mapBounds(doc, pos, fs, orient) : { w:700, h:500 };
  const svgW = Math.round(nw*zoom), svgH = Math.round(nh2*zoom);
  const edges=[], nodes=[];
  const walk = (n) => {
    nodes.push(n);
    if (n.collapsed) return;
    for (const c of n.children) { edges.push({ parent:n, child:c }); walk(c); }
  };
  if (root) walk(root);

  // ラベルはノードより手前に描く（線がノードの下をくぐっても読めるように）
  const labels = placeLabels(root, links, pos, fs, orient, DISPLAY_FONT).map(o => {
    if (o.edgeOf) {
      const col = getNodeCol(o.edgeOf);
      return <LineLabel key={o.key} text={o.text} mid={o.mid} fs={fs} stroke={col.border} color={col.badge}/>;
    }
    const sel = o.link.id === selLinkId;
    return <LineLabel key={o.key} text={o.text} mid={o.mid} fs={fs}
      stroke={sel ? '#1677ff' : LINK_COL} color={sel ? '#0050b3' : '#3a3428'}
      onClick={e => { e.stopPropagation(); onSelectLink(o.link.id); }}/>;
  });

  return (
    <svg width={svgW} height={svgH}
      style={{ display:'block', minWidth:'100%', minHeight:'100%', background:'#f7f5ef', cursor: picking ? 'crosshair' : 'default' }}>
      <defs>
        <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="1" fill="#cec9bc"/>
        </pattern>
        <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L9,3.5 z" fill="#888" opacity="0.7"/>
        </marker>
        <marker id="linkhead" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L9,3.5 z" fill={LINK_COL}/>
        </marker>
        <marker id="linkhead-sel" markerWidth="9" markerHeight="9" refX="8" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L9,3.5 z" fill="#1677ff"/>
        </marker>
      </defs>
      <rect width={svgW} height={svgH} fill="#f7f5ef"/>
      <rect x="0" y="0" width={svgW} height={svgH} fill="url(#dots)"/>
      <g transform={`scale(${zoom})`}>
        {edges.map((e,i) => <Edge key={i} parent={e.parent} child={e.child} pos={pos} fs={fs} orient={orient}/>)}
        {links.map(l => <LinkLine key={l.id} link={l} pos={pos} fs={fs} orient={orient} selected={l.id === selLinkId}/>)}
        {groups.map(g => <GroupBrace key={g.id} group={g} pos={pos} fs={fs} orient={orient}
          selected={g.id === selGroupId} onClick={e => { e.stopPropagation(); onSelectGroup(g.id); }}/>)}
        {nodes.map(n => <NodeBox key={n.id} node={n} pos={pos} fs={fs}
          selId={selId} addingToId={addingToId} markedIds={markedIds}
          onSelect={onSelect} onOpenAdd={onOpenAdd} onCollapse={onCollapse} onDelete={onDelete}/>)}
        {labels}
      </g>
      {!root && <text x="50%" y="50%" textAnchor="middle" fontSize="15" fill="#bbb" fontFamily={DISPLAY_FONT}>左パネルにトピックを入力してください</text>}
    </svg>
  );
}

// ── マニュアル（アプリ内蔵）
function ManualModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const h2 = { fontSize:'13px', fontWeight:'700', color:'#1a1208', margin:'22px 0 8px', borderBottom:'2px solid #e0dbd0', paddingBottom:'5px' };
  const p = { fontSize:'12px', color:'#3a3428', lineHeight:1.9, margin:'0 0 4px' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,18,8,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ background:'#faf9f5', width:'660px', maxWidth:'92vw', maxHeight:'86vh', borderRadius:'12px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:DISPLAY_FONT }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'15px 22px', borderBottom:'1px solid #e0dbd0', background:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <h1 style={{ fontSize:'15px', fontWeight:'700', color:'#1a1208', margin:0 }}>ハスラーくん マニュアル</h1>
          <button onClick={onClose}
            style={{ width:'28px', height:'28px', border:'1px solid #e0dbd0', borderRadius:'6px', background:'#fff', cursor:'pointer', fontSize:'13px', color:'#7a7060', fontFamily:'inherit' }}>
            ✕
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'4px 24px 22px' }}>
          <p style={h2}>ビリヤード法とは</p>
          <p style={p}>
            論文テーマに「本当に？」「なぜ？」「どういう意味？」など18種類の問いを次々とぶつけ、新しい問いを取り出していく思考法。
            ビリヤードの玉が当たって新たな玉が動くように、問いが問いを生み、「問いのフィールド」を広げていく。
          </p>
          <p style={{ ...p, fontSize:'10.5px', color:'#a89878' }}>出典：戸田山和久（2022）『最新版 論文の教室』138頁</p>

          <p style={h2}>基本の流れ</p>
          <ol style={{ ...p, paddingLeft:'18px' }}>
            <li>左パネルにテーマやキーワードを入力し「開始」(Ctrl+Enterでも可)</li>
            <li>マップ上のノード右端の [+] をクリックして子ノードを追加</li>
            <li>「問い」か「答え」かを選ぶ</li>
            <li>「問い」を選んだ場合は、18種類のカテゴリからぶつける問いを1つ選ぶ</li>
            <li>テキストを書いて「ノードに追加」(Ctrl+Enterでも可)</li>
          </ol>
          <p style={p}>線の意味：問い→問いは色つきの矢印、答えにつながる線は点線、それ以外の関係は灰色の実線(関係線)で表示されます。</p>

          <p style={h2}>ノードの操作</p>
          <p style={p}>
            ノードをクリックすると左パネルに詳細が表示されます。<br/>
            <strong>[+]</strong> 子ノードを追加
            <strong>[▼/▶]</strong> 折りたたみ／展開(子があるノードのみ)
            <strong>[✕]</strong> ノードを削除(ルート以外。<u>確認なしで即削除</u>。間違えたら「元に戻す」で戻せます)<br/>
            左パネルの<strong>「編集」</strong>でテキストを修正、問いノードならカテゴリの変更も可能(Ctrl+Enterで確定)。<br/>
            <strong>「切り替え」</strong>でルート以外のノードの種別(問い⇔答え)を変更できます。
          </p>

          <p style={h2}>元に戻す・やり直す</p>
          <p style={p}>
            左パネル上部の<strong>「元に戻す」</strong>で、直前の操作(ノードの追加・削除・編集・切り替え・折りたたみ、マップ作成中のMermaid読み込み)を取り消せます(Ctrl+Z、Macは⌘+Z)。
            戻しすぎたときは<strong>「やり直す」</strong>で取り消しを取り消せます(Ctrl+Shift+Z または Ctrl+Y)。<br/>
            さかのぼれるのは直近10回分までです。取り消しの履歴も自動保存されるので、ページを再読み込みしたあとでも元に戻せます。リセットは元に戻せません。
          </p>

          <p style={h2}>関係線と線のラベル</p>
          <p style={p}>
            木の形とは別に、好きなノード同士を<strong>関係線</strong>(灰色の実線)で結べます。「関係してそう」「比べてみる」など、線にラベルを付けることもできます。
          </p>
          <ol style={{ ...p, paddingLeft:'18px' }}>
            <li>ノードをクリックして選び、左パネルの<strong>「＋ 関係線を引く」</strong>を押す</li>
            <li>マップ上で、つなぎたい相手のノードをクリック</li>
            <li>ラベル(なくてもOK)と、矢印の「なし／あり」を選んで<strong>「線を引く」</strong></li>
          </ol>
          <p style={p}>
            引いた関係線は、選んだノードの「関係線」の一覧から<strong>編集</strong>・<strong>[✕]削除</strong>できます。マップ上のラベルをクリックしても編集できます。
            同じノード同士・親子のノード・すでに関係線でつながっているノード同士は結べません。途中でやめるときは「やめる」かEscキー。<br/>
            また、ノードの<strong>「編集」</strong>で<strong>「親からの線のラベル」</strong>を入れると、親から伸びる矢印・点線にもラベルを付けられます(例：「起きているとして……」)。
          </p>

          <p style={h2}>波かっこでまとめる</p>
          <p style={p}>
            同じ親から出ている子ノードのうち、並んでいる何個かを<strong>波かっこ(｝)</strong>でまとめて、「他にもありそう」「調べる」などのラベルを付けられます。
            横向きではノードの右側、縦向きではノードの下側に表示されます。
          </p>
          <ol style={{ ...p, paddingLeft:'18px' }}>
            <li>親ノードをクリックして選び、左パネルの<strong>「＋ 子ノードをまとめる」</strong>を押す</li>
            <li>まとめたい子ノードを、左パネルの一覧かマップ上でクリック(間を飛ばさず、続いた範囲にかかります。範囲の端をもう一度クリックすると外れます)</li>
            <li>ラベル(なくてもOK)を入れて<strong>「まとめる」</strong></li>
          </ol>
          <p style={p}>
            作った波かっこは、親ノードの「波かっこ」の一覧、またはマップ上の波かっこをクリックして編集・削除できます。
            1つの子ノードは1つの波かっこにしか入れられません。
          </p>

          <p style={h2}>表示設定</p>
          <p style={p}>
            マップ作成中は左パネル上部で、<strong>文字サイズ</strong>(10〜18px)、
            <strong>拡縮</strong>(30%〜200%、「等倍」ボタンで100%に戻せます)、
            <strong>向き</strong>(↔横 / ↕縦)を調整できます。
          </p>

          <p style={h2}>書き出し・読み込み</p>
          <p style={p}>
            <strong>PNG</strong>：現在のマップ全体を画像として保存します(ダウンロードフォルダに billiard_map.png として保存されます)。<br/>
            <strong>Mermaid</strong>：マップ構造をMermaid記法のテキストとして保存します(ダウンロードフォルダに billiard_map.md として保存されます)。関係線・線のラベル・波かっこも含まれます(Mermaid上では、波かっこは枠囲みとして表示されます)。<br/>
            <strong>「Mermaidを読み込む」</strong>：<u>ハスラーくんで書き出したMermaidファイル(.md/.txt)専用</u>です。
            他のツールで書いた一般的なMermaid図は、ノードや矢印の記法が異なるため読み込めません。<br/>
            <strong>リセット</strong>：マップを消去して最初の入力画面に戻ります(確認のあとで実行されます。<u>自動保存した内容も消え、元に戻すこともできません</u>)。
          </p>

          <p style={h2}>自動保存</p>
          <p style={p}>
            作業内容(マップと文字サイズ・拡縮・向き)は、<strong>このブラウザの中に自動で保存</strong>されます。
            ページを再読み込みしたり、タブを閉じて開き直したりしても、続きから作業できます。保存した内容が外部に送信されることはありません。
          </p>
          <p style={{ ...p, marginTop:'10px', padding:'10px 12px', background:'#fff0f0', border:'1px solid #f0c0c0', borderRadius:'7px', color:'#8a2020' }}>
            ⚠ 自動保存はあくまで「うっかり」への保険です。別の端末・別のブラウザには引き継がれず、ブラウザの閲覧データを消したり、ゲストモードを終了したりすると消えます。
            作業内容を確実に残したい場合は、PNGまたはMermaidで書き出してください。
          </p>

          <p style={h2}>18種類の問い</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 16px' }}>
            {CATEGORIES.map(c => (
              <div key={c.q} style={{ fontSize:'11px', lineHeight:1.8, color:'#3a3428' }}>
                <strong style={{ color:'#1a1208' }}>{c.q}</strong>
                <span style={{ color:'#a89878' }}>［{c.cat}］</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [phase, setPhase]         = useState(SAVED ? 'mapping' : 'input');
  const [input, setInput]         = useState('');
  const [doc, setDoc]             = useState(SAVED ? { root: SAVED.root, links: SAVED.links, groups: SAVED.groups } : EMPTY_DOC);
  const { root, links, groups } = doc;
  const [selId, setSelId]         = useState(null);
  const [addingToId, setAddingToId] = useState(null);
  const [selCat, setSelCat]       = useState(null);
  const [newNodeType, setNewNodeType] = useState('question');
  const [inputText, setInputText] = useState('');
  const [fontSize, setFontSize]   = useState(SAVED?.fontSize ?? 13);
  const [zoom, setZoom]           = useState(SAVED?.zoom ?? 1.0);
  const [orient, setOrient]       = useState(SAVED?.orient ?? 'landscape');
  const [confirmReset, setConfirmReset] = useState(false);

  // ── 元に戻す／やり直す（マップの変更履歴。表示設定は対象外。履歴も自動保存される）
  const [hist, setHist] = useState({ past: SAVED?.past ?? [], future: SAVED?.future ?? [] });

  // マップ・履歴・表示設定が変わるたびに自動保存（root が null ＝リセット後は保存データも消す）
  useEffect(() => {
    writeSaved(root ? { root, links, groups, past: hist.past, future: hist.future, fontSize, zoom, orient } : null);
  }, [root, links, groups, hist, fontSize, zoom, orient]);

  // マップを変更するときは必ずここを通す（変更前の状態を履歴に積む）
  const commit = (next) => {
    if (root) setHist(h => ({ past: [...h.past.slice(-(HISTORY_MAX - 1)), doc], future: [] }));
    setDoc(pruneDoc(next));
  };
  const commitRoot = (nextRoot) => commit({ ...doc, root: nextRoot });
  const clearHistory = () => setHist({ past: [], future: [] });
  const [exporting, setExporting] = useState(null);
  const [importErr, setImportErr] = useState(null);
  const fileInputRef = useRef(null);
  const fileInputRef2 = useRef(null);

  // ── 関係線の作成・編集中の状態
  //   { from, to, label, arrow, editId, err }  to が null の間は「相手ノードをクリックで選ぶ」段階
  const [linkDraft, setLinkDraft] = useState(null);
  // ── 波かっこの作成・編集中の状態 { parentId, childIds, label, editId, err }
  const [groupDraft, setGroupDraft] = useState(null);

  const handleImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseMermaid(text);
      if (!parsed) { setImportErr('読み込みに失敗しました。ハスラーくんで書き出したMermaidファイルを選択してください。'); return; }
      // マップ作成中の読み込みは「元に戻す」で読み込み前に戻せる。入力画面からの読み込みは新しい履歴の始まり
      if (root) commit(parsed); else { clearHistory(); setDoc(parsed); }
      setPhase('mapping'); setSelId(null);
      setAddingToId(null); setSelCat(null); setInputText(''); setLinkDraft(null); setGroupDraft(null);
      setImportErr(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const [rightOpen, setRightOpen] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);

  const selNode = selId ? findNode(root, selId) : null;
  const addingNode = addingToId ? findNode(root, addingToId) : null;
  const selLinks = selId ? links.filter(l => l.from === selId || l.to === selId) : [];
  const selGroups = selId ? groups.filter(g => g.parentId === selId) : [];

  const handleStart = () => {
    if (!input.trim()) return;
    clearHistory(); setDoc({ ...EMPTY_DOC, root: mkNode(input.trim()) }); setPhase('mapping');
  };

  // 関係線：相手ノードを選ぶ。同じノード・親子・既存の関係線はつながない
  const pickLinkTarget = (id) => {
    const { from } = linkDraft;
    const err =
      id === from ? '同じノード同士はつなげません。別のノードをクリックしてください。'
      : isParentChild(root, from, id) ? 'この2つはすでに木の線（矢印・点線）でつながっています。別のノードをクリックしてください。'
      : links.some(l => l.id !== linkDraft.editId && ((l.from === from && l.to === id) || (l.from === id && l.to === from))) ? 'この2つはすでに関係線でつながっています。別のノードをクリックしてください。'
      : null;
    setLinkDraft(d => err ? { ...d, err } : { ...d, to: id, err: null });
  };
  const handleSelect = (id) => {
    if (linkDraft && !linkDraft.to) { pickLinkTarget(id); return; }
    if (groupDraft && findNode(root, groupDraft.parentId)?.children.some(c => c.id === id)) { toggleGroupChild(id); return; }
    setLinkDraft(null); setGroupDraft(null);
    setSelId(id);
    if (addingToId !== id) { setAddingToId(null); setSelCat(null); setInputText(''); setNewNodeType('question'); }
  };
  // [+] → 常に追加パネルを開く
  const handleOpenAdd = (id) => {
    setLinkDraft(null); setGroupDraft(null);
    setAddingToId(id); setSelId(id); setSelCat(null); setInputText(''); setNewNodeType('question');
  };
  // [▼/▶] → 折りたたみトグル
  const handleCollapse = (id) => {
    commitRoot(toggleCollapse(root, id));
  };
  const handleDelete = (id) => {
    commitRoot(removeNode(root, id));
    if (selId === id) setSelId(null);
    if (addingToId === id) { setAddingToId(null); setSelCat(null); setInputText(''); }
    if (linkDraft && (linkDraft.from === id || linkDraft.to === id)) setLinkDraft(null);
    if (groupDraft) setGroupDraft(null);
  };
  const handleToggleType = (id) => commitRoot(toggleNodeType(root, id));

  // ── 編集
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState('');
  const [editCat, setEditCat]     = useState(null);
  const [editEdgeLabel, setEditEdgeLabel] = useState('');
  const handleStartEdit = (id) => {
    const node = findNode(root, id); if (!node) return;
    setEditingId(id); setEditText(node.text); setEditCat(null); setEditEdgeLabel(node.edgeLabel ?? '');
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
        // 親から伸びる線のラベル（空なら消す）
        if (editEdgeLabel.trim()) updated.edgeLabel = editEdgeLabel.trim(); else delete updated.edgeLabel;
        return updated;
      }
      return { ...n, children: n.children.map(clone) };
    };
    commitRoot(clone(root));
    setEditingId(null); setEditText(''); setEditCat(null); setEditEdgeLabel('');
  };
  const handleCancelEdit = () => { setEditingId(null); setEditText(''); setEditCat(null); setEditEdgeLabel(''); };

  // ── 関係線の操作
  const handleStartLink = (fromId) => {
    setGroupDraft(null);
    setAddingToId(null); setSelCat(null); setInputText('');
    setEditingId(null);
    setLinkDraft({ from: fromId, to: null, label: '', arrow: false, editId: null, err: null });
  };
  const handleEditLink = (id) => {
    const l = links.find(x => x.id === id); if (!l) return;
    setGroupDraft(null);
    setAddingToId(null); setSelCat(null); setInputText('');
    setEditingId(null);
    setLinkDraft({ from: l.from, to: l.to, label: l.label ?? '', arrow: !!l.arrow, editId: id, err: null });
  };
  const handleSaveLink = () => {
    if (!linkDraft?.to) return;
    const { from, to, arrow, editId } = linkDraft;
    const label = linkDraft.label.trim();
    commit({ ...doc, links: editId
      ? links.map(l => l.id === editId ? { ...l, from, to, label, arrow } : l)
      : [...links, { id: uid(), from, to, label, arrow }] });
    setLinkDraft(null);
  };
  const handleDeleteLink = (id) => {
    commit({ ...doc, links: links.filter(l => l.id !== id) });
    if (linkDraft?.editId === id) setLinkDraft(null);
  };

  // ── 波かっこの操作（同じ親の子ノードの、連続した範囲だけをまとめる）
  const handleStartGroup = (parentId) => {
    setLinkDraft(null); setAddingToId(null); setSelCat(null); setInputText(''); setEditingId(null);
    setGroupDraft({ parentId, childIds: [], label: '', editId: null, err: null });
  };
  const handleEditGroup = (id) => {
    const g = groups.find(x => x.id === id); if (!g) return;
    setLinkDraft(null); setAddingToId(null); setSelCat(null); setInputText(''); setEditingId(null);
    setSelId(g.parentId);
    setGroupDraft({ parentId: g.parentId, childIds: g.childIds, label: g.label ?? '', editId: id, err: null });
  };
  // 子をクリック：範囲の外なら範囲を広げ、範囲の端なら外す。まん中だけは外せない
  const toggleGroupChild = (childId) => {
    setGroupDraft(d => {
      const kids = findNode(root, d.parentId)?.children.map(c => c.id) ?? [];
      const idx = kids.indexOf(childId); if (idx < 0) return d;
      const cur = d.childIds.map(id => kids.indexOf(id)).filter(i => i >= 0);
      let lo = cur.length ? Math.min(...cur) : idx, hi = cur.length ? Math.max(...cur) : idx;
      if (!cur.length || idx < lo || idx > hi) { lo = Math.min(lo, idx); hi = Math.max(hi, idx); }
      else if (lo === hi) return { ...d, childIds: [], err: null };
      else if (idx === lo) lo++;
      else if (idx === hi) hi--;
      else return { ...d, err: 'まん中のノードだけを外すことはできません。波かっこは、上から下まで（縦向きなら左から右まで）続いた範囲にかかります。' };
      const next = kids.slice(lo, hi + 1);
      const taken = groups.filter(g => g.id !== d.editId).flatMap(g => g.childIds);
      if (next.some(id => taken.includes(id)))
        return { ...d, err: '別の波かっこでまとめているノードと重なってしまいます。範囲を選び直してください。' };
      return { ...d, childIds: next, err: null };
    });
  };
  const handleSaveGroup = () => {
    if (!groupDraft?.childIds.length) return;
    const { parentId, childIds, editId } = groupDraft;
    const label = groupDraft.label.trim();
    commit({ ...doc, groups: editId
      ? groups.map(g => g.id === editId ? { ...g, childIds, label } : g)
      : [...groups, { id: uid(), parentId, childIds, label }] });
    setGroupDraft(null);
  };
  const handleDeleteGroup = (id) => {
    commit({ ...doc, groups: groups.filter(g => g.id !== id) });
    if (groupDraft?.editId === id) setGroupDraft(null);
  };

  const travel = (from) => {
    if (!hist[from].length) return;
    const target = from === 'past' ? hist.past[hist.past.length - 1] : hist.future[0];
    setHist(from === 'past'
      ? { past: hist.past.slice(0, -1), future: [doc, ...hist.future] }
      : { past: [...hist.past, doc], future: hist.future.slice(1) });
    setDoc(target);
    // 戻した先に存在しないノードを選択・追加・編集中なら解除
    if (!findNode(target.root, selId)) setSelId(null);
    if (!findNode(target.root, addingToId)) { setAddingToId(null); setSelCat(null); setInputText(''); }
    setEditingId(null); setEditText(''); setEditCat(null); setEditEdgeLabel('');
    setLinkDraft(null); setGroupDraft(null);
  };
  const handleUndo = () => travel('past');
  const handleRedo = () => travel('future');

  // Ctrl+Z（Macは⌘+Z）で元に戻す、Ctrl+Shift+Z / Ctrl+Y でやり直す。文字入力中はブラウザ標準の取り消しに任せる
  // Esc で関係線の作成・編集をやめる
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && (linkDraft || groupDraft) && !manualOpen) { setLinkDraft(null); setGroupDraft(null); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target.closest?.('textarea, input')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    commitRoot(addChild(root, addingToId, child));
    setInputText('');
    if (newNodeType === 'question') setSelCat(null);
  };
  const handleCancelAdd = () => { setAddingToId(null); setSelCat(null); setInputText(''); setNewNodeType('question'); };

  const doExportPNG = () => {
    const built = buildExportSVG(doc, fontSize, zoom, orient); if (!built) return;
    const { svg: str, width: W, height: H } = built;
    setExporting('png');
    setTimeout(() => {
      try {
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
    const str = buildMermaid(doc, orient); if (!str) return;
    setExporting('md');
    downloadBlob(new Blob([str],{type:'text/markdown;charset=utf-8'}),'billiard_map.md');
    setTimeout(()=>setExporting(null),400);
  };

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
    <>
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:DISPLAY_FONT, background:'#f7f5ef' }}>

      <div style={{ width:'250px', minWidth:'250px', background:'#faf9f5', borderRight:bdr, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        <div style={{ padding:'18px 20px', borderBottom:bdr, background:'#fff' }}>
          <p style={{ fontSize:'9px', color:'#a89878', letterSpacing:'0.18em', margin:'0 0 4px', fontFamily:'monospace' }}>「問いのフィールド」作成ツール</p>
          <h1 style={{ fontSize:'15px', fontWeight:'700', color:'#1a1208', margin:0, lineHeight:1.5 }}>
            ハスラーくん
            <span style={{ display:'block', fontSize:'11px', fontWeight:'400', color:'#7a7060', marginTop:'5px', lineHeight:1.6 }}>ビリヤード法にレッツ・チャレンジ！</span>
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
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'11px', color:'#7a7060', whiteSpace:'nowrap' }}>操作</span>
              {[['元に戻す', handleUndo, hist.past.length, 'Ctrl+Z（Macは⌘+Z）'],
                ['やり直す', handleRedo, hist.future.length, 'Ctrl+Shift+Z / Ctrl+Y']].map(([label, fn, n, key]) => (
                <button key={label} onClick={fn} disabled={!n} title={key}
                  style={{ flex:1, padding:'4px', fontSize:'11px', fontWeight:'600', fontFamily:'inherit', borderRadius:'5px', border:bdr,
                    background:'#fff', color: n ? '#1a1208' : '#c8c0b0', cursor: n ? 'pointer' : 'not-allowed' }}>
                  {label}
                </button>
              ))}
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

        ) : linkDraft ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'11px 13px' }}>
              <p style={{ fontSize:'9.5px', color:'#a89878', fontFamily:'monospace', margin:'0 0 8px', letterSpacing:'0.1em' }}>
                {linkDraft.editId ? '関係線を編集' : '関係線を引く'}
              </p>
              {[['つなぐノード①', linkDraft.from], ['つなぐノード②', linkDraft.to]].map(([cap, id], i) => (
                <div key={cap}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'0 0 3px' }}>
                    <span style={{ fontSize:'10px', color:'#7a7060', fontWeight:'600' }}>{cap}</span>
                    {i === 1 && id && (
                      <button onClick={()=>setLinkDraft(d => ({ ...d, to: null, err: null }))}
                        style={{ fontSize:'10px', color:'#7a7060', border:bdr, borderRadius:'5px', background:'#fff', cursor:'pointer', padding:'1px 7px', fontFamily:'inherit' }}>
                        選び直す
                      </button>
                    )}
                  </div>
                  <div style={{ padding:'7px 10px', borderRadius:'6px', fontSize:'11.5px', lineHeight:1.6,
                    background: id ? '#fff' : '#fffbf0', border: id ? bdr : '1.5px dashed #d48806', color: id ? '#1a1208' : '#8a6800' }}>
                    {id ? findNode(root, id)?.text : 'マップ上で、つなぎたい相手のノードをクリックしてください'}
                  </div>
                  {i === 0 && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', margin:'4px 0', fontSize:'11px', color:'#7a7060' }}>
                      <span>{linkDraft.arrow ? '▼ 矢印の向き' : '｜ 矢印なし'}</span>
                      {linkDraft.arrow && linkDraft.to && (
                        <button onClick={()=>setLinkDraft(d => ({ ...d, from: d.to, to: d.from }))}
                          style={{ fontSize:'10px', color:'#7a7060', border:bdr, borderRadius:'5px', background:'#fff', cursor:'pointer', padding:'1px 7px', fontFamily:'inherit' }}>
                          向きを逆にする
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {linkDraft.err && <p style={{ fontSize:'10.5px', color:'#c41a1a', margin:'8px 0 0', lineHeight:1.6 }}>{linkDraft.err}</p>}

              {linkDraft.to && (
                <>
                  <p style={{ fontSize:'10px', color:'#7a7060', margin:'14px 0 5px', fontWeight:'600' }}>線のラベル（なくてもOK）</p>
                  <input value={linkDraft.label} maxLength={40} autoFocus
                    onChange={e=>setLinkDraft(d => ({ ...d, label: e.target.value }))}
                    onKeyDown={e=>e.key==='Enter'&&!e.nativeEvent.isComposing&&handleSaveLink()}
                    placeholder="例：関係してそう、比べてみる"
                    style={{ background:'#fff', border:bdr, borderRadius:'6px', padding:'7px 10px', color:'#1a1208', fontSize:'12px', width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'12px' }}/>
                  <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 5px', fontWeight:'600' }}>矢印</p>
                  <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                    {[[false, 'なし ―'], [true, 'あり →']].map(([v, label]) => (
                      <button key={label} onClick={()=>setLinkDraft(d => ({ ...d, arrow: v }))}
                        style={{ flex:1, padding:'6px 4px', fontSize:'11.5px', fontWeight:'600', fontFamily:'inherit', cursor:'pointer', borderRadius:'6px',
                          background: linkDraft.arrow === v ? '#1a1208' : '#fff', color: linkDraft.arrow === v ? '#fff' : '#5a5040',
                          border: linkDraft.arrow === v ? 'none' : bdr }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSaveLink}
                    style={{ width:'100%', background:'#1a1208', color:'#fff', border:'none', borderRadius:'7px', padding:'9px', fontSize:'12px', cursor:'pointer', fontWeight:'700', fontFamily:'inherit', marginBottom:'6px' }}>
                    {linkDraft.editId ? '保存する' : '線を引く'}
                  </button>
                  {linkDraft.editId && (
                    <button onClick={()=>handleDeleteLink(linkDraft.editId)}
                      style={{ width:'100%', background:'#fff', color:'#c41a1a', border:'1px solid #f0c0c0', borderRadius:'7px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                      この関係線を削除
                    </button>
                  )}
                </>
              )}
            </div>

            <div style={{ padding:'10px 13px', borderTop:bdr, background:'#faf9f5' }}>
              <button onClick={()=>setLinkDraft(null)}
                style={{ width:'100%', background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                やめる（Esc）
              </button>
            </div>
          </div>

        ) : groupDraft ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'11px 13px' }}>
              <p style={{ fontSize:'9.5px', color:'#a89878', fontFamily:'monospace', margin:'0 0 8px', letterSpacing:'0.1em' }}>
                {groupDraft.editId ? '波かっこを編集' : '子ノードを波かっこでまとめる'}
              </p>
              <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 3px', fontWeight:'600' }}>親ノード</p>
              <div style={{ padding:'7px 10px', borderRadius:'6px', fontSize:'11.5px', lineHeight:1.6, background:'#fff', border:bdr, color:'#1a1208', marginBottom:'10px' }}>
                {findNode(root, groupDraft.parentId)?.text}
              </div>
              <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 3px', fontWeight:'600' }}>まとめる子ノード</p>
              <p style={{ fontSize:'10px', color:'#a89878', margin:'0 0 6px', lineHeight:1.6 }}>
                ここかマップ上でクリックして選びます。間を飛ばさず、続いた範囲にかかります。
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                {(findNode(root, groupDraft.parentId)?.children ?? []).map(c => {
                  const on = groupDraft.childIds.includes(c.id);
                  const other = groups.some(g => g.id !== groupDraft.editId && g.childIds.includes(c.id));
                  return (
                    <button key={c.id} onClick={()=>toggleGroupChild(c.id)}
                      style={{ display:'flex', alignItems:'center', gap:'6px', textAlign:'left', padding:'5px 8px', borderRadius:'5px', cursor:'pointer', fontFamily:'inherit',
                        background: on ? '#1a1208' : '#fff', color: on ? '#fff' : other ? '#b0a890' : '#1a1208',
                        border: on ? '1px solid #1a1208' : bdr, fontSize:'11px', lineHeight:1.5 }}>
                      <span style={{ flexShrink:0 }}>{on ? '☑' : '☐'}</span>
                      <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.text}</span>
                      {other && <span style={{ flexShrink:0, fontSize:'9.5px' }}>別の波かっこ</span>}
                    </button>
                  );
                })}
              </div>
              {groupDraft.err && <p style={{ fontSize:'10.5px', color:'#c41a1a', margin:'8px 0 0', lineHeight:1.6 }}>{groupDraft.err}</p>}

              <p style={{ fontSize:'10px', color:'#7a7060', margin:'14px 0 5px', fontWeight:'600' }}>波かっこのラベル（なくてもOK）</p>
              <input value={groupDraft.label} maxLength={40}
                onChange={e=>setGroupDraft(d => ({ ...d, label: e.target.value }))}
                onKeyDown={e=>e.key==='Enter'&&!e.nativeEvent.isComposing&&handleSaveGroup()}
                placeholder="例：他にもありそう、調べる"
                style={{ background:'#fff', border:bdr, borderRadius:'6px', padding:'7px 10px', color:'#1a1208', fontSize:'12px', width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'12px' }}/>
              <button onClick={handleSaveGroup} disabled={!groupDraft.childIds.length}
                style={{ width:'100%', background: groupDraft.childIds.length ? '#1a1208' : '#e0dbd0', color: groupDraft.childIds.length ? '#fff' : '#a89878', border:'none', borderRadius:'7px', padding:'9px', fontSize:'12px', cursor: groupDraft.childIds.length ? 'pointer' : 'not-allowed', fontWeight:'700', fontFamily:'inherit', marginBottom:'6px' }}>
                {groupDraft.editId ? '保存する' : 'まとめる'}
              </button>
              {groupDraft.editId && (
                <button onClick={()=>handleDeleteGroup(groupDraft.editId)}
                  style={{ width:'100%', background:'#fff', color:'#c41a1a', border:'1px solid #f0c0c0', borderRadius:'7px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                  この波かっこを削除
                </button>
              )}
            </div>

            <div style={{ padding:'10px 13px', borderTop:bdr, background:'#faf9f5' }}>
              <button onClick={()=>setGroupDraft(null)}
                style={{ width:'100%', background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                やめる（Esc）
              </button>
            </div>
          </div>

        ) : (
          <>
            <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
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
                    {selNode.depth > 0 && (
                      <>
                        <p style={{ fontSize:'10px', color:'#7a7060', margin:'0 0 5px', fontWeight:'600' }}>親からの線のラベル（なくてもOK）</p>
                        <input value={editEdgeLabel} maxLength={40} onChange={e=>setEditEdgeLabel(e.target.value)}
                          onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&handleCommitEdit()}
                          placeholder="例：起きているとして……"
                          style={{ background:'#fff', border:bdr, borderRadius:'6px', padding:'7px 10px', color:'#1a1208', fontSize:'12px', width:'100%', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'7px' }}/>
                      </>
                    )}
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
                {editingId !== selId && (
                  <>
                    {selNode.edgeLabel && (
                      <p style={{ fontSize:'10.5px', color:'#7a7060', margin:'6px 0 0', lineHeight:1.6 }}>
                        親からの線のラベル：<strong style={{ color:'#1a1208', fontWeight:'600' }}>{selNode.edgeLabel}</strong>
                      </p>
                    )}
                    <div style={{ marginTop:'9px', paddingTop:'8px', borderTop:'1px dashed #e0dbd0' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px' }}>
                        <span style={{ fontSize:'10px', color:'#7a7060', fontWeight:'600' }}>関係線{selLinks.length ? `（${selLinks.length}本）` : ''}</span>
                        <button onClick={()=>handleStartLink(selId)}
                          style={{ fontSize:'10px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'5px', background:'#e6f4ff', cursor:'pointer', padding:'2px 8px', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          ＋ 関係線を引く
                        </button>
                      </div>
                      {selLinks.length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'4px', maxHeight:'120px', overflowY:'auto' }}>
                          {selLinks.map(l => {
                            const other = findNode(root, l.from === selId ? l.to : l.from);
                            const dir = !l.arrow ? '―' : (l.from === selId ? '→' : '←');
                            return (
                              <div key={l.id} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'4px 6px', background:'#faf9f5', border:bdr, borderRadius:'5px', fontSize:'10.5px' }}>
                                <span style={{ color:'#7a7060', flexShrink:0 }}>{dir}</span>
                                <span title={other?.text} style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#1a1208' }}>
                                  {other?.text}{l.label && <span style={{ color:'#a89878' }}>（{l.label}）</span>}
                                </span>
                                <button onClick={()=>handleEditLink(l.id)}
                                  style={{ flexShrink:0, fontSize:'9.5px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'4px', background:'#e6f4ff', cursor:'pointer', padding:'1px 5px', fontFamily:'inherit' }}>
                                  編集
                                </button>
                                <button onClick={()=>handleDeleteLink(l.id)} title="この関係線を削除"
                                  style={{ flexShrink:0, fontSize:'10px', color:'#999', border:'1px solid #ddd', borderRadius:'4px', background:'#fff', cursor:'pointer', padding:'0 5px', fontFamily:'inherit' }}>
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {selNode.children.length > 0 && (
                      <div style={{ marginTop:'9px', paddingTop:'8px', borderTop:'1px dashed #e0dbd0' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'6px', marginBottom:'5px' }}>
                          <span style={{ fontSize:'10px', color:'#7a7060', fontWeight:'600', whiteSpace:'nowrap' }}>波かっこ{selGroups.length ? `（${selGroups.length}）` : ''}</span>
                          <button onClick={()=>handleStartGroup(selId)}
                            style={{ fontSize:'10px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'5px', background:'#e6f4ff', cursor:'pointer', padding:'2px 8px', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                            ＋ 子ノードをまとめる
                          </button>
                        </div>
                        {selGroups.map(g => (
                          <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'4px 6px', marginBottom:'4px', background:'#faf9f5', border:bdr, borderRadius:'5px', fontSize:'10.5px' }}>
                            <span style={{ color:'#7a7060', flexShrink:0 }}>｝</span>
                            <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#1a1208' }}>
                              {g.label || '（ラベルなし）'}<span style={{ color:'#a89878' }}>・{g.childIds.length}個</span>
                            </span>
                            <button onClick={()=>handleEditGroup(g.id)}
                              style={{ flexShrink:0, fontSize:'9.5px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'4px', background:'#e6f4ff', cursor:'pointer', padding:'1px 5px', fontFamily:'inherit' }}>
                              編集
                            </button>
                            <button onClick={()=>handleDeleteGroup(g.id)} title="この波かっこを削除"
                              style={{ flexShrink:0, fontSize:'10px', color:'#999', border:'1px solid #ddd', borderRadius:'4px', background:'#fff', cursor:'pointer', padding:'0 5px', fontFamily:'inherit' }}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div style={{ padding:'14px 16px' }}>
              <div style={{ padding:'12px 14px', background:'#fffcf0', border:'1px solid #e8d070', borderRadius:'7px', fontSize:'11px', color:'#5a4810', lineHeight:2.1 }}>
                <strong style={{ color:'#8a6800', display:'block', marginBottom:'4px' }}>操作方法</strong>
                <span style={{ color:'#888' }}>[+]</span> 子ノードを追加<br/>
                <span style={{ color:'#888' }}>[▼/▶]</span> 折りたたみ／展開<br/>
                <span style={{ color:'#888' }}>[✕]</span> ノードを削除<br/>
                <span style={{ color:'#888' }}>切り替え</span> 問い↔答えを変更<br/>
                <span style={{ color:'#888' }}>元に戻す</span> 直前の操作を取消<br/>
                <span style={{ color:'#888' }}>関係線</span> ノードを選んで「＋関係線を引く」<br/>
                <span style={{ color:'#888' }}>波かっこ</span> 親を選んで「＋子ノードをまとめる」<br/>
                <span style={{ display:'block', marginTop:'6px', paddingTop:'6px', borderTop:'1px solid #e8d070' }}>
                  <span style={{ color:'#888' }}>編集</span> テキストを修正<br/>
                  　問いノードは種類も変更可<br/>
                  　Ctrl+Enter で確定
                </span>
              </div>
            </div>
            </div>
            <div style={{ padding:'10px 13px', borderTop:bdr, background:'#faf9f5' }}>
              <p style={{ fontSize:'9.5px', color:'#a89878', margin:'0 0 6px', fontFamily:'monospace', letterSpacing:'0.1em' }}>書き出し・読み込み</p>
              <div style={{ display:'flex', gap:'5px', marginBottom:'5px' }}>
                <button onClick={doExportPNG} disabled={!!exporting} style={btnS(exporting==='png')}>{exporting==='png'?'処理中…':'PNG'}</button>
                <button onClick={doExportMermaid} disabled={!!exporting} style={btnS(exporting==='md')}>{exporting==='md'?'処理中…':'Mermaid'}</button>
              </div>
              <input ref={fileInputRef2} type="file" accept=".md,.txt"
                onChange={handleImport} style={{ display:'none' }}/>
              <button onClick={()=>fileInputRef2.current?.click()}
                style={{ width:'100%', background:'#fff', color:'#1677ff', border:'1px solid #91caff', borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit', fontWeight:'600', marginBottom:'5px' }}>
                Mermaidを読み込む
              </button>
              {importErr && <p style={{ fontSize:'10px', color:'#c41a1a', margin:'0 0 5px', lineHeight:1.6 }}>{importErr}</p>}
              {confirmReset ? (
                <div style={{ padding:'8px 10px', background:'#fff0f0', border:'1px solid #f0c0c0', borderRadius:'6px' }}>
                  <p style={{ fontSize:'10.5px', color:'#8a2020', margin:'0 0 7px', lineHeight:1.7 }}>
                    マップを消去して最初に戻します。自動保存した内容も消え、元に戻せません。よろしいですか？
                  </p>
                  <div style={{ display:'flex', gap:'5px' }}>
                    <button onClick={()=>{ setPhase('input'); setDoc(EMPTY_DOC); clearHistory(); setLinkDraft(null); setGroupDraft(null); setSelId(null); setAddingToId(null); setSelCat(null); setInputText(''); setZoom(1.0); setConfirmReset(false); }}
                      style={{ flex:1, background:'#c41a1a', color:'#fff', border:'none', borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit', fontWeight:'700' }}>
                      リセットする
                    </button>
                    <button onClick={()=>setConfirmReset(false)}
                      style={{ flex:1, background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setConfirmReset(true)}
                  style={{ width:'100%', background:'#fff', color:'#7a7060', border:bdr, borderRadius:'6px', padding:'7px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>
                  リセット
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ flex:1, overflow:'auto' }}>
        <MindMap doc={doc} selId={linkDraft?.to ?? selId} addingToId={addingToId ?? linkDraft?.from ?? groupDraft?.parentId}
          markedIds={groupDraft?.childIds} selLinkId={linkDraft?.editId} selGroupId={groupDraft?.editId}
          picking={!!linkDraft && !linkDraft.to} onSelectLink={handleEditLink} onSelectGroup={handleEditGroup}
          fs={fontSize} zoom={zoom} orient={orient}
          onSelect={handleSelect} onOpenAdd={handleOpenAdd} onCollapse={handleCollapse} onDelete={handleDelete}/>
      </div>

      {/* 右ペイン：折りたたみ可能 */}
      <div style={{ width: rightOpen ? '260px' : '32px', minWidth: rightOpen ? '260px' : '32px', background:'#faf9f5', borderLeft:bdr, display:'flex', flexDirection:'column', overflow:'hidden', transition:'width 0.2s, min-width 0.2s' }}>
        <div style={{ padding: rightOpen ? '13px 15px' : '13px 0', borderBottom:bdr, background:'#fff', display:'flex', alignItems:'center', justifyContent: rightOpen ? 'space-between' : 'center', gap:'8px' }}>
          {rightOpen && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0 }}>
              <p style={{ fontSize:'12px', fontWeight:'700', color:'#1a1208', margin:0, whiteSpace:'nowrap' }}>使い方</p>
              <button onClick={() => setManualOpen(true)}
                style={{ fontSize:'10px', color:'#1677ff', border:'1px solid #91caff', borderRadius:'5px', background:'#e6f4ff', padding:'2px 8px', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                マニュアル
              </button>
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
                問い→答え：点線（……）<br/>
                その他の関係：灰色の線（―）<br/>
                子のまとまり：波かっこ（｝）
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
    {manualOpen && <ManualModal onClose={() => setManualOpen(false)} />}
    </>
  );
}
