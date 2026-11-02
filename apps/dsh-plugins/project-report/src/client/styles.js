/**
 * 样式注入：把插件所需 CSS 注入 document.head，并在插件卸载时移除。
 * 采用 dpr- 前缀避免污染宿主样式；颜色尽量使用 currentColor / 半透明灰阶以兼容明暗主题。
 */

/** 插件样式文本。 */
const CSS = `
.dpr-root { display:flex; flex-direction:column; height:100%; min-height:0; color:inherit; font-size:13px; }
.dpr-header { display:flex; align-items:center; gap:12px; padding:14px 18px 10px; border-bottom:1px solid rgba(127,127,127,.18); }
.dpr-title { font-size:16px; font-weight:600; margin:0; }
.dpr-sub { font-size:12px; opacity:.6; }
.dpr-spacer { flex:1; }
.dpr-tabs { display:inline-flex; background:rgba(127,127,127,.1); border-radius:8px; padding:2px; gap:2px; }
.dpr-tab { border:0; background:transparent; color:inherit; padding:5px 14px; border-radius:6px; cursor:pointer; font-size:13px; }
.dpr-tab.active { background:rgba(127,127,127,.22); font-weight:600; }
.dpr-filters { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; padding:12px 18px; }
.dpr-field { display:flex; flex-direction:column; gap:4px; }
.dpr-field > label { font-size:11px; opacity:.6; }
.dpr-input, .dpr-select { height:30px; padding:0 8px; border:1px solid rgba(127,127,127,.3); border-radius:6px; background:transparent; color:inherit; font-size:13px; }
.dpr-input[type="date"] { min-width:140px; }
.dpr-input.grow { flex:1; min-width:180px; }
.dpr-btn { height:30px; padding:0 12px; border-radius:6px; border:1px solid rgba(127,127,127,.3); background:transparent; color:inherit; cursor:pointer; font-size:13px; }
.dpr-btn:hover { background:rgba(127,127,127,.1); }
.dpr-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.dpr-btn.primary:hover { background:#1d4ed8; }
.dpr-btn.danger { color:#dc2626; border-color:rgba(220,38,38,.4); }
.dpr-btn:disabled { opacity:.5; cursor:not-allowed; }
.dpr-tablewrap { flex:1; min-height:0; overflow:auto; padding:0 18px; }
.dpr-table { width:100%; border-collapse:collapse; }
.dpr-table th, .dpr-table td { text-align:left; padding:8px 10px; border-bottom:1px solid rgba(127,127,127,.12); vertical-align:top; }
.dpr-table th { position:sticky; top:0; background:var(--dpr-bg, Canvas); backdrop-filter:blur(4px); z-index:1; font-weight:600; font-size:12px; opacity:.85; white-space:nowrap; }
.dpr-table tbody tr { cursor:pointer; }
.dpr-table tbody tr:hover { background:rgba(127,127,127,.07); }
.dpr-cell-ellipsis { max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dpr-pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; border:1px solid rgba(127,127,127,.3); white-space:nowrap; }
.dpr-pill.ok { color:#16a34a; border-color:rgba(22,163,74,.4); }
.dpr-pill.warn { color:#d97706; border-color:rgba(217,119,6,.4); }
.dpr-footer { display:flex; align-items:center; gap:10px; padding:10px 18px; border-top:1px solid rgba(127,127,127,.18); }
.dpr-empty { padding:40px; text-align:center; opacity:.6; }
.dpr-errorbar { margin:0 18px 8px; padding:8px 12px; border-radius:8px; background:rgba(220,38,38,.1); color:#dc2626; font-size:12px; }
.dpr-loading { padding:24px; text-align:center; opacity:.6; }
.dpr-overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:9999; }
.dpr-modal { background:var(--dpr-bg, Canvas); color:inherit; border-radius:12px; width:min(760px,92vw); max-height:88vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.35); border:1px solid rgba(127,127,127,.25); }
.dpr-modal-head { display:flex; align-items:center; gap:8px; padding:14px 18px; border-bottom:1px solid rgba(127,127,127,.18); }
.dpr-modal-title { font-size:15px; font-weight:600; margin:0; }
.dpr-modal-body { padding:16px 18px; overflow:auto; }
.dpr-modal-foot { display:flex; justify-content:flex-end; gap:10px; padding:12px 18px; border-top:1px solid rgba(127,127,127,.18); }
.dpr-dl { display:grid; grid-template-columns:96px 1fr; gap:8px 14px; }
.dpr-dl dt { opacity:.6; font-size:12px; }
.dpr-dl dd { margin:0; white-space:pre-wrap; word-break:break-word; }
.dpr-form { display:grid; grid-template-columns:1fr 1fr; gap:12px 16px; }
.dpr-form .full { grid-column:1 / -1; }
.dpr-form label { font-size:12px; opacity:.7; display:block; margin-bottom:4px; }
.dpr-form textarea, .dpr-form input, .dpr-form select { width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid rgba(127,127,127,.3); border-radius:6px; background:transparent; color:inherit; font-size:13px; font-family:inherit; }
.dpr-form textarea { min-height:76px; resize:vertical; }
.dpr-hint { font-size:12px; opacity:.6; margin:0 0 10px; }
.dpr-warn { color:#d97706; font-size:12px; margin-top:6px; }
.dpr-toast { position:fixed; left:50%; top:20px; transform:translateX(-50%); background:#16a34a; color:#fff; padding:8px 16px; border-radius:8px; z-index:10000; font-size:13px; }
.dpr-toast.err { background:#dc2626; }
`

/**
 * 注入样式并返回清理函数。
 * @returns {()=>void} 清理函数
 */
export function installStyles() {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-project-report'
  style.textContent = CSS
  document.head.append(style)
  return () => {
    try { style.remove() } catch { /* 忽略 */ }
  }
}
